PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS m8_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','suspended','disabled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS m8_workspaces (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'owner'
    CHECK (plan IN ('owner','tester','beta','free','hosted','team')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','suspended','closed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS m8_memberships (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('owner','admin','tester','member','user')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','invited','suspended')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id,user_id),
  FOREIGN KEY (workspace_id) REFERENCES m8_workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES m8_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS m8_entitlements (
  workspace_id TEXT PRIMARY KEY,
  hosted_enabled INTEGER NOT NULL DEFAULT 0 CHECK (hosted_enabled IN (0,1)),
  monthly_run_limit INTEGER NOT NULL DEFAULT 0 CHECK (monthly_run_limit >= 0),
  monthly_provider_call_limit INTEGER NOT NULL DEFAULT 0 CHECK (monthly_provider_call_limit >= 0),
  monthly_cost_limit_micros INTEGER NOT NULL DEFAULT 0 CHECK (monthly_cost_limit_micros >= 0),
  max_task_chars INTEGER NOT NULL DEFAULT 12000 CHECK (max_task_chars > 0),
  allowed_tools_json TEXT NOT NULL DEFAULT '[]',
  memory_mode TEXT NOT NULL DEFAULT 'session'
    CHECK (memory_mode IN ('off','session','personal','workspace')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES m8_workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS m8_usage_daily (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  runs INTEGER NOT NULL DEFAULT 0,
  provider_calls INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_micros INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id,user_id,day),
  FOREIGN KEY (workspace_id) REFERENCES m8_workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES m8_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS m8_run_audit (
  run_id TEXT PRIMARY KEY,
  request_id TEXT,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('started','completed','failed','denied')),
  provider_calls INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_micros INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES m8_workspaces(id),
  FOREIGN KEY (user_id) REFERENCES m8_users(id)
);

CREATE INDEX IF NOT EXISTS idx_m8_memberships_user ON m8_memberships(user_id,status);
CREATE INDEX IF NOT EXISTS idx_m8_usage_workspace_day ON m8_usage_daily(workspace_id,day);
CREATE INDEX IF NOT EXISTS idx_m8_run_audit_workspace_created ON m8_run_audit(workspace_id,created_at);
