# Security and Operations

## 1. Security Baseline

1. Secret key names, values, decrypted keys, master passwords, recovery mnemonics, and raw tokens are prohibited from logs, traces, audits, queues, crash reports, and support bundles.
2. SSH authentication, X25519 encryption, and Ed25519 signing keys are distinct.
3. Every account recipient key must be active in a two-of-three witnessed directory checkpoint.
4. All mutable security decisions use Postgres/Durable Objects, never eventually consistent KV.
5. Branch writes fail closed unless crypto state is `active`.
6. Ref updates use expected-head compare-and-swap.
7. Rotation activation is transactional and requires complete envelope coverage.
8. Production credentials and resources are isolated from preview environments.
9. Audit records are append-only to application identities and periodically checkpointed.
10. Client and gateway parsers enforce size/depth limits before allocation.

## 2. Security Signals

### Identity and authentication

- Magic-link or bridge-token replay, browser/IP binding mismatch, or rate-limit breach.
- SSH proof failure, revoked-key use, unusual new SSH key, or abnormal geography.
- Account-key recovery, unsigned replacement, witness-quorum failure, or checkpoint rollback.
- Primary-email change, MFA removal, or recovery-policy violation.

### Authorization and versioning

- Denied branch reads/writes, attempted policy bypass, or access outside service-account allow-list.
- Force-with-lease attempt on a protected branch.
- Repeated stale-head updates, oversized fetch/push, or abnormal ciphertext download volume.
- Invalid commit signature, missing target projection metadata, or malformed parent graph.

### Crypto lifecycle

- Active member without Group Key envelope.
- Active branch grant without Group-to-Vault envelope coverage.
- Item version missing a DEK envelope required by a referenced branch tree.
- New item version referencing compromised/retired Vault Key.
- Branch stuck in `rotation_required` or `rotating` beyond SLA.
- Rotation artifact signature/version/snapshot mismatch.

### Transparency

- Invalid inclusion or consistency proof.
- Witnesses signing different roots for the same tree size.
- Witness lag, quorum loss, checkpoint rollback, or unexpected witness-set change.
- Key-directory event not signed by the previous account key where required.

## 3. Alert Severity

- Critical: plaintext logging, directory equivocation, unauthorized ref movement, successful use of revoked credentials, key activation without quorum, or envelope activation missing required readers.
- High: unsigned account recovery, rotation SLA breach, abnormal bulk reads, invalid commit/envelope signatures, or persistent consistency drift.
- Medium: repeated denied operations, stale GitHub reconciliation, witness degradation with quorum retained, or unusual key registration.
- Low: ordinary failed authentication and recoverable idempotency conflicts.

## 4. Audit Events

Audit:

- Email, MFA, session, SSH key, account-key, and recovery lifecycle.
- Directory entries, checkpoints, witness signatures, and proof failures.
- Organization/group membership, invitations, access requests, personal-group grants, and GitHub-derived changes.
- Branch grants, policy changes, protected requests, approvals, and ref updates.
- Group/Vault key creation, compromise, envelope provisioning, rotation claims, and activation.
- Service-account creation, token/key lifecycle, and every data operation.

Audit metadata contains identifiers, versions, hashes, counts, result codes, and request correlation only. It never contains decrypted key names or values.

## 5. Consistency Checkers

Run incremental checks continuously and a full scan at least every six hours:

1. Active account keys have valid witnessed inclusion checkpoints.
2. Active group members have envelopes for the active Group Key.
3. Active branch grants have envelopes for required Vault Key versions.
4. Every tree-referenced item version has a valid DEK envelope for its branch epoch.
5. No new object references compromised/retired key versions.
6. Branch active key/version columns agree with envelope tables.
7. No revoked SSH key or token authenticates an active session.
8. R2 ciphertext hashes and sizes match Postgres metadata.
9. Commit/tree/parent references are reachable and internally consistent.

Drift emits a high-severity event and freezes writes where confidentiality or integrity could be affected. Repair requires signed client artifacts when key material is involved; server jobs cannot synthesize keys.

