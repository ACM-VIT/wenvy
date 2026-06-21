# Data Model: Wenvy Core Platform

## Modeling Rules

- PostgreSQL UUID primary keys are opaque and never derived from plaintext secret
  names or values.
- Timestamps are UTC `timestamptz`; mutable records carry `inserted_at`,
  `updated_at`, and an integer `lock_version` where concurrent edits are possible.
- Cryptographic and protocol records carry an explicit integer `format_version`
  or `suite_id`. Unknown values fail closed.
- Encrypted bytes are stored as object references plus checksum/size metadata, not
  logged or copied into cache/queue payloads.
- Audit events, commits, item versions, key versions, and accepted object records
  are immutable. Database permissions and triggers reject update/delete.
- Soft deletion is not used for security state. Revocation is represented by
  explicit status and timestamp transitions.

## Identity and Account Entities

### Account

| Field | Type | Rules |
|---|---|---|
| id | UUID | Primary key |
| handle | text | Case-folded unique display handle |
| status | enum | `pending`, `active`, `suspended`, `closed` |
| primary_email_id | UUID nullable | References one verified, active AccountEmail owned by account |
| personal_organization_id | UUID | Unique, created atomically with account |
| account_key_generation | integer | Positive current public key generation |
| inserted_at / updated_at | timestamp | Required |

Transitions: `pending -> active -> suspended -> active`; `pending|active|suspended
-> closed`. Closed accounts cannot authenticate or regain identities.

### AccountEmail

| Field | Type | Rules |
|---|---|---|
| id / account_id | UUID | Account-owned |
| normalized_email | text | Global uniqueness among non-released addresses |
| display_email | text | User-facing spelling |
| status | enum | `pending`, `verified`, `held`, `removed` |
| verification_digest | bytes nullable | Digest only; never store raw token |
| verified_at / removed_at | timestamp nullable | Match status |

A primary-email switch places affected EmailWorkflow rows on hold. The account's
primary pointer changes only after the replacement address is verified.

### EmailWorkflow

Represents invitations, notifications, and recovery actions bound to an email.
Fields: `id`, `account_id`, `kind`, `payload_ref`, `bound_email_id`, `status`
(`pending`, `held`, `ready`, `completed`, `expired`, `cancelled`), `hold_reason`,
`expires_at`, and timestamps. A verified primary switch atomically rebinds held
workflows and moves them to `ready`, unless expired.

### SSHIdentity

| Field | Type | Rules |
|---|---|---|
| id / account_id | UUID | One owning account |
| fingerprint | text | Global unique canonical SHA-256 fingerprint |
| algorithm | enum | Explicit allow-list |
| public_key | bytes | Validated canonical public key only |
| label | text | Account-scoped display label |
| status | enum | `pending`, `active`, `revoked` |
| linked_at / last_used_at / revoked_at | timestamp nullable | Match lifecycle |

The global fingerprint constraint prevents linking one identity to two accounts.
Registration requires a short-lived signed challenge. Revocation never deletes the
row or prior audit references.

### AccountKeyVersion

Immutable account public-key generation: `id`, `account_id`, `generation`,
`suite_id`, `public_key`, `status` (`active`, `retired`, `compromised`),
`activated_at`, `retired_at`. Unique `(account_id, generation)` and one active
generation per account.

## Organization and Authorization Entities

### Organization

Fields: `id`, unique `slug`, `display_name`, `kind` (`personal`, `shared`),
`status`, `default_group_id`, and timestamps. Every account owns exactly one
personal organization. Every organization has exactly one non-removable default
all-members group.

### OrganizationMembership

Fields: `id`, `organization_id`, `account_id`, `role` (`member`, `admin`, `owner`),
`status` (`invited`, `active`, `revoked`), inviter, and lifecycle timestamps.
Unique active/invited membership per organization/account. Last-owner removal is
rejected.

### Group and GroupMembership

`Group` fields: `id`, `organization_id`, `name`, `kind` (`default`, `personal`,
`custom`), `status`, `active_key_version_id`, timestamps. Name is unique within an
organization after case folding.

`GroupMembership` fields: `id`, `group_id`, `account_id`, `status` (`active`,
`revoked`), and lifecycle timestamps. Active organization membership is required.
Default-group membership mirrors active organization membership transactionally.

### BranchPermission

Fields: `id`, `branch_id`, `group_id`, `level` (`none`, `read`, `write`), `granted_by`,
and timestamps. Unique `(branch_id, group_id)`. Effective permission is the
greatest positive grant across active memberships unless an organization-wide
explicit deny policy is introduced by a future contract version. `write` implies
`read`; `none` contributes no access. Permission evaluation is centralized in the
domain application.

## Repository Graph and Encrypted Content

### Repository

Fields: `id`, `organization_id`, unique organization-scoped `slug`, `display_name`,
`status` (`active`, `archived`), `object_format_version`,
`historical_lockout_enabled`, default branch ID, and timestamps.

### Branch

