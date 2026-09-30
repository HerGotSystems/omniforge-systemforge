function emailKey(value){
  return String(value||'').trim().toLowerCase();
}

function parseTools(value){
  try{
    const parsed=JSON.parse(value||'[]');
    return Array.isArray(parsed)?[...new Set(parsed.map(String))]:[];
  }catch{
    return [];
  }
}

export function monthBounds(date=new Date()){
  const y=date.getUTCFullYear();
  const m=date.getUTCMonth();
  const start=new Date(Date.UTC(y,m,1)).toISOString().slice(0,10);
  const end=new Date(Date.UTC(y,m+1,1)).toISOString().slice(0,10);
  return {start,end};
}

export async function listM8AccessForEmail(db,email){
  if(!db?.prepare) throw new Error('M8_ACCESS_DB_REQUIRED');
  const key=emailKey(email);
  if(!key) throw new Error('M8_ACCESS_EMAIL_REQUIRED');

  const result=await db.prepare(`
    SELECT
      u.id AS user_id,
      u.email,
      u.status AS user_status,
      w.id AS workspace_id,
      w.slug AS workspace_slug,
      w.name AS workspace_name,
      w.plan,
      w.status AS workspace_status,
      m.role,
      m.status AS membership_status,
      e.hosted_enabled,
      e.monthly_run_limit,
      e.monthly_provider_call_limit,
      e.monthly_cost_limit_micros,
      e.max_task_chars,
      e.allowed_tools_json,
      e.memory_mode
    FROM m8_users u
    JOIN m8_memberships m ON m.user_id=u.id
    JOIN m8_workspaces w ON w.id=m.workspace_id
    LEFT JOIN m8_entitlements e ON e.workspace_id=w.id
    WHERE lower(u.email)=?
      AND u.status='active'
      AND m.status='active'
      AND w.status='active'
    ORDER BY
      CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'tester' THEN 2 ELSE 3 END,
      w.created_at ASC
  `).bind(key).all();

  return (result?.results||[]).map(row=>({
    userId:row.user_id,
    email:row.email,
    workspaceId:row.workspace_id,
    workspaceSlug:row.workspace_slug,
    workspaceName:row.workspace_name,
    plan:row.plan,
    role:row.role,
    hostedEnabled:Boolean(row.hosted_enabled),
    limits:{
      monthlyRuns:Number(row.monthly_run_limit||0),
      monthlyProviderCalls:Number(row.monthly_provider_call_limit||0),
      monthlyCostMicros:Number(row.monthly_cost_limit_micros||0),
      maxTaskChars:Number(row.max_task_chars||12000)
    },
    allowedTools:parseTools(row.allowed_tools_json),
    memoryMode:row.memory_mode||'session'
  }));
}

export async function resolveM8Access(db,email,{workspaceId=null}={}){
  const choices=await listM8AccessForEmail(db,email);
  if(!choices.length) throw new Error('M8_ACCESS_DENIED');
  const selected=workspaceId
    ? choices.find(x=>x.workspaceId===workspaceId)
    : choices[0];
  if(!selected) throw new Error('M8_WORKSPACE_FORBIDDEN');
  if(!selected.hostedEnabled) throw new Error('M8_HOSTED_DISABLED');
  return selected;
}

export function principalFromM8Access(access){
  if(!access?.userId||!access?.workspaceId) throw new Error('M8_ACCESS_RECORD_INVALID');
  return {
    userId:access.userId,
    tenantId:access.workspaceId,
    roles:[access.role,access.plan].filter(Boolean),
    allowedTools:[...(access.allowedTools||[])]
  };
}

export async function getMonthlyM8Usage(db,{workspaceId,userId,date=new Date()}={}){
  if(!db?.prepare) throw new Error('M8_ACCESS_DB_REQUIRED');
  if(!workspaceId||!userId) throw new Error('M8_USAGE_SCOPE_REQUIRED');
  const {start,end}=monthBounds(date);
  const row=await db.prepare(`
    SELECT
      COALESCE(SUM(runs),0) AS runs,
      COALESCE(SUM(provider_calls),0) AS provider_calls,
      COALESCE(SUM(input_tokens),0) AS input_tokens,
      COALESCE(SUM(output_tokens),0) AS output_tokens,
      COALESCE(SUM(cost_micros),0) AS cost_micros
    FROM m8_usage_daily
    WHERE workspace_id=? AND user_id=? AND day>=? AND day<?
  `).bind(workspaceId,userId,start,end).first();

  return {
    period:{start,end},
    runs:Number(row?.runs||0),
    providerCalls:Number(row?.provider_calls||0),
    inputTokens:Number(row?.input_tokens||0),
    outputTokens:Number(row?.output_tokens||0),
    costMicros:Number(row?.cost_micros||0)
  };
}