## 6. Rotation SLO

- Authorization revocation: transactionally immediate.
- Branch write block: same transaction or before revocation response succeeds.
- User notification and rotation job creation: under one minute.
- Standard client-assisted rotation after a legitimate client is online: target five minutes for groups up to 50 members and 100 affected branches.
- No availability deadline permits writing under a compromised Vault Key.

## 7. Incident Runbooks

### Suspected SSH key compromise

1. Revoke the SSH key and active sessions using it.
2. Review its authenticated operations and download volume.
3. Do not rotate secret keys solely because an SSH key was stolen unless evidence shows the account bundle was also unlocked.
4. Notify user and administrators.

### Suspected account private-key compromise

1. Suspend the account key and user access.
2. Mark every Group Key received by that account compromised.
3. Mark reachable branch Vault Keys compromised and block writes.
4. Rotate account key through witnessed recovery.
5. Run client-assisted Group/Vault rotations for remaining members.
6. Review all signatures and reads during the exposure window.

Do not use the routine account-key rewrap path as the only response: a compromised old account key may already have exposed every Group Key it received.

### Removed member

1. Confirm authorization removal committed before responding success.
2. Confirm affected branches are write-blocked.
3. Track rotation claim and activation.
4. Verify the removed account receives no new envelopes or ciphertext fetches.
5. Record that historical data may remain known.

### Directory equivocation or witness compromise

1. Freeze account-key enrollment, rotation, recovery, and Group Key provisioning.
2. Preserve conflicting checkpoints and witness responses.
3. Continue existing secret operations only for clients whose pinned checkpoint remains consistent.
4. Revoke compromised witness through a witnessed policy event and signed client release.
5. Require explicit checkpoint recovery review before reopening provisioning.

### Database or R2 leak

1. Preserve forensic state and rotate infrastructure credentials.
2. Confirm no plaintext logging or object-name leakage.
3. Validate that account bundles, item payloads, and envelopes remain ciphertext.
4. Assess whether account private keys were independently compromised before triggering customer-key rotation.
5. Notify affected organizations according to incident policy.

### Malicious or invalid ref movement

1. Freeze the branch and preserve ref-update/audit records.
2. Verify expected-head transaction, coordinator logs, commit signature, and object graph.
3. Restore the last valid head with an audited owner-approved operation.
4. Rotate keys only if unauthorized payload access also occurred.

## 8. Backup and Restore

- Postgres: point-in-time recovery with encrypted backups.
- R2: retention/versioning policy aligned with database recovery window.
- Transparency witnesses: durable last-checkpoint storage and independent backups.
- Audit checkpoints: signed exports to separate retention storage/SIEM.

Restore order:

1. Restore Postgres to selected point.
2. Restore/verify corresponding R2 object set.
3. Rebuild caches and Durable Object coordination state from Postgres.
4. Validate commit reachability, blob hashes, active versions, envelope coverage, rotation states, and transparency consistency.
5. Keep affected branches frozen until validation passes.

A database restore that loses a newly activated envelope/key version while retaining newer ciphertext can make data unreadable. Activation manifests and encrypted artifacts therefore require retention at least as long as the longest database/R2 recovery window.

## 9. Local Security Guidance

- Auto-lock the key agent on configurable timeout, logout, suspend, or explicit `wenvy lock`.
- Use OS memory locking where available and avoid core dumps for the agent.
- Warn before plaintext export and set restrictive file permissions.
- Recommend `wenvy run` over exported `.env` files.
- Redact values by default from diff, show, conflicts, and diagnostics.
- Never send values through positional CLI arguments.

## 10. Compliance Readiness

- Organization access reviews include effective role, source, branch grant, and envelope state.
- Retention policies cover audit, security events, GitHub deliveries, directory checkpoints, and rotation manifests.
- Break-glass recovery is explicit, witnessed, high-severity, and cannot silently bypass key history.
- Security documentation distinguishes authorization revocation, forward cryptographic revocation, and historical-data re-encryption.
