# Database Schema

## 1. Scope and Conventions

This is the authoritative conceptual Postgres schema. It stores identity, visible operational metadata, ciphertext pointers, envelopes, versioning, policy, transparency, and audit state. It never stores plaintext secret key names, values, private account keys, master passwords, recovery mnemonics, or symmetric keys.

Conventions:

- Primary identifiers are UUIDv7 unless an external immutable ID is named.
- Timestamps are `timestamptz` in UTC.
- Mutable business records use `created_at` and `updated_at`; security history is append-only.
- Soft deletion uses `deleted_at`; revoked credentials use `revoked_at`.
- Ciphertext columns are `bytea` only when small; encrypted payload objects live in R2 and use `blobs` references.
- Enum values below are closed v1 contracts.

## 2. Identity and Authentication

### `users`

- `id` PK
- `status`: `pending_enrollment | active | suspended | deleted`
- `display_name`
- `created_at`, `updated_at`, `deleted_at`

### `user_emails`

- `id` PK, `user_id` FK
- `email_normalized` unique
- `email_display`
- `is_primary`, `verified_at`, `created_at`, `removed_at`

Constraints:

- One active owner per normalized email.
- Exactly one verified, active primary email for every active user.
- The last verified email cannot be removed.

### `user_ssh_keys`

- `id` PK, `user_id` FK
- `fingerprint_sha256` unique
- `public_key`, `algorithm`: `ssh-ed25519 | sk-ssh-ed25519`
- `label`, `proof_verified_at`, `last_used_at`, `created_at`, `revoked_at`

SSH keys authenticate transport only. Registration requires a challenge signature. Revoked keys remain for historical attribution.

### `account_key_versions`

- `id` PK, `user_id` FK, `version`
- `x25519_public_key` (32 bytes)
- `ed25519_public_key` (32 bytes)
- `status`: `pending_witness | provisioning | active | retired | revoked | recovery_pending`
- `directory_entry_id` FK
- `activated_at`, `retired_at`, `created_at`

Unique: `(user_id, version)`. Partial unique: one `active` version per user.

### `encrypted_account_bundles`

- `id` PK, `account_key_version_id` unique FK
- `blob_id` FK
- `ciphertext_sha256`, `suite`, `schema_version`, `created_at`

### `account_bundle_wrappers`

- `id` PK, `account_key_version_id` FK
- `wrapper_type`: `master_password | recovery_mnemonic`
- `wrapped_bundle_key`, `suite`
- `derivation_name`: `argon2id | hkdf_sha256`
- `derivation_salt`, `derivation_params`
- `created_at`, `revoked_at`

Partial unique: one active wrapper of each type per account-key version.
Master-password wrappers use the documented Argon2id parameters; recovery wrappers use domain-separated HKDF-SHA-256 over the 256-bit mnemonic entropy.

### Authentication tables

- `auth_magic_links`: token hash, target email ID, scope, browser-binding hash, expiry, consumption time.
- `auth_ssh_bridge_tokens`: token hash, user ID, issuing SSH key ID, IP binding, expiry, consumption time.
- `web_sessions`: token hash, user ID, auth strength, expiry, revocation, IP, user agent.
- `mfa_factors`: user ID, type `totp | webauthn`, encrypted configuration/credential metadata, status.
- `mfa_backup_codes`: factor ID, one-way code hash, consumed time.

Raw tokens and backup codes are never stored.

## 3. Key Transparency

### `key_directory_entries`

- `id` PK
- `user_id`, `account_key_version_id`
- `event_type`: `enroll | rotate | recover | revoke | suspend`
- `x25519_key_hash`, `ed25519_key_hash`
- `previous_user_entry_hash`, `entry_hash`
- `client_signature` nullable only for a declared unverified recovery
- `created_at`

Append-only. User email is not part of the leaf.

### `key_directory_policy_events`

- `id` PK
- `event_type`: `witness_add | witness_retire | quorum_change | directory_key_rotate`
- `policy_document_hash`, `previous_policy_event_hash`
- `owner_approval_set`, `directory_signature`, `created_at`

Policy events enter the same append-only Merkle tree as account-key entries. A witness-set or quorum change is accepted only after the previous quorum signs a checkpoint containing the event and a signed CLI release embeds the new policy.

### `key_directory_leaves`

- `sequence_number` bigint PK
- `leaf_type`: `account_key | policy`
- exactly one of `account_key_entry_id` or `policy_event_id`
- `leaf_hash`, `created_at`

Leaf sequence is global across account and policy events. Referenced entry/event rows and leaves are append-only.

### `key_directory_checkpoints`

