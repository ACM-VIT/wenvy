CREATE TABLE IF NOT EXISTS service_accounts (
  id text PRIMARY KEY,
  organization_id text,
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'suspended', 'revoked')),
  created_by text,
  created_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS service_account_tokens (
  id text PRIMARY KEY,
  service_account_id text NOT NULL REFERENCES service_accounts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  scope_type text NOT NULL CHECK (scope_type IN ('repo')),
  scope_id text NOT NULL,
  allowed_branches jsonb NOT NULL,
  capabilities text NOT NULL CHECK (capabilities IN ('pull_only', 'push_and_pull')),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL,
  CHECK (jsonb_typeof(allowed_branches) = 'array')
);

CREATE INDEX IF NOT EXISTS service_account_tokens_scope_idx
  ON service_account_tokens (scope_type, scope_id, service_account_id);

CREATE INDEX IF NOT EXISTS service_account_tokens_active_lookup_idx
  ON service_account_tokens (service_account_id, revoked_at);
