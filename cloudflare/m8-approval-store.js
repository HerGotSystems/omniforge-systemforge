function canonical(value){
  if(Array.isArray(value)) return value.map(canonical);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  }
  return value;
}

function hex(buffer){
  return [...new Uint8Array(buffer)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

export async function digestM8ApprovalRequest({toolId,task,input}={}){
  if(!toolId) throw new Error('M8_APPROVAL_TOOL_REQUIRED');
  const payload=JSON.stringify(canonical({toolId:String(toolId),task:String(task||''),input:input??null}));
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload));
  return hex(digest);
}

export function approvalPreview({toolId,input}={}){
  const safe={toolId:String(toolId||'')};
  if(input&&typeof input==='object'){
    for(const [key,value] of Object.entries(input)){
      if(/body|content|message|subject|title|to|repo|path|event/i.test(key)){
        safe[key]=typeof value==='string'?value.slice(0,240):value;
      }
    }
  }
  return safe;
}

export async function createPendingApproval(db,{
  workspaceId,userId,toolId,requestDigest,preview={},
  ttlSeconds=600
}={}){
  if(!db?.prepare) throw new Error('M8_APPROVAL_DB_REQUIRED');
  if(!workspaceId||!userId||!toolId||!requestDigest) throw new Error('M8_APPROVAL_SCOPE_REQUIRED');

  const existing=await db.prepare(`
    SELECT id,status,expires_at
    FROM m8_tool_approvals
    WHERE workspace_id=? AND user_id=? AND tool_id=? AND request_digest=?
      AND status IN ('pending','approved')
      AND expires_at>CURRENT_TIMESTAMP
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(workspaceId,userId,toolId,requestDigest).first();

  if(existing) return {id:existing.id,status:existing.status,expiresAt:existing.expires_at,reused:true};

  const id=crypto.randomUUID();
  const expiresAt=new Date(Date.now()+Math.max(60,Number(ttlSeconds)||600)*1000).toISOString();
  await db.prepare(`
    INSERT INTO m8_tool_approvals(
      id,workspace_id,user_id,tool_id,request_digest,preview_json,status,expires_at
    ) VALUES(?,?,?,?,?,?,'pending',?)
  `).bind(
    id,workspaceId,userId,toolId,requestDigest,JSON.stringify(preview||{}),expiresAt
  ).run();

  return {id,status:'pending',expiresAt,reused:false};
}

export async function listPendingApprovals(db,{workspaceId,userId}={}){
  if(!db?.prepare) throw new Error('M8_APPROVAL_DB_REQUIRED');
  if(!workspaceId||!userId) throw new Error('M8_APPROVAL_SCOPE_REQUIRED');

  await db.prepare(`
    UPDATE m8_tool_approvals
    SET status='expired'
    WHERE workspace_id=? AND user_id=? AND status IN ('pending','approved')
      AND expires_at<=CURRENT_TIMESTAMP
  `).bind(workspaceId,userId).run();

  const result=await db.prepare(`
    SELECT id,tool_id,request_digest,preview_json,status,expires_at,created_at,decided_at
    FROM m8_tool_approvals
    WHERE workspace_id=? AND user_id=? AND status IN ('pending','approved')
    ORDER BY created_at DESC
  `).bind(workspaceId,userId).all();

  return (result?.results||[]).map(row=>({
    id:row.id,
    toolId:row.tool_id,
    requestDigest:row.request_digest,
    preview:JSON.parse(row.preview_json||'{}'),
    status:row.status,
    expiresAt:row.expires_at,
    createdAt:row.created_at,
    decidedAt:row.decided_at
  }));
}

export async function decideApproval(db,{id,workspaceId,userId,decision}={}){
  if(!db?.prepare) throw new Error('M8_APPROVAL_DB_REQUIRED');
  if(!id||!workspaceId||!userId) throw new Error('M8_APPROVAL_SCOPE_REQUIRED');
  if(!['approved','denied'].includes(decision)) throw new Error('M8_APPROVAL_DECISION_INVALID');

  const result=await db.prepare(`
    UPDATE m8_tool_approvals
    SET status=?,decided_at=CURRENT_TIMESTAMP
    WHERE id=? AND workspace_id=? AND user_id=? AND status='pending'
      AND expires_at>CURRENT_TIMESTAMP
  `).bind(decision,id,workspaceId,userId).run();

  if(!result?.meta?.changes) throw new Error('M8_APPROVAL_NOT_PENDING');
  return {id,status:decision};
}

export async function resolveApprovedTools(db,{
  ids=[],workspaceId,userId,requests={}
}={}){
  if(!db?.prepare) throw new Error('M8_APPROVAL_DB_REQUIRED');
  if(!workspaceId||!userId) throw new Error('M8_APPROVAL_SCOPE_REQUIRED');
  const unique=[...new Set((ids||[]).map(String).filter(Boolean))];
  if(!unique.length) return {approvedTools:[],approvalIds:[]};

  const approvedTools=[];
  const approvalIds=[];
  const resolved=[];

  for(const id of unique){
    const row=await db.prepare(`
      SELECT id,tool_id,request_digest,status,expires_at
      FROM m8_tool_approvals
      WHERE id=? AND workspace_id=? AND user_id=?
      LIMIT 1
    `).bind(id,workspaceId,userId).first();

    if(!row||row.status!=='approved'||row.expires_at<=new Date().toISOString()) continue;
    const expected=requests[row.tool_id];
    if(!expected||expected!==row.request_digest) continue;

    approvedTools.push(row.tool_id);
    approvalIds.push(row.id);
    resolved.push({id:row.id,toolId:row.tool_id});
  }

  return {
    approvedTools:[...new Set(approvedTools)],
    approvalIds,
    resolved
  };
}

export async function consumeApprovals(db,{ids=[],workspaceId,userId}={}){
  if(!db?.prepare) throw new Error('M8_APPROVAL_DB_REQUIRED');
  if(!workspaceId||!userId) throw new Error('M8_APPROVAL_SCOPE_REQUIRED');
  for(const id of [...new Set((ids||[]).map(String).filter(Boolean))]){
    await db.prepare(`
      UPDATE m8_tool_approvals
      SET status='consumed',consumed_at=CURRENT_TIMESTAMP
      WHERE id=? AND workspace_id=? AND user_id=? AND status='approved'
    `).bind(id,workspaceId,userId).run();
  }
}
