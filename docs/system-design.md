# System Design

## 1. Objective

Design Wenvy as a zero-knowledge, terminal-first secrets collaboration platform with:

- End-to-end encryption (E2EE)
- Team-based RBAC (GitHub-like roles)
- GitHub App-backed organization and team RBAC inheritance
- Branch-based access control (`dev`, `staging`, `production`, feature branches)
- Passwordless website authentication (email magic link + SSH bridge)
- TypeScript CLI-first secret operations

## 2. Architecture Principles

1. Client-side cryptography only for secret payloads.
2. Server enforces identity, authorization, and audit, but cannot decrypt secrets.
3. HTTPS Worker routes are the primary MVP transport for operational workflows; optional SSH compatibility can be added as a TypeScript Node origin.
4. Web app is governance and access management first.
5. Key rotation is a first-class lifecycle operation.
6. Authorization is evaluated at both repo-level and branch-level policy scopes.

## 3. High-Level Component Architecture

1. CLI Client
- Parse and canonicalize env key-value snapshots.
- Encrypt/decrypt snapshots locally.
- Sign commit metadata.
- Push/pull over SSH.
- Perform merge conflict logic locally.

2. Terminal Data Plane
- Authenticate CLI requests.
- Authorize commands against RBAC.
- Route push/pull/share operations through Worker HTTPS endpoints.
- Issue terminal-to-web bridge login tokens.
- Optional SSH compatibility runs as a TypeScript Node TCP service behind Cloudflare Tunnel or Cloudflare Spectrum.

3. Cloudflare Worker Web/API Control Plane
- Passwordless email auth.
- Session management.
- Team and repository management.
- Invite flow.
- Audit and reporting endpoints.
- Serves dashboard assets through Workers Static Assets.
- Exposes Hono/TypeScript API routes backed by OpenAPI 3.1 contracts.

4. Metadata Database (Postgres via Hyperdrive)
- Identity/auth data.
- RBAC relations.
- Branch policies and branch protection rules.
- Cryptographic envelope metadata.
- Commit and branch metadata.
- Immutable audit events.
- Postgres is the production source of truth; Cloudflare Hyperdrive is the Worker access layer.

5. Blob/Object Storage (Cloudflare R2)
- Encrypted snapshot objects only.
- Buckets are private; object names must not leak org, repo, branch, environment, or secret names.

6. Durable Objects
- Single-use magic-link and bridge-token consumption.
- Per-repo and per-branch write serialization.
- Strongly consistent coordination for branch heads, idempotency, and rate counters.

7. Queues, Workflows, and Scheduled Workers
- GitHub App webhook processing and scheduled org/team reconciliation.
- Rotation jobs through Cloudflare Workflows.
- Email delivery retries.
- Envelope consistency checker through Cron Triggers and Queue consumers.

8. CI/CD Service Account Gateway
- Service accounts authenticate via scoped API tokens (not SSH keys or email).
- Tokens are org-scoped, team-scoped, or repo-scoped with explicit branch allow-lists.
- Tokens are hashed server-side; raw token shown only at creation.
- Service accounts cannot manage membership, rotate keys, or modify policies.
- Pull-only or push-and-pull capability explicitly set per token.
- Service account actions are fully audited under a dedicated actor type.

9. GitHub App RBAC Adapter
- Organization-installed GitHub App with read-only `Members` permission.
- Links immutable GitHub user, organization, and team IDs to Wenvy identities.
- Maps organization membership and GitHub teams to Wenvy roles.
- Applies Wenvy organization policy and user-level grants, caps, and denies.
- Receives signed webhooks and performs periodic reconciliation.
- Never receives secret plaintext and never modifies GitHub membership.

## 4. Trust Boundaries

1. Trusted boundary
- User device runtime and local private key usage.

2. Semi-trusted boundary
- Server control plane for authz and metadata integrity.

3. Untrusted boundary
- Network, R2 dumps, DB leak scenarios.

Design goal: compromise of server data stores should not reveal secret plaintext.

## 5. Data Domains

1. Identity Domain
- Users, emails, SSH keys, sessions.

2. Access Domain
- Organizations, teams, roles, invitations, GitHub mappings, and user overrides.

3. Policy Domain
- Repo permissions, branch rules, protected branch controls.

4. Crypto Domain
- Team key versions, per-user envelopes, repo key versions.

5. Versioning Domain
- Repos, branches, commits, snapshots, parent graph.

6. Observability Domain
- Audit events, security events, operational job records.

## 6. Branch Model and Access Control

