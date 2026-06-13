# Security and Operations

## 1. Security Baseline

1. No plaintext secret logging anywhere.
2. All auth tokens stored as hashes, never raw values.
3. One-time tokens must be single-use and short-lived.
4. Session cookies must be secure, HTTP-only, and strict same-site.
5. Mandatory audit event emission for sensitive actions.
6. Cloudflare WAF managed/custom rules and rate limiting protect public HTTP endpoints.
7. Turnstile protects login, invite, and recovery forms where user interaction exists.
8. Cloudflare Secrets Store or Worker secrets hold provider credentials only; Wenvy customer plaintext secrets are never server-side credentials.

## 2. Monitoring and Alerting

## Authentication Signals

1. Failed SSH authentication spikes.
2. Magic-link issuance and validation anomalies.
3. Bridge token reuse attempts.
4. MFA failure spikes (brute-force TOTP attempts).
5. Service account token validation failures.
6. Invalid GitHub webhook signatures and duplicate delivery spikes.

## Authorization Signals

1. Denied access attempts across repos/teams.
2. Unexpected role elevation actions.
3. High-frequency member removal/addition patterns.
4. Repeated denied writes to protected branches (`staging`, `production`).
5. **SSH data-plane rate limit breaches**: alerts when a user or service account exceeds push/pull rate thresholds, indicating possible exfiltration by a compromised key.
6. Service account access outside allowed branch scope.
7. GitHub-derived role elevation, stale reconciliation, and installation suspension.

## Crypto Lifecycle Signals

1. Rotation job failures.
2. Envelope creation mismatch counts.
3. Inconsistent active key version references.
4. **Envelope consistency drift**: alerts when the background envelope consistency checker finds team members missing envelopes for the active team key version.
5. Rotation jobs stuck beyond SLA threshold.

## Cloudflare Platform Signals

1. Workers Logs for request failures, uncaught exceptions, and structured security log lines.
2. Workers Analytics Engine for high-cardinality product/security metrics.
3. Workers Logpush to R2 and/or SIEM for retained runtime logs.
4. WAF Security Events for blocked/challenged traffic.
5. Turnstile challenge failure rates on auth forms.
6. Queue dead-letter or retry exhaustion events.
7. Workflow stuck/failure events for rotation jobs.
8. Durable Object alarm failures or write-serialization errors.

## 3. Audit Strategy

Critical events to capture:

1. Login success/failure (web and SSH).
2. Invite issuance and acceptance.
3. Team membership changes.
4. Role changes and admin actions.
5. Key additions, revocations, and rotations.
6. Push/pull/share operations (metadata only, never secret values).
7. Branch policy changes and branch rule exceptions.
8. Protected-branch approvals and rejections.
9. Service account token creation, usage, and revocation.
10. MFA enrollment, verification, and bypass events.
11. Recovery key generation and usage events.
12. Multi-team repo access grants and revocations.
13. Branch deletion events.
14. GitHub App installation, mapping, override, reconciliation, and effective-role changes.

Audit records should be immutable and queryable by org scope and time range.
Audit actor attribution supports users, service accounts, the GitHub App, and system jobs.

## 4. Operational Runbooks

## Incident: Suspected Key Compromise

1. Revoke compromised SSH key.
2. Revoke active web sessions for user.
3. Remove user from sensitive teams if needed.
4. Trigger immediate team and repo key rotations.
5. Review access and pull audit timeline.
6. Freeze sensitive branches until rotation completes if required.
7. If the compromised key belongs to a service account, revoke the service account token and all associated envelopes.
8. Check for abnormal pull volume from the compromised key in the period before discovery.
9. Raise Cloudflare rate limits or WAF blocks temporarily for affected accounts/IP ranges if active abuse continues.

## Incident: Token Abuse

1. Invalidate token family and active sessions.
2. Enforce temporary rate-limit escalation.
3. Alert security channel.
4. Require re-auth for privileged actions.

## Incident: GitHub Integration Compromise

1. Disable the installation in Wenvy and fail closed for GitHub-derived grants.
2. Rotate the GitHub App private key and webhook secret.
3. Revoke active installation tokens by suspending or uninstalling the app when necessary.
4. Review webhook deliveries, mapping changes, user links, and effective-role audit events.
5. Reconcile from GitHub before restoring access.
6. Rotate affected team/repo keys if unauthorized envelope access may have occurred.

## Incident: Data Store Leak

1. Confirm leak scope (Postgres/R2 logs).
2. Validate encryption boundaries remained intact.
3. Rotate service-side credentials.
4. Initiate customer notification workflow as policy requires.
5. **Verify that no plaintext secrets are exposed**: DB leak exposes only ciphertext envelopes and encrypted blobs; confirm no plaintext logging violations occurred.
6. If R2 blobs leaked: confirm repo keys are not exposed (they are encrypted by team keys, which are encrypted by SSH keys — a three-layer envelope).
7. Consider precautionary team key rotation for all affected orgs even if encryption boundaries are intact.

## 5. Backup and Recovery

1. Back up metadata DB with point-in-time recovery capability.
2. Version and replicate R2 object storage where retention policy requires it.
3. Periodically test restore into isolated staging.
4. Validate commit graph, branch heads, and blob reference integrity post-restore.

### Crypto Consistency After Restore

5. **Critical**: if a DB restore rolls back to a point before a key rotation but object storage retains blobs encrypted with the new (post-rotation) repo key, those blobs become undecryptable (the new repo key envelope is lost in the rollback).
6. Mitigation: R2 replication/versioning policy should include recovery points synchronized with DB backup timestamps.
7. Recovery procedure for crypto drift:
   - Identify mismatched `repo_key_version` references between DB and blob metadata.
   - If DB is behind: re-run the rotation from its checkpoint state (rotation jobs are idempotent).
   - If blobs are behind: the restored blobs are on an older repo key that still exists in DB — no data loss, but the system should detect and alert on version mismatches.
8. Include envelope consistency validation in the post-restore checklist: verify every active team member has envelopes for the current active key version.

## 5a. Envelope Consistency Checker

A background job that runs periodically (configurable, default every 6 hours) and validates the following invariants:

1. Every active team member has a `team_key_envelope` for the team's `active_key_version`.
2. Every active service account with access has a `service_account_envelope` for the team's `active_key_version`.
3. Every active repo has a `repo_key_version` wrapped with the team's `active_key_version`.
4. No envelopes reference a revoked SSH key.
5. No envelopes reference a deleted or suspended user.

On drift detection:
- Emit a `security_event` with severity `high`.
- Alert the org admin channel.
- Optionally trigger automated envelope repair (re-wrap by an available admin device) if auto-repair is enabled.

## 6. Compliance and Governance Readiness

1. Access review cadence per organization.
2. Role assignment least-privilege checks.
3. Retention rules for audit/security events.
4. Break-glass and account recovery policy documentation.

## 7. Service Reliability Targets

1. Define SLO for push/pull and auth endpoints.
2. Define max allowed delay for key rotation completion.
3. Add health checks for SSH gateway, Worker API, Hyperdrive/Postgres, Durable Objects, Queues, Workflows, and R2.
4. Use graceful degradation: governance UI can remain available during object store incidents.
5. Track authorization decision latency including branch policy evaluation path.
6. Define SLA for rotation job completion: e.g., team key rotation must complete within 5 minutes for teams with ≤50 members.
7. Define SLA for envelope consistency checker: drift must be detected within one checker cycle.
8. Monitor service account token usage patterns and flag anomalies.
