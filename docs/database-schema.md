# Database Schema (Conceptual)

## 1. Scope

This schema supports:

- Passwordless identity and sessions
- SSH key-based authentication
- Team-based RBAC
- Branch-based access controls
- End-to-end key envelope distribution
- Repo versioning metadata
- Auditability and operational jobs

Note: secret plaintext is never stored.

## 2. Identity and Authentication

## `users`
Purpose: Primary account identity.

Key fields:
- `id` (UUID)
- `status` (active, suspended, deleted)
- `display_name`
- `created_at`, `updated_at`

## `user_emails`
Purpose: Verified emails and primary email selection.

Key fields:
- `id` (UUID)
- `user_id` -> `users.id`
- `email` (unique)
- `is_primary`
- `is_verified`
- `verified_at`

## `user_ssh_keys`
Purpose: Device or user-level SSH public keys.

Key fields:
- `id` (UUID)
- `user_id` -> `users.id`
- `fingerprint` (unique)
- `public_key`
- `algorithm`
- `label`
- `revoked_at`
- `last_used_at`

## `auth_magic_links`
Purpose: One-time email login tokens.

Key fields:
- `id` (UUID)
- `token_hash` (unique)
- `email`
- `scope` (web_login, invite_acceptance, recovery)
- `expires_at`
- `used_at`
- `created_at`

## `auth_ssh_bridge_tokens`
Purpose: SSH-authenticated one-time tokens for browser login bridge.

Key fields:
- `id` (UUID)
- `token_hash` (unique)
- `user_id` -> `users.id`
- `expires_at`
- `used_at`
- `issued_ip`
- `created_at`

## `web_sessions`
Purpose: Browser session lifecycle.

Key fields:
- `id` (UUID)
- `user_id` -> `users.id`
- `session_token_hash` (unique)
- `expires_at`
- `revoked_at`
- `ip_address`
- `user_agent`
- `created_at`

## 3. Organization, Team, and RBAC

## `organizations`
Purpose: Tenant boundary.

Key fields:
- `id` (UUID)
- `slug` (unique)
- `name`
- `created_by` -> `users.id`
- `created_at`
- `deleted_at` (nullable, soft-delete timestamp)

Note: Soft-delete preserves audit referential integrity. A deleted org's data is retained for audit queries but inaccessible for operations.

## `organization_members`
Purpose: Org-level membership.

Key fields:
- `organization_id` -> `organizations.id`
- `user_id` -> `users.id`
- `role` (owner, admin, member)
- `status` (active, invited, removed)
- `joined_at`

Primary key:
- (`organization_id`, `user_id`)

## `teams`
Purpose: RBAC and key-sharing scope.

Key fields:
- `id` (UUID)
- `organization_id` -> `organizations.id`
- `slug`
- `name`
- `active_key_version`
- `created_at`
- `deleted_at` (nullable, soft-delete timestamp)

Note: Deleting a team triggers key rotation for all repos owned by the team and revokes all member envelopes. The team record is soft-deleted to preserve audit trail.

## `team_members`
Purpose: Team-level role assignments.

Key fields:
- `team_id` -> `teams.id`
- `user_id` -> `users.id`
- `role` (owner, admin, editor, viewer)
- `status` (active, invited, removed)
- `joined_at`

Primary key:
- (`team_id`, `user_id`)

## `invites`
Purpose: Email-based invitation workflow.

Key fields:
- `id` (UUID)
- `scope_type` (organization, team)
- `scope_id`
- `email`
- `role`
- `token_hash` (unique)
- `expires_at`
- `accepted_at`
- `created_by` -> `users.id`

## 3a. Service Accounts (CI/CD)

## `service_accounts`
Purpose: Machine identities for CI/CD pipelines and automation.

Key fields:
- `id` (UUID)
- `organization_id` -> `organizations.id`
- `name` (human-readable label, e.g. "GitHub Actions Production")
- `created_by` -> `users.id`
- `status` (active, suspended, revoked)
- `created_at`
- `revoked_at`

## `service_account_tokens`
Purpose: Scoped API tokens for service account authentication.

