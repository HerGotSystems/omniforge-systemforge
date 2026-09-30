import {
  resolveM8Access,
  principalFromM8Access,
  getMonthlyM8Usage,
  assertM8UsageAllowed,
  usageFromM8Response,
  recordM8Usage,
  recordM8RunAudit
} from './m8-access-store.js';
import {
  digestM8ApprovalRequest,
  approvalPreview,
  createPendingApproval,
  listPendingApprovals,
  decideApproval,
  resolveApprovedTools,
  consumeApprovals
} from './m8-approval-store.js';

const PREFIX='/api/m8';

function json(body,status=200,headers={}){
  return new Response(JSON.stringify(body),{
    status,
    headers:{'content-type':'application/json',...headers}
  });
}

function deny(code,status=403){
  return json({ok:false,error:{code,message:code}},status);
}

async function requestBodyJson(request){
  if(!['POST','PUT','PATCH'].includes(request.method)) return null;
  try{return await request.clone().json();}catch{return null;}
}

async function approvalDigests(runBody){
  const task=String(runBody?.task||'');
  const requested=Array.isArray(runBody?.planOptions?.requestedTools)
    ? runBody.planOptions.requestedTools.map(String)
    : [];
  const toolInputs=runBody?.executionOptions?.toolInputs||{};
  const map={};
  for(const toolId of requested){
    map[toolId]=await digestM8ApprovalRequest({
      toolId,
      task,
      input:toolInputs?.[toolId]??null
    });
  }
  return map;
}