export function assertM8UsageAllowed(access,usage){
  const limits=access?.limits||{};
  const failures=[];
  if(limits.monthlyRuns>0 && usage.runs>=limits.monthlyRuns) failures.push('monthlyRuns');
  if(limits.monthlyProviderCalls>0 && usage.providerCalls>=limits.monthlyProviderCalls) failures.push('monthlyProviderCalls');
  if(limits.monthlyCostMicros>0 && usage.costMicros>=limits.monthlyCostMicros) failures.push('monthlyCost');
  if(failures.length) throw new Error(`M8_USAGE_LIMIT:${failures.join(',')}`);
  return true;
}

export async function recordM8Usage(db,{
  workspaceId,userId,day=new Date().toISOString().slice(0,10),
  runs=0,providerCalls=0,inputTokens=0,outputTokens=0,costMicros=0
}={}){
  if(!db?.prepare) throw new Error('M8_ACCESS_DB_REQUIRED');
  if(!workspaceId||!userId) throw new Error('M8_USAGE_SCOPE_REQUIRED');
  await db.prepare(`
    INSERT INTO m8_usage_daily(
      workspace_id,user_id,day,runs,provider_calls,input_tokens,output_tokens,cost_micros,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(workspace_id,user_id,day) DO UPDATE SET
      runs=runs+excluded.runs,
      provider_calls=provider_calls+excluded.provider_calls,
      input_tokens=input_tokens+excluded.input_tokens,
      output_tokens=output_tokens+excluded.output_tokens,
      cost_micros=cost_micros+excluded.cost_micros,
      updated_at=CURRENT_TIMESTAMP
  `).bind(
    workspaceId,userId,day,
    Math.max(0,Number(runs)||0),
    Math.max(0,Number(providerCalls)||0),
    Math.max(0,Number(inputTokens)||0),
    Math.max(0,Number(outputTokens)||0),
    Math.max(0,Number(costMicros)||0)
  ).run();
}


export function usageFromM8Response(payload){
  const receipts=payload?.run?.result?.audit?.providerReceipts||[];
  let inputTokens=0,outputTokens=0,costMicros=0;
  for(const receipt of receipts){
    const usage=receipt?.usage||{};
    inputTokens+=Number(usage.inputTokens||usage.input_tokens||usage.prompt_tokens||0)||0;
    outputTokens+=Number(usage.outputTokens||usage.output_tokens||usage.completion_tokens||0)||0;
    const costUsd=Number(receipt?.metadata?.costUsd??receipt?.metadata?.cost_usd??0);
    if(Number.isFinite(costUsd)&&costUsd>0) costMicros+=Math.round(costUsd*1_000_000);
  }
  return {
    runs:payload?.ok===true?1:0,
    providerCalls:receipts.length,
    inputTokens,
    outputTokens,
    costMicros
  };
}

export async function recordM8RunAudit(db,{
  runId,requestId=null,workspaceId,userId,status='completed',
  providerCalls=0,inputTokens=0,outputTokens=0,costMicros=0
}={}){
  if(!db?.prepare) throw new Error('M8_ACCESS_DB_REQUIRED');
  if(!runId||!workspaceId||!userId) throw new Error('M8_RUN_AUDIT_SCOPE_REQUIRED');
  await db.prepare(`
    INSERT INTO m8_run_audit(
      run_id,request_id,workspace_id,user_id,status,
      provider_calls,input_tokens,output_tokens,cost_micros,completed_at
    ) VALUES(?,?,?,?,?,?,?,?,?,CASE WHEN ? IN ('completed','failed','denied') THEN CURRENT_TIMESTAMP ELSE NULL END)
    ON CONFLICT(run_id) DO UPDATE SET
      status=excluded.status,
      provider_calls=excluded.provider_calls,
      input_tokens=excluded.input_tokens,
      output_tokens=excluded.output_tokens,
      cost_micros=excluded.cost_micros,
      completed_at=excluded.completed_at
  `).bind(
    runId,requestId,workspaceId,userId,status,
    Math.max(0,Number(providerCalls)||0),
    Math.max(0,Number(inputTokens)||0),
    Math.max(0,Number(outputTokens)||0),
    Math.max(0,Number(costMicros)||0),
    status
  ).run();
}
