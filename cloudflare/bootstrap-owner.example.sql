-- Replace every REPLACE_* value before applying.
-- This is intentionally not a migration because owner identity is deployment-specific.

INSERT INTO m8_users(id,email,status)
VALUES('REPLACE_OWNER_USER_ID','REPLACE_OWNER_EMAIL','active');

INSERT INTO m8_workspaces(id,slug,name,plan,status)
VALUES('REPLACE_OWNER_WORKSPACE_ID','owner','M8 Owner Lab','owner','active');

INSERT INTO m8_memberships(workspace_id,user_id,role,status)
VALUES('REPLACE_OWNER_WORKSPACE_ID','REPLACE_OWNER_USER_ID','owner','active');

INSERT INTO m8_entitlements(
  workspace_id,
  hosted_enabled,
  monthly_run_limit,
  monthly_provider_call_limit,
  monthly_cost_limit_micros,
  max_task_chars,
  allowed_tools_json,
  memory_mode
) VALUES(
  'REPLACE_OWNER_WORKSPACE_ID',
  1,
  100,
  500,
  10000000,
  12000,
  '[]',
  'session'
);
