# Implementation Plan

## 1. Delivery Strategy

Build in vertical slices so each phase is usable, secure, and testable:

1. Phase A: Foundation and local model.
2. Phase B: Secure transport and server metadata.
3. Phase C: Team sharing and RBAC.
4. Phase D: Passwordless web and SSH bridge.
5. Phase E: Rotation, hardening, and production readiness.

## 2. Workstreams

1. CLI and Local State
- `.wenvy` local metadata layout (see system-design.md Section 13 for directory structure).
- Snapshot canonicalization (see system-design.md Section 11 for format spec).
- Local encrypt/decrypt pipeline.
- Commit signing and verification.
- Merge conflict detection and three-way diff resolution (see system-design.md Section 14).

2. SSH and Command Protocol
- SSH key authentication.
- Command contracts for push/pull/share (see system-design.md Section 12 for wire protocol).
- Idempotency and concurrency handling.

3. Metadata and Storage
- Postgres schema and migrations, accessed by Workers through Hyperdrive.
- R2 encrypted object upload/download lifecycle.
- Branch ref consistency and commit DAG storage.
- Partial unique index for `repo_role_overrides` (see database-schema.md).
- Durable Object coordination for per-repo/per-branch write serialization.
- Workers KV only for read-heavy, non-authoritative configuration.

4. Auth and Session
- Email magic links with browser session fingerprint binding.
- SSH-to-web login bridge with IP binding.
- Session issuance and revocation.
- MFA enrollment and verification (TOTP + WebAuthn).

5. RBAC and Team Lifecycle
- Team roles and permission checks.
- Invite and join flow.
- Member removal and rotation triggers.
- Multi-team repo access grants and revocations.

6. Branch Governance and Promotion
- Branch policy model (`dev`, `staging`, `production`, wildcard branches).
- Branch pattern precedence rules (exact > prefix wildcard > global wildcard > default-deny).
- Branch-level role rules and protected branch controls.
- Branch promotion/change-request workflow.
- Branch deletion governance.

7. CI/CD and Service Accounts
- Service account creation and scoped token issuance.
- Token-bound key pair generation and envelope distribution.
- Pull-only and push-and-pull capabilities.
- Branch allow-list enforcement.
- Rate limiting per service account token.

8. Recovery and Key Management
- Recovery key generation (BIP39 mnemonic) at user onboarding.
- Recovery key envelope creation and storage.
- Multi-device SSH key addition flow.
- Recovery key rotation.

9. Security and Ops
- Audit event pipeline (supporting both user and service account actors).
- Alerting and anomaly detection.
- Envelope consistency background checker.
- Backup and restore procedures with crypto consistency validation.
- Cloudflare WAF/rate-limiting, Turnstile, Workers Logs, Workers Analytics Engine, and Logpush setup.

## 3. Sequenced Implementation

## Step 1: Core Data Contracts

Deliverables:

- Canonical snapshot format definition (UTF-8, lexicographic key sort, `=` separator, base64 for special values, SHA-256 hash).
- Commit metadata schema definition.
- Branch ref update rules.
- SSH wire protocol specification (length-prefixed JSON frames, command vocabulary).
- OpenAPI 3.1 schema for HTTP API endpoints.
- `.wenvy/` local directory layout specification.
- Cloudflare binding contract for Workers, Hyperdrive, R2, Durable Objects, Queues, Workflows, KV, and Secrets Store.

Exit criteria:

- Deterministic hash generation for identical env states.
- Commit object contract frozen for v1.
- Wire protocol contract frozen for v1.
- OpenAPI schema validates and generates working client stubs.
- Cloudflare binding names and environment split are frozen for the MVP.

## Step 2: Local CLI Core

Deliverables:

- Init repository metadata (`.wenvy/` directory structure).
- Snapshot create/read/update with canonical format.
- Local encrypt/decrypt with key envelope chain (Ed25519→X25519 via `age`).
- Recovery key generation (BIP39 mnemonic) and local storage prompt.
- Merge conflict detection and three-way diff resolution for env key-value pairs.

Exit criteria:

- Local round-trip integrity tests passing.
- No plaintext persistence outside explicit export path.
- Merge conflicts correctly detected and interactively resolved.
- Recovery key can decrypt team key envelope in isolation.

## Step 3: SSH Gateway and Push/Pull

Deliverables:

- SSH key auth and command authorization.
- Go SSH gateway deployable behind Cloudflare Tunnel for MVP.
- Push uploads encrypted blob to R2 + metadata to Postgres.
- Pull returns head, envelopes, and R2 blob references.
- Branch head updates serialize through a `RepoBranchCoordinator` Durable Object.

Exit criteria:

- Multi-device pull works for same user.
- Ref update race handling validated.
- Tunnel-published SSH endpoint passes CLI push/pull smoke tests.

## Step 4: Team and RBAC

Deliverables:

- Teams, members, role checks.
- Share workflow via envelope creation.
- Repo-to-team binding.
- Multi-team repo access grants (`repo_team_access`).
- Recovery key envelope creation during team join.
- Multi-device SSH key addition flow (envelope re-wrap from existing device).

Exit criteria:

- Viewer cannot write.
- Editor can write but cannot modify memberships.
- Admin/Owner can manage access.
- Secondary team members can pull with role ceiling enforcement.
- Recovery key holders can recover access without admin intervention.

## Step 5: Branch Controls and Protected Branch Workflow

Deliverables:

- Branch policy schema and policy evaluation engine.
- Pattern precedence rules: exact > prefix wildcard > global wildcard > default-deny.
- Default policy bootstrap for `dev`, `staging`, and `production`.
- Approval and protection flow for high-risk branches.
- Branch deletion governance (admin+ for any branch, owner for protected branches).

Exit criteria:

