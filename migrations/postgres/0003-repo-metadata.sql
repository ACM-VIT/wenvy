CREATE TABLE IF NOT EXISTS commits (
  id text PRIMARY KEY,
  repo_id text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS branches (
  repo_id text NOT NULL,
  name text NOT NULL,
  head_commit_id text REFERENCES commits(id),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (repo_id, name)
);

CREATE TABLE IF NOT EXISTS commit_parents (
  commit_id text NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
  parent_commit_id text NOT NULL REFERENCES commits(id) ON DELETE RESTRICT,
  PRIMARY KEY (commit_id, parent_commit_id)
);

CREATE TABLE IF NOT EXISTS blobs (
  id text PRIMARY KEY,
  storage_backend text NOT NULL CHECK (storage_backend IN ('r2')),
  storage_key text NOT NULL UNIQUE,
  ciphertext_sha256 text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes >= 0),
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshots (
  commit_id text PRIMARY KEY REFERENCES commits(id) ON DELETE CASCADE,
  blob_id text NOT NULL REFERENCES blobs(id) ON DELETE RESTRICT,
  repo_key_version integer NOT NULL CHECK (repo_key_version > 0),
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS repo_push_idempotency (
  repo_id text NOT NULL,
  branch_name text NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'finalized')),
  expected_head text,
  commit_id text NOT NULL,
  payload_fingerprint text NOT NULL,
  created_at timestamptz NOT NULL,
  finalized_at timestamptz,
  PRIMARY KEY (repo_id, branch_name, idempotency_key)
);

CREATE INDEX IF NOT EXISTS branches_repo_name_head_idx
  ON branches (repo_id, name, head_commit_id);

CREATE INDEX IF NOT EXISTS commits_repo_created_at_idx
  ON commits (repo_id, created_at DESC);

CREATE INDEX IF NOT EXISTS repo_push_idempotency_commit_idx
  ON repo_push_idempotency (repo_id, branch_name, commit_id);