1. Branch model
- Long-lived branches: `dev`, `staging`, `production`.
- Optional release and feature branches.

2. Branch categories
- `development`: rapid iteration.
- `preproduction`: controlled validation.
- `production`: highest protection level.

3. Access evaluation order
- Validate user identity.
- Validate org/team membership and base role.
- Validate repo-level permission.
- Validate branch-level override/policy.
- Evaluate branch protection requirements before accepting write.

4. Default policy baseline
- `dev`: editors and above can write.
- `staging`: editors can propose/push, admin/owner can enforce promotion and approvals.
- `production`: no direct editor writes; admin/owner only with stricter controls.

5. Protected branch controls
- Optional mandatory approval count.
- Optional write freeze windows.
- Optional force-push disallow.
- Mandatory audit events for any policy exception.

6. Branch pattern precedence rules
- Exact branch name match takes highest precedence (e.g. `production`).
- Prefix wildcard match is next (e.g. `release/*`).
- Global wildcard (`*`) is lowest precedence.
- If no policy matches a branch, **default-deny** applies: only `admin` and `owner` can write.
- New branches do not automatically inherit policies; they fall through to default-deny until an explicit policy is created.

7. Branch deletion governance
- Branch deletion is a destructive operation requiring at least `admin` role.
- Protected branches cannot be deleted without `owner` approval.
- Long-lived branches (`dev`, `staging`, `production`) cannot be deleted unless branch protection is explicitly removed first.
- All branch deletion actions emit immutable audit events.

## 7. Deployment Topology

1. Edge/API layer
- Cloudflare DNS, TLS, WAF, rate limiting, request tracing, and Turnstile for interactive abuse checks.

2. App layer
- Cloudflare Worker dashboard/API.
- Optional TypeScript Node SSH compatibility origin behind Cloudflare Tunnel or Spectrum.
- Queue consumers and Workflow entrypoints for async jobs.

3. State layer
- Managed Postgres reached from Workers through Hyperdrive.
- R2 private buckets for encrypted snapshots and exported logs.
- Durable Objects for coordination and single-use-token state.
- Workers KV only for read-heavy, non-authoritative config.

4. Security layer
- Cloudflare Secrets Store or Worker secrets for provider credentials.
- Cloudflare Access for internal/staging admin surfaces.
- API Shield schema validation and optional mTLS for enterprise API hardening.
- Server-side signing keys are for non-secret metadata only.

## 8. Multi-Team Repository Access

The base model binds a repo to a single team (`repos.team_id`). For cross-team access:

1. `repo_team_access` allows granting additional teams read/write access to a repo.
2. Each access grant specifies a role ceiling (viewer, editor) for the secondary team.
3. The owning team retains full governance (admin/owner controls).
4. Envelope distribution extends to members of secondary teams with appropriate key wrapping.
5. Revoking a secondary team's access triggers rotation of repo keys (since members of that team had envelope access).

This avoids duplicating repos or creating artificial super-teams while preserving the envelope-based crypto model.

## 9. Why Not Symlink-Based Git as Core Model

Using symlinks to wire secret files into a regular Git tree can work as a developer convenience, but it is not sufficient as system architecture because:

1. It risks accidental plaintext persistence.
2. It does not solve secure multi-recipient key distribution.
3. It does not provide revocation-safe team sharing.
4. It conflates source-code history with sensitive secret lifecycle.

Recommended approach:

- Keep app Git repo unchanged.
- Keep Wenvy state under `.wenvy/` metadata and encrypted object model.
- Materialize plaintext only as ephemeral runtime injection when required.

## 9. Non-Functional Targets

1. Security
- Zero plaintext exposure on server-side persistence.

2. Reliability
- Strong consistency for branch head updates.
- Idempotent push/pull and share actions.

3. Performance
- Envelope updates should avoid re-encrypting large blobs.
- Secret pull should complete quickly for typical env sizes.

4. Auditability
- Every membership and key lifecycle action must be traceable.
- Every branch policy change and protected-branch write must be traceable.
- Every GitHub-derived role change must identify the installation, delivery, mapping, and prior/effective role.

5. Operability
- Rotation, revocation, and incident response must be automatable.

## 10. GitHub-Derived Authorization

GitHub is authoritative only for memberships linked through the GitHub App. Wenvy remains authoritative for branch policy, cryptographic envelopes, local owners, and explicit user overrides.

Effective role evaluation:

1. Collect the organization default and mapped GitHub team grants.
2. Add active user grants and choose the highest role.
3. Bound the result by the organization role ceiling and user caps.
4. Apply organization, team, and repo denies; deny wins.
5. Apply repo ceilings and branch policy.