function approvalAction(pathname){
  const match=/^\/api\/m8\/approvals\/([^/]+)\/(approve|deny)$/.exec(pathname);
  return match?{id:decodeURIComponent(match[1]),decision:match[2]==='approve'?'approved':'denied'}:null;
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);

    if(!url.pathname.startsWith(PREFIX)){
      return env.ASSETS.fetch(request);
    }

    const email=String(request.headers.get('cf-access-authenticated-user-email')||'').trim();
    if(!email) return deny('ACCESS_IDENTITY_REQUIRED',401);

    try{
      const requestedWorkspace=String(request.headers.get('x-m8-workspace')||'').trim()||null;
      const access=await resolveM8Access(env.DB,email,{workspaceId:requestedWorkspace});
      const principal=principalFromM8Access(access);
      const usage=await getMonthlyM8Usage(env.DB,{
        workspaceId:access.workspaceId,
        userId:access.userId
      });

      if(request.method==='GET'&&url.pathname.endsWith('/access')){
        return json({
          ok:true,
          access:{
            userId:access.userId,
            email:access.email,
            workspaceId:access.workspaceId,
            workspaceSlug:access.workspaceSlug,
            workspaceName:access.workspaceName,
            plan:access.plan,
            role:access.role,
            memoryMode:access.memoryMode,
            allowedTools:access.allowedTools,
            limits:access.limits,
            usage
          }
        });
      }

      if(request.method==='GET'&&url.pathname===`${PREFIX}/approvals`){
        return json({
          ok:true,
          approvals:await listPendingApprovals(env.DB,{
            workspaceId:access.workspaceId,
            userId:access.userId
          })
        });
      }

      const action=approvalAction(url.pathname);
      if(request.method==='POST'&&action){
        const result=await decideApproval(env.DB,{
          id:action.id,
          workspaceId:access.workspaceId,
          userId:access.userId,
          decision:action.decision
        });
        return json({ok:true,approval:result});
      }

      if(!env.M8?.fetch) return deny('M8_BINDING_UNAVAILABLE',503);

      let runBody=null;
      let digests={};
      let resolvedApprovals={approvedTools:[],approvalIds:[],resolved:[]};

      if(request.method==='POST'&&url.pathname.endsWith('/run')){
        assertM8UsageAllowed(access,usage);
        runBody=await requestBodyJson(request);
        digests=await approvalDigests(runBody);
        resolvedApprovals=await resolveApprovedTools(env.DB,{
          ids:Array.isArray(runBody?.approvalIds)?runBody.approvalIds:[],
          workspaceId:access.workspaceId,
          userId:access.userId,
          requests:digests
        });
      }

      const target=new URL(url.pathname+url.search,'https://m8.internal');
      const headers=new Headers(request.headers);
      for(const key of [
        'x-m8-user-id','x-m8-tenant-id','x-m8-roles','x-m8-tools',
        'x-m8-approved-tools','x-m8-service-secret'
      ]){
        headers.delete(key);
      }
      headers.set('x-m8-service-secret',env.M8_SERVICE_SECRET);
      headers.set('x-m8-user-id',principal.userId);
      headers.set('x-m8-tenant-id',principal.tenantId);
      headers.set('x-m8-roles',principal.roles.join(','));
      headers.set('x-m8-tools',principal.allowedTools.join(','));
      if(resolvedApprovals.approvedTools.length){
        headers.set('x-m8-approved-tools',resolvedApprovals.approvedTools.join(','));
      }

      const response=await env.M8.fetch(new Request(target,{
        method:request.method,
        headers,
        body:['GET','HEAD'].includes(request.method)?null:request.body,
        redirect:'manual'
      }));

      if(request.method!=='POST'||!url.pathname.endsWith('/run')){
        return response;
      }

      let payload;
      try{payload=await response.clone().json();}
      catch{return response;}

      const toolResults=payload?.run?.result?.toolResults||[];
      const pending=[];

      for(const toolResult of toolResults){
        if(toolResult?.status!=='approval_required') continue;
        const toolId=String(toolResult.tool||'');
        if(!toolId||!digests[toolId]) continue;
        const input=runBody?.executionOptions?.toolInputs?.[toolId]??null;
        const created=await createPendingApproval(env.DB,{
          workspaceId:access.workspaceId,
          userId:access.userId,
          toolId,
          requestDigest:digests[toolId],
          preview:approvalPreview({toolId,input})
        });
        pending.push({...created,toolId,preview:approvalPreview({toolId,input})});
      }

      if(pending.length){
        payload.approvals=pending;
      }

      const completedTools=new Set(
        toolResults.filter(x=>x?.status==='completed'&&x?.receipt?.completed===true).map(x=>x.tool)
      );
      const consumedIds=resolvedApprovals.resolved
        .filter(x=>completedTools.has(x.toolId))
        .map(x=>x.id);

      if(consumedIds.length){
        await consumeApprovals(env.DB,{
          ids:consumedIds,
          workspaceId:access.workspaceId,
          userId:access.userId
        });
      }

      ctx.waitUntil((async()=>{
        try{
          const measured=usageFromM8Response(payload);
          await recordM8Usage(env.DB,{
            workspaceId:access.workspaceId,
            userId:access.userId,
            ...measured
          });
          const runId=String(payload?.requestId||crypto.randomUUID());
          await recordM8RunAudit(env.DB,{
            runId,
            requestId:payload?.requestId||null,
            workspaceId:access.workspaceId,
            userId:access.userId,
            status:response.ok?'completed':'failed',
            providerCalls:measured.providerCalls,
            inputTokens:measured.inputTokens,
            outputTokens:measured.outputTokens,
            costMicros:measured.costMicros
          });
        }catch(error){
          console.error('M8_USAGE_ACCOUNTING_FAILED',error);
        }
      })());

      const forwardedHeaders={};
      const requestId=response.headers.get('x-request-id');
      if(requestId) forwardedHeaders['x-request-id']=requestId;
      return json(payload,response.status,forwardedHeaders);
    }catch(error){
      const code=String(error?.message||error).split(':')[0];
      const status=
        code==='M8_USAGE_LIMIT'?429:
        code==='M8_APPROVAL_NOT_PENDING'?409:
        code==='M8_APPROVAL_DECISION_INVALID'?400:
        code==='M8_ACCESS_DENIED'?403:
        403;
      return deny(code,status);
    }
  }
};