- `id` PK, `tree_size` bigint unique
- `merkle_root`, `previous_checkpoint_hash`
- `directory_signature`, `created_at`

### `key_witnesses`

- `id` PK, `name`, `public_key`, `status`: `active | retiring | retired`
- `valid_from`, `valid_until`

### `key_witness_signatures`

- `checkpoint_id` FK, `witness_id` FK
- `signature`, `verified_at`

PK: `(checkpoint_id, witness_id)`. An account key cannot become active until its inclusion checkpoint has signatures from at least two active witnesses.

## 4. Organizations, Groups, and RBAC

### `organizations`

- `id` PK, `slug` unique, `name`, `created_by` FK
- `mfa_policy`: `disabled | optional | required | required_for_admins`
- `recovery_policy`: `optional | required`
- `created_at`, `deleted_at`

### `organization_members`

- `organization_id`, `user_id`
- `role`: `owner | admin | member`
- `status`: `pending | active | suspended | removed`
- `joined_at`, `removed_at`

PK: `(organization_id, user_id)`. At least one active owner must remain.

### `groups`

- `id` PK, `organization_id` FK
- `kind`: `team | personal`
- `slug`, `name`, `owner_user_id` nullable
- `status`: `initializing | active | suspended | deleted`
- `active_key_version` integer nullable while initializing
- `created_at`, `deleted_at`

Unique: `(organization_id, slug)`. Partial unique: one personal group per `(organization_id, owner_user_id)`. A personal group has exactly one owner member, cannot accept additional members, and is deleted only when that organization membership ends. It becomes active only after the user's CLI creates Group Key version 1 and its witnessed user envelope.

### `group_members`

- `group_id`, `user_id`
- `role`: `admin | editor | viewer`
- `status`: `invited | pending_key_provisioning | active | suspended | removed`
- `joined_at`, `removed_at`

PK: `(group_id, user_id)`. `active` requires a valid envelope for the active Group Key and active witnessed account key.

### `invitations`

- `id` PK, `organization_id`, `group_id` nullable
- `email_normalized`, `role`
- `token_hash` unique, `created_by`, `expires_at`, `accepted_at`, `revoked_at`

Acceptance requires the invitation email to be verified on the accepting account. It creates pending membership, not immediate key access.

### `access_requests`

- `id` PK, `requester_user_id`, `organization_id`, `group_id`
- `requested_role`, `reason`
- `status`: `pending | approved_pending_envelope | active | denied | expired | cancelled`
- `reviewed_by`, `reviewed_at`, `created_at`, `expires_at`

## 5. GitHub-Derived Access

Keep external state distinct from effective Wenvy access:

- `github_installations`: Wenvy org, immutable GitHub organization and installation IDs, status and sync timestamps.
- `github_user_links`: Wenvy user, immutable GitHub user ID/login, verified link timestamps.
- `github_organization_memberships`: reconciled GitHub org membership state.
- `github_teams`: immutable GitHub team ID/slug under installation.
- `github_team_memberships`: reconciled GitHub team membership.
- `github_group_mappings`: GitHub team ID to Wenvy group ID and maximum role.
- `github_webhook_deliveries`: unique delivery ID, signature status, processing status, payload hash.
- `github_sync_runs`: installation, trigger, cursors, counts, status, and errors.

GitHub synchronization may create/suspend group membership, but membership remains `pending_key_provisioning` until a client creates envelopes. It cannot create owners or directly activate cryptographic access.

## 6. Repositories and Branch Access

### `repositories`

- `id` PK, `organization_id` FK
- `slug`, `name`, `default_branch`, `created_by`
- `created_at`, `deleted_at`

Unique: `(organization_id, slug)`.

### `branches`

- `id` PK, `repository_id` FK
- `name`, `head_commit_id` nullable FK
- `active_vault_key_version` integer
- `crypto_state`: `initializing | active | rotation_required | rotating | frozen`
- `created_at`, `updated_at`, `deleted_at`

Unique active branch: `(repository_id, name) WHERE deleted_at IS NULL`.

### `branch_group_grants`

- `id` PK, `branch_id` FK, `group_id` FK
- `role_ceiling`: `admin | editor | viewer`
- `source`: `local | github | personal`
- `granted_by`, `created_at`, `revoked_at`

Partial unique: `(branch_id, group_id) WHERE revoked_at IS NULL`. An active grant requires a valid envelope from the group's active key to every retained Vault Key version required by branch history.

### `repository_user_overrides`

- `id` PK, `repository_id`, `user_id`
- `effect`: `grant | cap | deny`
- `role`, `reason`, `created_by`, `expires_at`, `created_at`, `revoked_at`

Overrides affect authorization but do not create cryptographic access. A user still needs membership in a granted group, normally their personal group for direct access.

