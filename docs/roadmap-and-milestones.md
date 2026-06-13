# Roadmap and Milestones

## 1. Phase 0: Architecture Freeze

Deliverables:

1. Finalized crypto/key hierarchy decisions (including Ed25519→X25519 conversion approach).
2. Finalized schema and API contracts (OpenAPI 3.1 spec, SSH wire protocol spec).
3. Threat model baseline.
4. Canonical snapshot format specification frozen.
5. `.wenvy/` local directory layout specification frozen.
6. Forward secrecy trade-off documented and accepted.
7. Platform service decisions frozen:
   - Workers Static Assets + Hono for dashboard/API.
   - Postgres + Hyperdrive for production metadata.
   - R2 for encrypted blobs.
   - Durable Objects for token consumption and branch write serialization.
   - Queues + Workflows for async jobs and rotation saga.
   - Worker HTTPS data plane for MVP; Tunnel/Spectrum evaluated only for optional SSH compatibility.

Exit criteria:

- Architecture docs approved.
- No open blocker decisions.
- OpenAPI schema generates valid client stubs.
- Wire protocol interop test between CLI and gateway passes.
- `wrangler` binding names and dev/staging/prod resource split are documented.

## 2. Phase 1: CLI and Local Encryption MVP

Deliverables:

1. Local repo initialization (`.wenvy/` directory structure).
2. Snapshot canonicalization (lexicographic sort, UTF-8, SHA-256 hash).
3. Local encrypt/decrypt pipeline (XChaCha20-Poly1305 via `age`).
4. Commit metadata and signature model (Ed25519 SSH signing).
5. Recovery key generation (BIP39 mnemonic) and local envelope test.
6. Three-way merge conflict detection for env key-value pairs.

Exit criteria:

- Local round-trip stable.
- Snapshot hash deterministic.
- Recovery key round-trip works.
- Merge conflicts detected and resolved interactively.

## 3. Phase 2: SSH Push/Pull and Metadata Backend

Deliverables:

1. SSH auth and command dispatch.
2. Worker HTTPS terminal data plane for MVP.
3. R2 encrypted blob storage flow.
4. Commit/branch metadata persistence in Postgres through Hyperdrive-backed Worker APIs.
5. Basic audit event capture.
6. Branch head concurrency through Durable Objects.

Exit criteria:

- End-to-end push/pull across two devices for one user.
- Branch head consistency checks pass.
- CLI push/pull works without raw TCP ingress in MVP topology.

## 4. Phase 3: Teams, Sharing, RBAC

Deliverables:

1. Team and role management.
2. Envelope distribution for team members.
3. Repo-to-team authorization controls.
4. Branch policy engine with `dev`, `staging`, `production` defaults.
5. Protected-branch controls for production-grade branches.
6. Branch pattern precedence (exact > prefix wildcard > global wildcard > default-deny).
7. Branch deletion governance.
8. Multi-team repo access (`repo_team_access` junction table).
9. Multi-device SSH key addition flow (envelope re-wrap from existing device).
10. Recovery key envelope creation during team join.

Exit criteria:

- Share and decrypt across users works.
- Role restrictions enforced.
- Branch-level restrictions enforced even when repo role allows broader access.
- Unmatched branches fall through to default-deny.
- Protected branch deletion blocked without owner approval.
- Secondary team members can access shared repos with role ceiling enforcement.
- New SSH key receives envelopes via re-wrap from existing device.

## 5. Phase 4: Passwordless Web and SSH Bridge

Deliverables:

1. Email magic-link login with browser session fingerprint binding.
2. SSH-to-web bridge login with IP binding.
3. Session revocation and device visibility.
4. MFA enrollment and verification (TOTP + WebAuthn).
5. Org-level MFA policy enforcement (disabled/optional/required/required_for_admins).
6. CI/CD service account creation and scoped token issuance.
7. Service account envelope distribution and branch allow-lists.

Exit criteria:

- Browser login works without passwords.
- Bridge token flow single-use, short-lived, and IP-bound.
- Magic links reject usage from non-originating browser.
- MFA challenge works for sensitive dashboard actions.
- Service account can pull secrets for allowed branches only.
- Service account token revocation immediately blocks access.

## 6. Phase 5: Rotation and Security Hardening

Deliverables:

1. Member removal workflow.
2. Team/repo key rotation automation with Cloudflare Workflows and saga/compensation pattern.
3. Security event detection and alerting through Workers Logs, Analytics Engine, Logpush, and Postgres audit queries.
4. Branch policy bypass detection and alerting.
5. Envelope consistency background checker through Cron Triggers and Queues.
6. SSH data-plane rate limiting (per-user and per-repo throttles).
7. Backup/restore procedure with crypto consistency validation.
8. Partial rotation failure recovery via checkpoint-based retry.
9. WAF custom rules, WAF rate limiting, Turnstile, and API Shield schema validation reviewed for production.

Exit criteria:

- Revocation tested with rotation completion.
- Audit trail complete for all privileged actions.
- Partial rotation failure is recoverable without data loss.
- Envelope consistency drift detected and alerted within one checker cycle.
- SSH rate limits prevent rapid exfiltration by compromised keys.
- Backup restore validated with envelope consistency check.
- R2 object retention, Postgres PITR, and Logpush retention are tested together.

## 7. Phase 6: Developer Experience and Integrations

Deliverables:

1. Organization-installable GitHub App with read-only `Members` permission.
2. Verified GitHub identity linking using immutable GitHub user IDs.
3. Organization default roles, GitHub team mappings, and role ceiling.
4. User-level grant, cap, and deny overrides with reason and expiry.
5. Signed webhook processing and scheduled full reconciliation.
6. Effective-access inspector and dry-run diff before enforcement.
7. Immediate authorization revocation and queued key rotation on access loss.
8. Optional VS Code integration.
9. Improved merge and conflict UX.
10. Evaluate Spectrum for public SSH edge and Cloudflare Containers for any HTTP-mediated container workloads.

GitHub authorization rules:
- GitHub is authoritative for linked organization and team membership.
- Wenvy remains authoritative for local owners, branch policy, role ceilings, and user overrides.
- GitHub-derived access can grant at most `admin`.
- Explicit Wenvy denies and branch policy always win.
- Removals deny online access immediately; any configured grace period applies only to destructive key rotation.

Exit criteria:

- Installation, webhook, and reconciliation reliability validated.
- User overrides remain independent from GitHub-derived grants and are visible in effective-access explanations.
- Removed GitHub members cannot fetch envelopes or blobs after sync.
- GitHub App requests no repository permission and cannot mutate GitHub membership.
- Developer onboarding time reduced measurably.

## 8. KPI Suggestions

1. Median push and pull latency.
2. Share-to-access provisioning time.
3. Rotation completion duration (with SLA: ≤5 minutes for teams ≤50 members).
4. Failed auth and denied access rates.
5. Secrets incident count and mean time to containment.
6. Unauthorized protected-branch write attempts.
7. Envelope consistency drift detection rate (target: 0 undetected drift per month).
8. Service account token usage vs. rate limit breach frequency.
9. MFA enrollment coverage across org members.
10. Recovery key enrollment rate.
11. Mean time from member removal to rotation completion.
12. Magic link and bridge token interception attempt rate.

## 9. Suggested Team Allocation

1. Core platform engineer: SSH, metadata, branch consistency, policy engine, and wire protocol.
2. Security engineer: crypto model, auth token, MFA, rotation correctness, and envelope consistency.
3. Full-stack engineer: web auth, governance UI, and service account management dashboard.
4. DevOps engineer: deployment, observability, backup/recovery, and crypto consistency validation.
