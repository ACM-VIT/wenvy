CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY,
  organization_id uuid,
  actor_user_id uuid,
  actor_service_account_id uuid,
  actor_type text NOT NULL CHECK (actor_type IN ('user', 'service_account', 'github_app', 'system')),
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  result text NOT NULL CHECK (result IN ('success', 'denied', 'failed')),
  ip_address inet,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_events_organization_created_at_idx
  ON audit_events (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_actor_user_created_at_idx
  ON audit_events (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_target_idx
  ON audit_events (target_type, target_id);