## 7. Cryptographic Envelopes

### `group_key_versions`

- `id` PK, `group_id` FK, `version`
- `status`: `staged | active | compromised | retired`
- `created_by_account_key_version_id`, `rotation_job_id` nullable
- `created_at`, `activated_at`, `retired_at`

Unique: `(group_id, version)`; one active version per group.

### `user_group_key_envelopes`

- `id` PK, `group_key_version_id`, `user_id`, `recipient_account_key_version_id`
- `hpke_enc`, `ciphertext`, `suite`, `aad_schema_version`
- `creator_account_key_version_id`, `creator_signature`
- `directory_checkpoint_id`, `created_at`, `revoked_at`

Unique active envelope: `(group_key_version_id, recipient_account_key_version_id)`. Recipient account key must be witnessed and `provisioning` or `active`. SSH key IDs are forbidden here.

### `branch_vault_key_versions`

- `id` PK, `branch_id`, `version`
- `status`: `staged | active | compromised | retired`
- `created_by_account_key_version_id`, `rotation_job_id` nullable
- `created_at`, `activated_at`, `retired_at`

Unique: `(branch_id, version)`; one active version per branch.

### `group_vault_key_envelopes`

- `id` PK, `vault_key_version_id`, `group_key_version_id`
- `nonce`, `ciphertext`, `suite`, `aad_schema_version`
- `creator_account_key_version_id`, `creator_signature`, `created_at`, `revoked_at`

Unique active envelope: `(vault_key_version_id, group_key_version_id)`. Coverage must match active branch grants before activation.

### `item_version_dek_envelopes`

- `id` PK, `item_version_id`, `vault_key_version_id`
- `nonce`, `ciphertext`, `suite`, `aad_schema_version`
- `creator_account_key_version_id`, `creator_signature`, `created_at`

Unique: `(item_version_id, vault_key_version_id)`. This separation permits cross-branch ciphertext reuse.

## 8. Versioning and Object Storage

### `commits`

- `id` is SHA-256 of canonical signed commit bytes
- `repository_id`, `author_user_id`, `author_account_key_version_id`
- `message`, `tree_hash`, `prepared_for_branch_id`, `vault_key_version`
- `signature`, `created_at`

Commit ID and signature cover ordered parents, visible metadata, and canonical tree entries.

### `commit_parents`

- `commit_id`, `parent_commit_id`, `position`

PK `(commit_id, position)` and unique `(commit_id, parent_commit_id)`. Normal commits have one parent, roots zero, projection merges two.

### `secret_items`

- `id` random UUID PK, `repository_id`, `created_at`

No key name or deterministic name hash is stored.

### `secret_item_versions`

- `id` random UUID PK, `item_id` FK
- `blob_id` FK, `ciphertext_sha256`, `ciphertext_size`
- `payload_suite`, `payload_schema_version`
- `created_by_account_key_version_id`, `created_at`

The blob decrypts to `{key_utf8_nfc, value_bytes, media_type}`.

### `commit_tree_entries`

- `commit_id`, `item_id`, `item_version_id`

PK `(commit_id, item_id)`. The canonical tree sorts by raw item UUID bytes. Deletion is represented by absence from the new tree.

### `blobs`

- `id` PK, `storage_backend`: `r2`
- `storage_key` unique, `ciphertext_sha256`, `size_bytes`, `created_at`, `deleted_at`

Storage keys are opaque and never contain customer names or secret metadata.

### `ref_update_attempts`

- `id` PK, `repository_id`, `branch_id`
- `expected_old_head`, `proposed_head`
- `actor_user_id` or `actor_service_account_id`
- `idempotency_key`, `result`, `error_code`, `created_at`

Unique: `(actor identity, idempotency_key)`. Successful branch-head movement and audit insertion occur in one transaction.

## 9. Branch Policy and Change Requests

### `branch_policies`

- `id` PK, `repository_id`, `branch_pattern`
- `classification`: `development | preproduction | production | custom`
- `is_protected`, `allow_force_with_lease`, `required_approvals`, `freeze_writes`
- `created_by`, `updated_at`

Unique: `(repository_id, branch_pattern)`.

### `branch_role_rules`

- `branch_policy_id`, `role`
- `can_read`, `can_write`, `can_merge`, `can_approve`, `can_change_policy`

PK: `(branch_policy_id, role)`. `can_read` cannot create access without a branch group grant and envelope chain.

### `branch_change_requests`

- `id` PK, `branch_id`, `source_branch_id` nullable
- `base_head_commit_id`, `proposed_commit_id`
- `requested_by`, `required_approvals`
- `status`: `pending | approved | rejected | superseded | merged | cancelled`
- `created_at`, `resolved_at`