Key fields:
- `id` (UUID)
- `service_account_id` -> `service_accounts.id`
- `token_hash` (unique, raw token shown only at creation)
- `scope_type` (organization, team, repo)
- `scope_id`
- `allowed_branches` (JSONB array of branch patterns, e.g. `["production", "staging"]`)
- `capabilities` (pull_only, push_and_pull)
- `expires_at`
- `last_used_at`
- `revoked_at`
- `created_at`

Constraints:
- Service accounts cannot manage membership, rotate keys, or modify policies.
- Token scope can only be equal to or narrower than the service account's org scope.
- Expired or revoked tokens are rejected at auth layer immediately.

## `service_account_envelopes`
Purpose: Team key envelopes encrypted for service account key material.

Key fields:
- `id` (UUID)
- `team_key_version_id` -> `team_key_versions.id`
- `service_account_id` -> `service_accounts.id`
- `encrypted_team_key`
- `algorithm`
- `created_at`

Note: Service accounts hold an asymmetric key pair generated at creation. The public key is stored server-side; the private key is embedded in the token or stored in the CI/CD platform's secrets manager. Team key envelopes are wrapped for the service account's public key, following the same model as user SSH key envelopes.

## 4. Crypto and Envelope Distribution

## `team_key_versions`
Purpose: Version registry for team symmetric keys.

Key fields:
- `id` (UUID)
- `team_id` -> `teams.id`
- `version` (integer)
- `status` (active, rotating, retired)
- `created_by` -> `users.id`
- `created_at`

Unique constraint:
- (`team_id`, `version`)

## `team_key_envelopes`
Purpose: Team key encrypted per SSH key.

Key fields:
- `id` (UUID)
- `team_key_version_id` -> `team_key_versions.id`
- `user_ssh_key_id` -> `user_ssh_keys.id`
- `encrypted_team_key`
- `algorithm`
- `created_at`

Unique constraint:
- (`team_key_version_id`, `user_ssh_key_id`)