- Direct writes to `production` are blocked for non-privileged roles.
- Policy exceptions and approvals are fully audited.
- Branch-level permission tests pass.
- Unmatched branches fall through to default-deny.
- Protected branch deletion requires owner approval.

## Step 5a: CI/CD Service Accounts

Deliverables:

- Service account creation and management API.
- Scoped token generation with branch allow-lists.
- Token-bound key pair and envelope distribution.
- Pull and push authorization for service accounts.
- Rate limiting per service account token.

Exit criteria:

- Service account can pull secrets for allowed branches.
- Service account cannot access branches outside allow-list.
- Service account cannot manage membership, policies, or perform rotations.
- Token revocation immediately blocks access.
- All service account actions are audited with correct actor type.

## Step 6: Passwordless Web and SSH Bridge

Deliverables:

- Email magic-link auth with browser session fingerprint binding.
- SSH-generated one-time browser login token flow with IP binding.
- Session lifecycle controls.
- MFA enrollment and verification (TOTP + WebAuthn).
- Org-level MFA policy enforcement.

Exit criteria:

- One-time tokens are short-lived and single use.
- Magic links only work in the originating browser.
- Bridge tokens only work from the SSH session's IP.
- Web session revocation works reliably.
- MFA challenge presented for sensitive actions when org policy requires it.

## Step 7: Revocation and Rotation

Deliverables:

- Team key rotation workflow using Cloudflare Workflows with saga/compensation pattern.
- Repo key re-wrap workflow with checkpoint tracking.
- Queue-triggered job orchestration and status tracking with retry logic.
- Partial failure recovery: resume from last checkpoint per rotation job.
- Envelope consistency background checker.
- Cron Trigger for periodic envelope consistency scan.

Exit criteria:

- Member removal blocks fresh access immediately.
- Rotation completion updates active key versions correctly.
- Partial rotation failure is recoverable via retry without data loss.
- Envelope consistency checker detects and alerts on drift.
- Concurrent rotations for the same team are properly serialized.

## Step 8: Hardening and Launch Readiness

Deliverables:

- Audit coverage completion (all 13 event categories).
- Security testing pass.
- Operational runbooks and SLO dashboard.
- Backup/restore procedure with crypto consistency validation.
- SSH data-plane rate limiting through gateway checks plus Cloudflare edge controls where applicable.
- Forward secrecy trade-off documentation and customer-facing guidance.
- Workers Logs, Workers Analytics Engine, Logpush, R2 retention, and alert routing configured.
- Cloudflare WAF rules, rate limiting rules, and Turnstile deployment reviewed.

Exit criteria:

- Incident playbook dry-run completed.
- Backup/restore test completed, including crypto consistency validation.
- Envelope consistency checker running in production.
- Rate limits enforced on all SSH commands, not just auth.
- Platform observability can correlate Worker request IDs, SSH audit events, queue messages, and rotation workflow IDs.

## 4. Testing Strategy

1. Unit tests
- Snapshot canonicalization, hash stability, key envelope logic.
- Ed25519→X25519 conversion correctness.
- Recovery key envelope round-trip.
- Branch pattern precedence evaluation.
- Three-way merge conflict detection and resolution.

2. Integration tests
- SSH auth, push/pull flows, RBAC enforcement, branch policy enforcement.
- Multi-team repo access authorization.
- Service account token auth and branch allow-list enforcement.
- MFA challenge flow for protected web actions.
- Magic link browser fingerprint binding.
- Bridge token IP binding.

3. Security tests
- Replay, token theft, permission bypass, envelope tampering.
- Magic link interception from different browser (must fail).
- Bridge token use from different IP (must fail).
- Revoked key envelope access (must fail).
- Service account scope escalation (must fail).
- Account takeover via email-only (blocked by MFA/recovery key).
- Forward secrecy validation: revoked member cannot decrypt new snapshots.

4. End-to-end tests
- Onboard user, create team, share repo, enforce branch rules, pull and decrypt.
- Full CI/CD service account lifecycle: create, pull, rotate token, revoke.
- Recovery flow: lose SSH key, recover via recovery key, re-wrap envelopes.
- Multi-device: add second SSH key, verify envelope availability.
- Multi-team: grant secondary team access, verify role ceiling, revoke and verify rotation.

5. Reliability tests
- Concurrent pushes and branch conflict behavior.
- Protected-branch approval race behavior.
- Partial rotation failure recovery.
- Backup restore with crypto consistency validation.
- Envelope consistency checker drift detection.

## 5. Governance and Decision Records

1. Keep Architecture Decision Records for:
- Key hierarchy choices.
- Production database choice: Postgres + Hyperdrive vs D1.
- Durable Objects vs Redis for coordination.
- R2 object naming, retention, and backup strategy.
- SSH ingress choice: Tunnel vs Spectrum vs external TCP edge.
- Revocation strategy (immediate vs staged rotation).
- Web dashboard plaintext policy.
- Forward secrecy trade-off (historical blobs not re-encrypted on rotation).
- Ed25519→X25519 conversion approach and library choice.
- Recovery key design (optional vs mandatory, BIP39 encoding).
- CI/CD service account model (scoped tokens vs SSH key-based).
- Multi-team repo access model (junction table vs repo duplication).
- MFA strategy (optional by default, org-enforceable).
- Branch pattern precedence (exact > wildcard > default-deny).

2. Require threat-model review gates before:
- Public beta.
- Enterprise/team feature launch.
- Any change to the crypto envelope model.
- Service account feature GA.

## 6. Symlink Integration Decision

If symlink support is added:

1. Treat it as developer convenience only.
2. Never store long-lived plaintext by default.
3. Restrict materialization to temp files and runtime injection.
4. Mark symlink mode experimental until leak safeguards are validated.