GitHub sync can grant at most `admin`; Wenvy `owner` remains local-only. Membership removal blocks new access immediately and queues key rotation. See `github-app-rbac.md` for the complete contract.

## 11. Canonical Snapshot Format Specification

1. Format: UTF-8 encoded, newline-delimited key-value pairs.
2. Sorting: keys sorted lexicographically (byte-order) before serialization.
3. Separator: `=` with no surrounding whitespace for the delimiter.
4. Encoding: values containing newlines, `=`, or non-printable characters are base64-encoded and prefixed with `b64:`.
5. Empty values: represented as `KEY=` (key followed by separator, no value).
6. Comments and blank lines: stripped before canonicalization.
7. Trailing newline: exactly one trailing `\n` after the last key-value pair.
8. Hash: SHA-256 of the canonical byte representation. Identical env states must always produce identical hashes.

Example canonical form:
```
API_KEY=sk-abc123
DATABASE_URL=postgres://localhost/mydb
MULTILINE_CERT=b64:LS0tLS1CRUdJTi...
```

## 12. Terminal Wire Protocol

1. MVP transport: HTTPS requests to Worker routes.
2. Optional compatibility transport: standard SSH channel over the TypeScript Node SSH service.
3. Command dispatch: CLI sends typed command payloads to Worker routes.
4. Command vocabulary:
   - `wenvy push <repo> <branch>` — upload encrypted snapshot + commit metadata.
   - `wenvy pull <repo> <branch>` — download head commit metadata, envelopes, and blob reference.
   - `wenvy share <repo> <user>` — trigger envelope creation for a user.
   - `wenvy rotate <scope> <id>` — request key rotation.
   - `wenvy bridge-login` — request one-time web bridge token.
   - `wenvy keys list|add|revoke` — manage SSH keys.
5. Payload encoding: JSON request/response bodies over HTTPS for MVP. Optional SSH compatibility uses length-prefixed JSON frames over the SSH channel.
   - Request frame: `{ "cmd": "push", "repo": "slug", "branch": "dev", "metadata": {...}, "blob_size": 4096 }`
   - Response frame: `{ "status": "ok", "data": {...} }` or `{ "status": "error", "code": "DENIED", "message": "..." }`
6. Blob transfer: ciphertext bytes uploaded to the Worker/R2 blob route after metadata authorization.
7. Idempotency: each push includes a client-generated idempotency key; server deduplicates within a TTL window.

## 13. `.wenvy/` Local Directory Layout

```
.wenvy/
├── config.json          # Repo binding: org, team, repo slug, remote API host
├── state/
│   ├── head.json        # Current local branch head references
│   ├── branches/        # Per-branch metadata cache
│   │   ├── dev.json
│   │   ├── staging.json
│   │   └── production.json
│   └── envelopes/       # Cached key envelopes for offline decrypt
│       ├── team_key.enc
│       └── repo_key.enc
├── snapshots/           # Local encrypted snapshot cache (prunable)
│   └── <commit-hash>.enc
├── keys/
│   └── active_fingerprint  # Fingerprint of the SSH key used for this repo
└── logs/
    └── sync.log         # Local operation log for debugging
```

Guidelines:
- No plaintext secrets are ever written under `.wenvy/`.
- Envelope cache is refreshed on each pull; stale cache never used for push.
- `config.json` is safe to commit to application Git repo (contains no secrets).
- `.wenvy/snapshots/` can be pruned; blobs are always re-fetchable from server.

## 14. Merge Conflict Strategy for Env Key-Value Pairs

1. Conflict detection: when two commits modify the same key on the same branch, a conflict is raised during push (server rejects if local parent does not match branch head).
2. Pull and rebase: CLI pulls latest head, performs three-way diff on key-value pairs.
3. Three-way diff semantics:
   - Key added on both sides with same value: auto-resolve (keep one).
   - Key added on both sides with different values: conflict — prompt user.
   - Key modified on one side only: auto-resolve (take the modification).
   - Key modified on both sides to same value: auto-resolve.
   - Key modified on both sides to different values: conflict — prompt user.
   - Key deleted on one side, modified on other: conflict — prompt user.
   - Key deleted on both sides: auto-resolve (delete).
4. Conflict resolution: CLI presents conflicts interactively; user picks values.
5. Merge commit: after resolution, CLI creates a merge commit with two parents.
6. No automatic last-write-wins: explicit human resolution is required for true conflicts.
