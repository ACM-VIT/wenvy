CREATE TABLE IF NOT EXISTS rotation_jobs (
  id text PRIMARY KEY,
  scope_type text NOT NULL CHECK (scope_type IN ('team', 'repo')),
  scope_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  checkpoint text NOT NULL CHECK (
    checkpoint IN (
      'queued',
      'key_generated',
      'envelopes_wrapped',
      'repo_keys_rewrapped',
      'old_key_retired',
      'completed'
    )
  ),
  progress_detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  workflow_instance_id text,
  queue_message_id text,
  started_at timestamptz,
  finished_at timestamptz,
  error_summary text,
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS rotation_jobs_scope_status_idx
  ON rotation_jobs (scope_type, scope_id, status);

CREATE INDEX IF NOT EXISTS rotation_jobs_updated_at_idx
  ON rotation_jobs (updated_at DESC);