Fields: `id`, `repository_id`, unique repository-scoped `name`, `head_commit_id`
nullable, `ref_version` bigint, `active_vault_key_version_id`, `rotation_status`
(`current`, `rotation_due`, `rotating`, `blocked`, `failed`), `rotation_due_at`,
and timestamps. Ref updates use compare-and-swap on `(head_commit_id,
ref_version)`. A write-to-read downgrade preserves key access. Effective read loss
sets `rotation_due` in the same transaction.

### Commit

Immutable fields: `id` (digest of signed canonical bytes), `repository_id`,
`author_account_id`, `author_account_key_generation`, `format_version`,
`root_object_id`, `message_ciphertext_object_id`, `authored_at`, `signature`, and
`accepted_at`. Parent edges are stored in `CommitParent(commit_id, parent_id,
ordinal)` with unique ordinals. The server validates signature, actor eligibility,
known version, parent availability, and graph limits without decrypting content.

### EncryptedObject

Immutable metadata: `id` (digest of encrypted stored representation),
`repository_id`, `kind`, `format_version`, `object_store_key`, `ciphertext_digest`,
`size_bytes`, `media_class` (`structured`, `text_secret`, `binary_secret`,
`key_envelope`), `storage_status` (`pending`, `available`, `quarantined`,
`garbage_candidate`), and timestamps. Unique object ID and store key. An object is
referenced only after checksum-verified availability.

### SecretItemVersion (client-visible canonical object)

The backend treats this as encrypted object bytes. The Rust model contains:
`format_version`, encrypted normalized-key token, encrypted value payload or binary
attachment object ID, `media_type`, DEK-wrapped envelope, nonce, and authenticated
metadata. A fresh DEK is mandatory for every immutable item version. Multiple
working-tree names that normalize to one key are rejected before commit.

### GroupKeyVersion and VaultKeyVersion

Immutable records contain `id`, owner ID, monotonically increasing `generation`,
`suite_id`, public metadata, `status` (`active`, `retired`, `compromised`), and
lifecycle timestamps. Exactly one version is active per owner. Private key bytes
are never stored by the backend.

### KeyEnvelope

Immutable relationship from a key version to a recipient key version: `id`,
`envelope_kind`, `source_key_version_id`, `recipient_type`, `recipient_key_version_id`,
`encrypted_object_id`, `suite_id`, and `created_at`. Unique source/recipient pair.
Eligibility controls envelope retrieval independently from branch authorization.

## Governance, Audit, and Asynchronous Work

### AuditEvent

Immutable fields: monotonic `sequence`, UUID `id`, organization/account scope,
`actor_account_id`, `actor_ssh_identity_id`, `action`, `target_type`, `target_id`,
allow-listed opaque metadata, `request_id`, `occurred_at`, and `previous_hash` /
`event_hash` for tamper evidence. Database rules reject update/delete. Payloads,
normalized keys, ciphertext, tokens, and raw signatures are forbidden.

### RevocationEvent

Immutable fields: `id`, scope, subject type/ID, actor, reason code, effective time,
`historical_lockout`, and status (`recorded`, `rotation_due`, `rotating`,
`finalized`, `failed`). Related affected branches are captured in
`RevocationBranch(revocation_id, branch_id, required_generation, status)`.

Transitions: `recorded -> rotation_due -> rotating -> finalized`; retryable failure
uses `rotating -> failed -> rotating`. Authorization removal is effective at
`recorded`; finalization means required future-key rotation has completed.

### RotationOperation

Fields: `id`, target type/ID, old/new generation, triggering revocation, status
(`due`, `awaiting_client`, `ready`, `applying`, `complete`, `failed`), attempt
count, idempotency key, error code, and timestamps. Encrypted replacement envelopes
are client-generated and referenced as objects.

### OutboxEvent

Fields: monotonic `id`, `topic`, `schema_version`, aggregate type/ID,
allow-listed payload, idempotency key, status (`pending`, `published`, `failed`),
attempt count, next attempt, and timestamps. Created in the same transaction as
domain state. Unique idempotency key.

### ConsumerReceipt

Fields: `consumer`, `idempotency_key`, `outbox_event_id`, `status`, `processed_at`,
and result digest. Unique `(consumer, idempotency_key)` makes queue redelivery safe.

## State Invariants

1. Authorization never depends on cache state.
2. Read requires both an effective `read|write` permission and an eligible current
   key envelope; write additionally requires `write` and branch rotation policy to
   permit writes.
3. A push authenticates an SSH identity, then verifies that its linked account is
   the commit author and has write access at compare-and-swap time.
4. Audit rows and outbox intent are committed atomically with privileged changes.
5. Object references become reachable only after object availability and checksum
   are verified.
6. The backend cannot derive normalized secret names, values, DEKs, Vault Keys,
   Group Keys, or account private keys from persisted data.
7. Unknown object, suite, queue-envelope, API-major, or SSH-message versions are
   rejected rather than coerced.
