PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS m8_tool_approvals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  preview_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','denied','consumed','expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at TEXT,
  consumed_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES m8_workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES m8_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_m8_tool_approvals_scope
  ON m8_tool_approvals(workspace_id,user_id,status,created_at);

CREATE INDEX IF NOT EXISTS idx_m8_tool_approvals_digest
  ON m8_tool_approvals(workspace_id,user_id,tool_id,request_digest,status);
