# Implementation Plan

This document sequences future implementation. It is not evidence that any listed component exists.

## 1. Delivery Rules

1. Build vertical slices that preserve E2EE invariants at every milestone.
2. Freeze canonical formats and crypto vectors before network storage.
3. Never introduce a temporary server-side plaintext path.
4. Treat key transparency, envelope coverage, ref consistency, and rotation gating as launch blockers, not later hardening.
5. Keep web governance and secret cryptography separated in code and deployment boundaries.

## 2. Phase 0: Contracts and Test Vectors

Deliver:

- Deterministic-CBOR account bundle, directory leaf/checkpoint, envelope, item payload, tree, commit, and SSH control-frame schemas.
- Argon2id, HPKE, XChaCha20-Poly1305, Ed25519, associated-data, and BIP39 golden vectors.
- OpenAPI 3.1 governance contracts and versioned SSH operation schemas.
- Postgres migrations reflecting `database-schema.md`.
- Stable error codes and redaction rules.

Exit:

- Independent implementations reproduce every canonical hash/signature vector.
- Unknown versions fail closed.
- No open crypto or identity-binding decisions.

## 3. Phase 1: Local Identity and K-V Repository

Deliver:

- CLI enrollment, master-password/recovery wrappers, unlock agent, lock/timeout behavior.
- Encrypted `.wenvy` working state, index, refs, objects, and stash.
- UTF-8 NFC key handling, arbitrary byte values, dotenv/JSON import/export.
- Key-level status, diff, add, restore, commit, log, branch, switch, and stash.
- Ed25519 commit signing and verification.

Exit:

- No secret-bearing local file is plaintext by default.
- Recovery can rewrap the account bundle after a forgotten password.
- Key-level staging and stash round-trip across process restart.
- Redaction is default in every display path.

## 4. Phase 2: Directory and Witnesses

Deliver:

- Append-only Merkle directory and signed checkpoints.
- Three independent witness deployments and two-of-three client verification.
- Inclusion/consistency proof APIs, client checkpoint pinning, rollback/equivocation rejection.
- Account-key enrollment, signed rotation, recovery event, revocation, and suspension.

Exit:

- Unwitnessed keys cannot become envelope recipients.
- Split roots for one tree size trigger a critical event and provisioning freeze.
- Witness outage retains safety and degrades only provisioning availability.

## 5. Phase 3: Group and Branch Crypto

Deliver:

- Personal/team groups and Group Key versions.
- Branch Vault Key versions and branch group grants.
- Item-version DEKs, encrypted payloads, envelope chains, and R2 storage.
- n+1 invitation/access-request provisioning from an administrator CLI.
- Multi-email and multi-SSH-key management with proof of possession.

Exit:

- Adding one user creates one Group Key envelope and modifies no branch/item ciphertext.
- SSH-key addition/revocation creates no secret envelope churn.
- A user without branch grant or envelope chain cannot decrypt the branch.

## 6. Phase 4: SSH Remotes and Ref Consistency

Deliver:

- Go SSH gateway with shell features disabled.
- Fetch/push object protocol, idempotent uploads, and bounded streaming frames.
- Durable Object branch coordinator and Postgres expected-head transaction.
- Remote refs, clone, fetch, fast-forward pull, push, and force-with-lease policy.

Exit:

- Two clients cannot both advance one head from the same expected parent.
- Retries do not duplicate objects or ref changes.
- Revoked SSH keys and users cannot fetch envelopes or blobs.

## 7. Phase 5: Encrypted Branch Merge and Protection

Deliver:

- Local K-V merge-base discovery and three-way conflict engine.
- Target projection commits and target DEK-envelope creation.
- Merge continue/abort and stash-apply conflict behavior.
- Branch policy precedence, change requests, approvals, and supersession.

Exit:

- Cross-branch merge always produces a target-prepared two-parent commit.
- Unchanged payload ciphertext is reusable through a target DEK envelope.
- Protected ref activation is atomic and rejects stale base heads.

## 8. Phase 6: Authentication and Governance

Deliver:

- Browser-bound email magic links and SSH-to-web bridge.
- MFA, session/device controls, organization/group/branch governance UI.
- Effective-access inspector including grant source and envelope state.
- Service accounts with token plus signed request and branch allow-list.

Exit:

- Web sessions cannot retrieve decryptable secret data.
- Email compromise alone cannot activate cryptographic access.
- Service accounts cannot escape their branch/capability scope.

## 9. Phase 7: Revocation and Client-Assisted Rotation

Deliver:

- Immediate authorization removal and branch write gating.
- Rotation job/branch state, Workflow orchestration, client leases, artifact manifests, validation, and atomic activation.
- Group removal, branch-grant removal, account compromise, resume, retry, and expiry paths.
- Envelope/history consistency checker.

Exit:

- No post-revocation write uses a compromised Vault Key.
- Concurrent clients cannot activate conflicting rotations.
- Failed rotation leaves existing data readable to remaining members and branches write-blocked.
- Removed members cannot decrypt newly written item versions.

## 10. Phase 8: GitHub RBAC and Operations

Deliver:

- GitHub App installation, immutable identity linking, team-to-group mappings, webhooks, and full reconciliation.
- Pending envelope provisioning for additions; immediate denial and rotation for removals.
- Security signals, runbooks, backup/restore validation, audit checkpoints, rate limits, and retained logs.

Exit:

- GitHub can neither grant owner nor directly activate key access.
- Missed/reordered webhooks converge through reconciliation.
- Restore validates directory, envelope, object, commit, ref, and rotation consistency before unfreezing writes.

## 11. Test Strategy

### Unit and golden tests

- Canonical encodings, hashes, signatures, associated data, KDF and crypto vectors.
- UTF-8 normalization, arbitrary byte values, import/export, redaction, diff, merge, and stash.
- Policy precedence, role/cap/deny evaluation, and error-code stability.

### Integration tests

- Enrollment through witnessed activation and recovery.
- Invite/access request through one-envelope n+1 activation.
- SSH clone/fetch/push, concurrent ref updates, projection merge, and protected approval.
- Rotation claim, crash/resume, stale artifact, concurrent claimant, and activation rollback.
- GitHub reconciliation and service-account branch scope.

### Security tests

- Directory rollback/equivocation, invalid witness, key substitution, envelope transplantation, ciphertext tampering, and signature replay.
- Revoked account/SSH/token access, branch-grant bypass, compromised-key write, and stale-head race.
- Logging and crash-report scans for key names, values, plaintext keys, tokens, and mnemonic material.

### Reliability and performance

- Large histories and item counts, envelope fanout, witness degradation, queue duplication, Postgres failover, R2 retry, and gateway reconnect.
- Confirm user addition remains independent of repository item count.
- Measure branch creation/merge metadata work and rotation completion separately from payload bytes.

## 12. Required ADRs Before Coding

- Exact RFC 9180 Go HPKE implementation and pinned version.
- Canonical CBOR field registry and compatibility/versioning policy.
- Memory-agent IPC and platform key-memory behavior.
- Three witness providers, operational ownership, and key-rotation ceremony.
- Maximum key/value/object/frame sizes.
- Postgres migration/tenant-isolation strategy.
- Signed release and witness-set update process.

## 13. Explicitly Deferred

- Browser-side secret cryptography.
- Full-history or current-state payload re-encryption on revocation.
- Post-quantum key exchange.
- Source-code/file-tree versioning.
- Shared/synchronized stash.
- Automatic secret-value conflict resolution.
- Server-side merge generation.
