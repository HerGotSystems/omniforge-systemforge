import {
  resolveM8Access,
  principalFromM8Access,
  getMonthlyM8Usage,
  assertM8UsageAllowed
} from './m8-access-store.js';

const PREFIX='/api/m8';

function deny(code,status=403){
  return new Response(JSON.stringify({ok:false,error:{code,message:code}}),{
    status,
    headers:{'content-type':'application/json'}
  });
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);

    if(!url.pathname.startsWith(PREFIX)){
      return env.ASSETS.fetch(request);
    }
    if(!env.M8?.fetch) return deny('M8_BINDING_UNAVAILABLE',503);

    const email=String(request.headers.get('cf-access-authenticated-user-email')||'').trim();
    if(!email) return deny('ACCESS_IDENTITY_REQUIRED',401);

    try{
      const requestedWorkspace=String(request.headers.get('x-m8-workspace')||'').trim()||null;
      const access=await resolveM8Access(env.DB,email,{workspaceId:requestedWorkspace});
      const principal=principalFromM8Access(access);

      if(request.method==='POST'&&url.pathname.endsWith('/run')){
        const usage=await getMonthlyM8Usage(env.DB,{
          workspaceId:access.workspaceId,
          userId:access.userId
        });
        assertM8UsageAllowed(access,usage);
      }

      const target=new URL(url.pathname+url.search,'https://m8.internal');
      const headers=new Headers(request.headers);
      for(const key of ['x-m8-user-id','x-m8-tenant-id','x-m8-roles','x-m8-tools','x-m8-service-secret']){
        headers.delete(key);
      }
      headers.set('x-m8-service-secret',env.M8_SERVICE_SECRET);
      headers.set('x-m8-user-id',principal.userId);
      headers.set('x-m8-tenant-id',principal.tenantId);
      headers.set('x-m8-roles',principal.roles.join(','));
      headers.set('x-m8-tools',principal.allowedTools.join(','));

      return env.M8.fetch(new Request(target,{
        method:request.method,
        headers,
        body:['GET','HEAD'].includes(request.method)?null:request.body,
        redirect:'manual'
      }));
    }catch(error){
      const code=String(error?.message||error).split(':')[0];
      const status=code==='M8_USAGE_LIMIT'?429:code==='M8_ACCESS_DENIED'?403:403;
      return deny(code,status);
    }
  }
};