Recommended indexes:
- `user_ssh_key_id` (needed for pull: lookup envelopes by the user's active SSH key)

## `recovery_key_envelopes`
Purpose: Team key encrypted for user recovery key (optional).

Key fields:
- `id` (UUID)
- `team_key_version_id` -> `team_key_versions.id`
- `user_id` -> `users.id`
- `encrypted_team_key`
- `algorithm`
- `created_at`

Unique constraint:
- (`team_key_version_id`, `user_id`)

Note: Only created if the user has a recovery key configured. Enables account recovery without admin intervention.

## `repo_key_versions`
Purpose: Repo symmetric keys encrypted with team key version.

Key fields:
- `id` (UUID)
- `repo_id` -> `repos.id`
- `version` (integer)
- `encrypted_repo_key_by_team_key`
- `team_key_version`
- `status` (active, retired)
- `created_at`

Unique constraint:
- (`repo_id`, `version`)

## 5. Repository and Versioning

## `repos`
Purpose: Secrets repository container.

Key fields:
- `id` (UUID)
- `organization_id` -> `organizations.id`
- `team_id` -> `teams.id` (owning team)
- `name`
- `slug`
- `default_branch`
- `created_by` -> `users.id`
- `created_at`
- `deleted_at` (nullable, soft-delete timestamp)

Unique constraint:
- (`organization_id`, `slug`)

Note: Soft-delete preserves commit history and audit trail. A deleted repo's encrypted blobs are retained per retention policy.

## `repo_team_access`
Purpose: Grant additional teams read/write access to a repo (multi-team sharing).

Key fields:
- `id` (UUID)
- `repo_id` -> `repos.id`
- `team_id` -> `teams.id` (secondary team)
- `role_ceiling` (viewer, editor — the maximum role members of this team can have on this repo)
- `granted_by` -> `users.id`
- `created_at`
- `revoked_at`

Unique constraint:
- (`repo_id`, `team_id`) WHERE `revoked_at IS NULL`

Note: Revoking a secondary team's access triggers repo key rotation since members of that team had envelope access.

## `repo_role_overrides`
Purpose: Optional role overrides at repo scope (relative to team role).

Key fields:
- `id` (UUID)
- `repo_id` -> `repos.id`
- `user_id` -> `users.id`
- `role` (admin, editor, viewer)
- `created_by` -> `users.id`
- `created_at`
- `revoked_at`

Unique constraint:
- Partial unique index: `UNIQUE(repo_id, user_id) WHERE revoked_at IS NULL`

Note: A standard unique constraint on `(repo_id, user_id, revoked_at)` does not work in PostgreSQL because multiple NULL values are considered distinct. The partial unique index ensures only one active (non-revoked) override per user per repo.

## `branches`
Purpose: Branch heads per repo.

Key fields:
- `id` (UUID)
- `repo_id` -> `repos.id`
- `name`
- `head_commit_id` -> `commits.id`
- `updated_at`

Unique constraint:
- (`repo_id`, `name`)

## `branch_policies`
Purpose: Branch-level protection and policy rules.

Key fields:
- `id` (UUID)
- `repo_id` -> `repos.id`
- `branch_pattern` (exact branch or pattern, e.g. `dev`, `staging`, `production`, `release/*`)
- `classification` (development, preproduction, production)
- `is_protected`
- `allow_force_push` (default false on protected branches)
- `require_change_approval`
- `required_approvals` (integer)
- `freeze_writes` (boolean)
- `created_by` -> `users.id`
- `updated_at`

Unique constraint:
- (`repo_id`, `branch_pattern`)

## `branch_role_rules`
Purpose: Role capability matrix per branch policy.

Key fields:
- `id` (UUID)
- `branch_policy_id` -> `branch_policies.id`
- `role` (owner, admin, editor, viewer)
- `can_read`
- `can_write`
- `can_merge`
- `can_change_policy`
- `created_at`

Unique constraint:
- (`branch_policy_id`, `role`)

## `branch_change_requests`
Purpose: Approval workflow metadata for protected branch updates.

Key fields:
- `id` (UUID)
- `repo_id` -> `repos.id`
- `branch_name`
- `proposed_commit_id` -> `commits.id`
- `requested_by` -> `users.id`
- `status` (pending, approved, rejected, superseded)
- `required_approvals`
- `approved_count`
- `created_at`
- `resolved_at`

## `branch_change_approvals`
Purpose: Reviewer approvals for `branch_change_requests`.

Key fields:
- `id` (UUID)
- `branch_change_request_id` -> `branch_change_requests.id`
- `reviewer_user_id` -> `users.id`
- `decision` (approved, rejected)
- `reason`
- `created_at`

Unique constraint:
- (`branch_change_request_id`, `reviewer_user_id`)

## `commits`
Purpose: Metadata DAG node for secret state changes.

Key fields:
- `id` (UUID)
- `repo_id` -> `repos.id`
- `author_user_id` -> `users.id`
- `message`
- `tree_hash`
- `signature`
- `created_at`

## `commit_parents`
Purpose: Parent links for merge history.

Key fields:
- `commit_id` -> `commits.id`
- `parent_commit_id` -> `commits.id`

Primary key:
- (`commit_id`, `parent_commit_id`)

## `snapshots`
Purpose: Encrypted env snapshot metadata linked to commit.

Key fields:
- `id` (UUID)
- `commit_id` -> `commits.id`
- `blob_id` -> `blobs.id`
- `repo_key_version`
- `kv_schema_version`
- `plaintext_hash` (optional integrity check on client)
- `created_at`

Unique constraint:
- (`commit_id`)

Note: The 1:1 relationship with commits means every commit must reference a snapshot. Merge commits that fast-forward without changing secrets should still create a snapshot entry pointing to the same blob as the parent. Metadata-only commits (e.g., branch policy changes) do not create commits in this table — they are handled in the policy/audit domain.

## `blobs`
Purpose: Pointer and integrity metadata for object storage.

Key fields:
- `id` (UUID)
- `storage_backend` (`r2` for Cloudflare production)
- `storage_key`
- `ciphertext_sha256`
- `size_bytes`
- `created_at`

Notes:
- `storage_key` must be opaque and must not contain organization slugs, repo slugs, branch names, environment names, or secret names.
- R2 object metadata can duplicate `ciphertext_sha256` and `size_bytes`, but Postgres remains the queryable source of truth.

## 6. Auditing and Operations

## `audit_events`
Purpose: Immutable audit trail.

Key fields:
- `id` (UUID)
- `organization_id` -> `organizations.id`
- `actor_user_id` -> `users.id` (nullable for service account actions)
- `actor_service_account_id` -> `service_accounts.id` (nullable for user actions)
- `action`
- `target_type`
- `target_id`
- `result` (success, denied, failed)
- `ip_address`
- `user_agent`
- `metadata` (JSONB, optional structured context for the action)
- `created_at`

Recommended indexes:
- (`organization_id`, `created_at` DESC) for org-scoped audit queries
- (`actor_user_id`, `created_at` DESC) for per-user audit trail
- (`target_type`, `target_id`) for target-specific history

Note: `target_id` is a generic UUID without a foreign key; referential integrity is enforced at the application layer. Either `actor_user_id` or `actor_service_account_id` must be non-null (application-enforced CHECK).

## `security_events`
Purpose: Security anomalies and policy events.

Key fields:
- `id` (UUID)
- `event_type` (token_reuse, auth_spike, key_mismatch, etc.)
- `severity`
- `context`
- `created_at`

## `rotation_jobs`
Purpose: Async key rotation orchestration and status.

Key fields:
- `id` (UUID)
- `scope_type` (team, repo)
- `scope_id`
- `triggered_by` -> `users.id`
- `status` (queued, running, completed, failed)
- `checkpoint` (key_generated, envelopes_wrapped, repo_keys_rewrapped, old_key_retired)
- `progress_detail` (JSONB, tracks which repo keys are re-wrapped for partial failure recovery)
- `workflow_instance_id` (Cloudflare Workflows instance identifier, nullable until workflow starts)
- `queue_message_id` (Cloudflare Queues message identifier for initial dispatch, nullable)
- `started_at`, `finished_at`
- `error_summary`
- `retry_count` (integer, default 0)
- `max_retries` (integer, default 3)

Note: Cloudflare Workflows provide the durable execution path, but Postgres remains the auditable source of rotation status and security invariants.

## 7. Core Constraints and Invariants

1. A revoked SSH key cannot receive new envelopes.
2. Team membership and team envelopes must stay consistent.
3. Each repo should define explicit policies for `dev`, `staging`, and `production`.
4. Branch head update must be concurrency-safe.
5. A write to a branch must satisfy both role checks and branch policy checks.
6. Every active team member must have a valid envelope for the current active team key version (enforced by background consistency checker).
7. Soft-deleted entities (orgs, teams, repos) must not participate in new operations but must remain queryable for audit.
8. Service account tokens must be scoped equal to or narrower than their parent service account.
9. At most one active (non-revoked) role override per user per repo.

## 8. Recommended Index Summary

| Table | Index | Purpose |
|---|---|---|
| `team_key_envelopes` | `user_ssh_key_id` | Pull: find envelopes for a user's key |
| `audit_events` | `(organization_id, created_at DESC)` | Org-scoped audit queries |
| `audit_events` | `(actor_user_id, created_at DESC)` | Per-user audit trail |
| `audit_events` | `(target_type, target_id)` | Target-specific history |
| `branch_policies` | `(repo_id, branch_pattern)` | Write authorization policy lookup |
| `commits` | `(repo_id, created_at DESC)` | Commit history queries |
| `web_sessions` | `(user_id, revoked_at)` | Active session lookup |
| `service_account_tokens` | `(service_account_id, revoked_at)` | Active token lookup |
| `repo_team_access` | `(repo_id) WHERE revoked_at IS NULL` | Active multi-team access lookup |
6. Protected branch rules cannot be bypassed by repo-level role alone.
7. Every successful write operation emits an audit event.
8. Secret blobs and metadata references must remain referentially consistent.
