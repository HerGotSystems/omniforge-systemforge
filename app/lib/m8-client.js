export class M8Client {
  constructor({baseUrl='/api/m8',token=null,fetchImpl=globalThis.fetch}={}){
    if(typeof fetchImpl!=='function') throw new Error('M8_FETCH_REQUIRED');
    this.baseUrl=String(baseUrl).replace(/\/$/,'');
    this.token=token;
    this.fetchImpl=fetchImpl;
  }

  setBaseUrl(value){
    this.baseUrl=String(value||'/api/m8').trim().replace(/\/$/,'')||'/api/m8';
  }

  setToken(value){
    this.token=String(value||'').trim()||null;
  }

  async health(){
    return this.#request('/health',{method:'GET'});
  }

  async access(){
    return this.#request('/access',{method:'GET'});
  }

  async meta(){
    return this.#request('/meta',{method:'GET'});
  }

  async plan(task,{requestedTools=[]}={}){
    return this.#request('/plan',{
      method:'POST',
      body:{task,planOptions:{requestedTools}}
    });
  }

  async run(task,{requestedTools=[],feedback=null,notes=null,persist=false,idempotencyKey=null}={}){
    return this.#request('/run',{
      method:'POST',
      idempotencyKey:idempotencyKey||globalThis.crypto?.randomUUID?.()||`m8-${Date.now()}`,
      body:{
        task,
        planOptions:{requestedTools},
        feedback,
        notes,
        persist
      }
    });
  }

  async #request(path,{method='GET',body=null,idempotencyKey=null}={}){
    const headers={'accept':'application/json'};
    if(body!==null) headers['content-type']='application/json';
    if(this.token) headers.authorization=`Bearer ${this.token}`;
    if(idempotencyKey) headers['idempotency-key']=idempotencyKey;
    const response=await this.fetchImpl(`${this.baseUrl}${path}`,{
      method,
      headers,
      credentials:'include',
      ...(body===null?{}:{body:JSON.stringify(body)})
    });
    let payload;
    try{payload=await response.json();}
    catch{payload={ok:false,error:{code:'INVALID_JSON_RESPONSE',message:'Server returned non-JSON response'}};}
    if(!response.ok){
      const error=new Error(payload?.error?.code||`HTTP_${response.status}`);
      error.status=response.status;
      error.payload=payload;
      throw error;
    }
    return payload;
  }
}
