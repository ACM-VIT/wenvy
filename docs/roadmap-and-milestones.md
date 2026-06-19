# Roadmap and Milestones

## Milestone 0: Architecture Freeze

Outcomes:

- Crypto suite, key hierarchy, transparency quorum, schema, canonical objects, and threat-model limitations approved.
- CLI command/behavior contract and branch projection semantics frozen.
- OpenAPI and SSH protocol schemas ready for implementation.
- Required ADR owners assigned.

Gate: every document uses the approved account-key, Group Key, branch Vault Key, item-version DEK, client-side merge, and forward-only revocation model.

## Milestone 1: Local Git-Like MVP

Outcomes:

- CLI enrollment/unlock/recovery.
- Encrypted local repository, key-level index, commits, branches, K-V merge, and local stash.
- Deterministic object/signature vectors and default value redaction.

Gate: complete local workflow with no network and no implicit plaintext files.

## Milestone 2: Witnessed Multi-User Crypto

Outcomes:

- Key directory and three witnesses.
- Groups, personal groups, branch Vault Keys, item DEKs, invitations/access requests, and one-envelope n+1 onboarding.
- Multiple verified emails and SSH auth keys.

Gate: two users share a branch through witnessed account keys; adding the second user changes no branch/item envelopes.

## Milestone 3: Remote Repository

Outcomes:

- SSH gateway, clone/fetch/push, R2 item storage, Postgres graph/ref state, and branch coordinators.
- Idempotent object upload and expected-head ref movement.

Gate: concurrent-client and retry tests preserve one valid branch history.

## Milestone 4: Branch Isolation and Collaboration

Outcomes:

- Distinct branch readers and Vault Keys.
- Target projection commits, conflicts, protected change requests, approvals, and stale-base handling.
- Complete Git-like status/diff/log/branch/merge/stash UX.

Gate: a source-only reader cannot decrypt target-only data, and a protected merge never requires server plaintext.

## Milestone 5: Governance and Automation

Outcomes:

- Passwordless web governance, bridge login, MFA, effective-access inspection.
- Service accounts with signed requests and branch allow-lists.
- Organization policy and audit surfaces.

Gate: web sessions cannot decrypt secrets; automation remains least-privilege and fully attributable.

## Milestone 6: Revocation and Rotation

Outcomes:

- Immediate denial, branch write gates, Workflows waiting for client artifacts, leases, validation, and atomic activation.
- Consistency checkers and incident runbooks.

Gate: removed members cannot decrypt post-rotation versions, and no availability fallback permits compromised-key writes.

## Milestone 7: GitHub and Production Readiness

Outcomes:

- Read-only GitHub organization/team reconciliation into groups.
- Production observability, rate limits, backups, restore drills, audit checkpoints, and witness operations.
- Security review and external cryptographic/protocol assessment.

Gate: missed events converge, restore drills pass all crypto/graph checks, and launch-blocking findings are closed.

## Product KPIs

- Median local `status`/`diff`, remote fetch/push, and unlock latency.
- Median invitation acceptance to active envelope access.
- Number of envelopes changed during user addition: target exactly one per group.
- Time from authorization removal to branch write gate.
- Time from online legitimate client to completed rotation.
- Protected-change stale/superseded rate.
- Witness quorum availability and checkpoint lag.
- Envelope/graph consistency drift count.
- Plaintext leakage incidents: target zero.
- Mean developer onboarding time and successful first clone/commit/push rate.

## Staffing Areas

- Client/crypto: CLI, key agent, K-V model, canonical objects, merge, and envelopes.
- Platform: Worker API, Postgres, R2, Durable Objects, Queues, Workflows, and SSH gateway.
- Identity/security: auth, transparency witnesses, recovery, audit, incident response, and review.
- Product/frontend: governance dashboard, access explanations, onboarding, and protected-change UX.
