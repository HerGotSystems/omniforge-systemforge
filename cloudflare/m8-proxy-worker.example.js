const M8_PREFIX='/api/m8';

function m8Request(request,env){
  const accessEmail=String(request.headers.get('cf-access-authenticated-user-email')||'').trim();
  if(!accessEmail) return null;

  const original=new URL(request.url);
  const target=new URL(original.pathname+original.search,'https://m8.internal');
  const headers=new Headers(request.headers);

  // Never trust identity/authorization claims supplied by browser JavaScript.
  headers.delete('x-m8-user-id');
  headers.delete('x-m8-tenant-id');
  headers.delete('x-m8-roles');
  headers.delete('x-m8-tools');
  headers.delete('x-m8-approved-tools');
  headers.delete('x-m8-service-secret');

  headers.set('x-m8-service-secret',env.M8_SERVICE_SECRET);
  headers.set('x-m8-user-id',accessEmail);
  headers.set('x-m8-tenant-id',env.M8_TENANT_ID||'omniforge-owner');
  headers.set('x-m8-roles',env.M8_ROLES||'owner,tester');
  headers.set('x-m8-tools',env.M8_ALLOWED_TOOLS||'');

  return new Request(target,{
    method:request.method,
    headers,
    body:['GET','HEAD'].includes(request.method)?null:request.body,
    redirect:'manual'
  });
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);

    if(url.pathname.startsWith(M8_PREFIX)){
      if(!env.M8?.fetch) return new Response('M8 binding unavailable',{status:503});

      const internal=m8Request(request,env);
      if(!internal) return new Response(JSON.stringify({
        ok:false,
        error:{code:'ACCESS_IDENTITY_REQUIRED',message:'M8 Lab requires an authenticated Cloudflare Access session.'}
      }),{status:401,headers:{'content-type':'application/json'}});

      return env.M8.fetch(internal);
    }

    return env.ASSETS.fetch(request);
  }
};