Approvals are invalidated when base or proposed commit changes.

### `branch_change_approvals`

- `change_request_id`, `reviewer_user_id`
- `decision`: `approve | reject`, `reason`, `created_at`

PK: `(change_request_id, reviewer_user_id)`. The proposer cannot approve their own request.

## 10. Service Accounts

### `service_accounts`

- `id` PK, `organization_id`, `name`, `status`, `created_by`, timestamps
- `x25519_public_key`, `ed25519_public_key`, `key_version`

### `service_account_tokens`

- `id` PK, `service_account_id`, `token_hash` unique
- `capability`: `pull | push_pull`
- `expires_at`, `last_used_at`, `revoked_at`, `created_at`

### `service_account_group_grants`

- `service_account_id`, `group_id`
- `created_by`, `created_at`, `revoked_at`

Partial unique: `(service_account_id, group_id) WHERE revoked_at IS NULL`. An active grant requires a service-account Group Key envelope for the group's active key version.

### `service_account_branch_grants`

- `service_account_id`, `branch_id`
- `capability`: `pull | push_pull`
- `created_by`, `created_at`, `revoked_at`

Partial unique: `(service_account_id, branch_id) WHERE revoked_at IS NULL`.

### `service_account_group_envelopes`

Same HPKE fields and constraints as user Group Key envelopes, targeting a service-account key version and active service-account group grant. Tokens do not contain private encryption keys.

## 11. Rotation Jobs

### `rotation_jobs`

- `id` PK, `organization_id`
- `trigger_type`: `member_removed | group_grant_revoked | key_compromise | scheduled | manual`
- `scope_type`: `group | branch | account`
- `scope_id`, `triggered_by_user_id` nullable
- `status`: `queued | awaiting_client | claimed | validating | activating | completed | failed | expired | cancelled`
- `membership_snapshot_hash`, `expected_key_versions`
- `workflow_instance_id`, `claimed_by_user_id`, `claim_expires_at`
- `artifact_manifest_hash`, `error_code`, `retry_count`
- `created_at`, `started_at`, `finished_at`

### `rotation_job_branches`

- `rotation_job_id`, `branch_id`
- `old_vault_key_version`, `new_vault_key_version` nullable
- `status`, `error_code`

PK: `(rotation_job_id, branch_id)`.

Activation requires all staged key versions and envelope coverage to validate in one transaction. Failed jobs leave old readable versions intact and branches write-blocked.

## 12. Auditing and Security

### `audit_events`

- `id` PK, `organization_id`
- exactly one actor: user, service account, GitHub installation, witness, or system
- `action`, `target_type`, `target_id`, `result`
- request ID, SSH key ID/session ID where applicable, IP, user agent
- structured metadata containing IDs and hashes only
- `created_at`

### `security_events`

- `id` PK, `organization_id`, `event_type`, `severity`
- related user/key/branch/job IDs, safe context, status, timestamps

Audit and security tables are append-only to application roles. Periodic signed audit checkpoints are exported to R2.

## 13. Core Invariants

1. No envelope targets an SSH key.
2. No account key becomes active without a witnessed directory checkpoint.
3. Active group membership requires an active user Group Key envelope.
4. Active branch read grant requires Group-to-Vault envelope coverage.
5. A branch accepts writes only in `crypto_state=active`.
6. New item versions cannot reference compromised or retired Vault Keys.
7. A ref update is compare-and-swap against `expected_old_head`.
8. Cross-branch merges produce a commit prepared for the target branch.
9. Secret names and values never appear in relational columns, object keys, audit metadata, or logs.
10. GitHub sync cannot directly activate key access or grant owner.
11. Revocation authorization commits before rotation is queued.
12. At least one active organization owner remains.
13. Historical signatures remain verifiable after signer or credential revocation.
14. Stash and local index have no server tables.

## 14. Required Indexes

- `user_group_key_envelopes(recipient_account_key_version_id) WHERE revoked_at IS NULL`
- `group_vault_key_envelopes(group_key_version_id) WHERE revoked_at IS NULL`
- `item_version_dek_envelopes(vault_key_version_id)`
- `commit_tree_entries(commit_id)` and `(item_version_id)`
- `commits(repository_id, created_at DESC)`
- `branches(repository_id, name) WHERE deleted_at IS NULL`
- `branch_group_grants(group_id, branch_id) WHERE revoked_at IS NULL`
- `audit_events(organization_id, created_at DESC)`
- `security_events(organization_id, severity, created_at DESC)`
- `rotation_jobs(status, created_at)`
- `github_webhook_deliveries(delivery_id)` unique
