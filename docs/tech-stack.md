# Tech Stack

Reviewed: 2026-06-13

Wenvy should be built as a Cloudflare-first TypeScript platform for the dashboard, HTTP control plane, storage, coordination, security edge, background orchestration, and terminal client. The MVP data plane uses CLI-over-HTTPS because Cloudflare Workers do not accept inbound raw TCP. Raw SSH compatibility can be added later as a TypeScript Node origin behind Tunnel or Spectrum.

See `platform-decisions.md` for the decision matrix and source links.

## 1. Stack Goals

1. Preserve zero-knowledge secret handling: plaintext encryption and decryption happen on client devices only.
2. Keep CLI push/pull workflows low-latency and reliable.
3. Use Cloudflare-native products where they match the workload.
4. Avoid Cloudflare products where consistency or protocol limitations would weaken the design.
5. Keep a clean path from MVP to multi-tenant production.

## 2. Recommended Primary Stack

## Terminal Client

- Language: TypeScript
- Packaging: npm package with `wenvy` bin; single-file binary packaging can be added with a JS runtime packager later
- CLI framework: Commander
- Transport: HTTPS to Worker routes for MVP
- Crypto: Web Crypto-compatible primitives and audited TypeScript libraries selected by ADR
- Local metadata: JSON files under `.wenvy/`; use BoltDB only if local metadata becomes too complex for small files

Why:
- One language across client, Worker, domain logic, tests, and generated API clients.
- Good HTTP, filesystem, and package-distribution ergonomics.
- Keeps all secret plaintext handling on the user device.

## Terminal Data Plane

- MVP: TypeScript CLI-over-HTTPS routes on Workers.
- Optional SSH compatibility: TypeScript Node TCP service behind Cloudflare Tunnel or Spectrum.
- Protocol: typed JSON request/response contracts over HTTPS for MVP; SSH frames only if the optional compatibility service is added.

Why:
- Cloudflare Workers currently support outbound TCP sockets, but not inbound raw TCP connections to a Worker. A real SSH server is still required.
- HTTPS keeps the MVP fully TypeScript and Worker-native.
- Spectrum is the Cloudflare edge option for public TCP/UDP services when available.

## Web Dashboard and HTTP API

- Runtime: Cloudflare Workers
- Dashboard: React + Vite + TypeScript served through Workers Static Assets
- API framework: Hono on Workers
- API specification: OpenAPI 3.1 as the source of truth
- Client SDK generation: `openapi-generator`, `oapi-codegen`, or a typed TypeScript client generated from the OpenAPI schema
- Optional SSR alternative: Next.js on Workers via OpenNext, only if the dashboard needs Next-specific SSR/App Router features

Why:
- Workers can host static assets and backend APIs in one deployment.
- Hono keeps the control plane small and Worker-native.
- React + Vite is enough for a governance dashboard and avoids unnecessary SSR/runtime coupling.

Repository note:
- Keep implementation code under `apps/web-worker`, `packages/domain`, and `packages/terminal-client`.

## Data and Storage

- Production metadata source of truth: managed Postgres
- Cloudflare access layer: Hyperdrive binding from Workers to Postgres
- Encrypted snapshot storage: R2 private buckets
- Strong coordination: Durable Objects
- Read-mostly edge cache: Workers KV for non-authoritative config only
- Optional prototype database: D1 for early low-write experiments, not production source of truth

Why:
- Wenvy needs relational integrity, auditability, constraints, and transactional branch state. Postgres remains the safest production choice.
- Hyperdrive gives Workers pooled access to the regional Postgres database.
- R2 is the right Cloudflare object store for encrypted blobs.
- Durable Objects replace Redis-style locks and single-use-token coordination.
- KV is eventually consistent and must not hold security-critical mutable state.

## Async Processing

- General background work: Cloudflare Queues
- Rotation saga orchestration: Cloudflare Workflows
- Scheduled checks: Worker Cron Triggers
- Queue classes:
  - `email`
  - `audit-events`
  - `github-sync`
  - `envelope-checks`
  - `rotation-start`

Why:
- Queues fit retryable fanout and buffering.
- Workflows fit multi-step key rotation with checkpoints, retries, and partial-failure recovery.
- Cron Triggers are enough to schedule consistency checks and cleanup jobs.

## GitHub App RBAC

- Integration type: organization-installed GitHub App
- SDK: GitHub REST API through a Worker-compatible client such as Octokit
- Organization permission: `Members: read-only`
- Repository permissions: none for RBAC sync
- Authentication: short-lived installation access tokens
- Events: `installation`, `membership`, `organization`, and `team`
- Delivery: signed webhook endpoint -> `github-sync` Queue -> Postgres reconciliation
- Scheduled repair: Cron-triggered full reconciliation at least every six hours

Why:
- Installation identity and short-lived tokens avoid organization-wide personal access tokens.
- Read-only membership access is sufficient to list organization and team members.
- Webhooks reduce revocation delay; reconciliation repairs missed or reordered events.

## Email and Notifications

- Provider: Resend, Postmark, or SES over HTTPS APIs
- Templates: server-side rendered transactional templates in the Worker or a shared package
- Abuse protection: WAF rate limiting plus Turnstile where user interaction exists

Why:
- Workers cannot send SMTP over port 25 by default. Use an HTTPS email provider API.
- Magic links and invites need strong delivery and clear audit correlation.

## Observability

- Runtime logs: Workers Logs
- Log export: Workers Logpush to R2 and/or external SIEM
- Product/security metrics: Workers Analytics Engine
- Error tracking: Sentry optional
- Audit events: Postgres source of truth; never rely only on platform logs for audit

Why:
- Workers observability is native to the runtime.
- Audit data must remain queryable by org, actor, target, and time range.
- R2 is suitable for retained log exports.

## 3. Security Stack

1. TLS, WAF managed rules, WAF custom rules, and rate limiting at Cloudflare edge.
2. Turnstile on login, invite, and recovery forms.
3. Optional API Shield schema validation from the OpenAPI spec.
4. Optional API Shield mTLS for enterprise machine-to-machine endpoints.
5. Cloudflare Access for internal admin tools and staging dashboards.
6. Cloudflare Secrets Store or Worker secrets for provider credentials and server-side signing keys.
7. Key fingerprint pinning behavior in CLI.
8. Audit log immutability strategy: append-only Postgres table plus periodic signed snapshots exported to R2.
9. MFA stack:
   - TOTP: `otplib` or equivalent for Worker-compatible validation.
   - WebAuthn/FIDO2: WebAuthn server library that works in Workers, or a small origin service if required.
   - Backup codes: 10 single-use codes generated at MFA enrollment, stored as Argon2id or bcrypt hashes.
10. CI/CD service account auth:
   - Scoped bearer tokens with SHA-256 or BLAKE2b hash storage.
   - Token-bound asymmetric key pairs for envelope decryption.
   - Per-token rate limiting and branch allow-lists.

## 4. Branch Policy Implementation Stack

1. Policy storage: Postgres (`branch_policies`, `branch_role_rules`).
2. Policy evaluation path: Worker API and terminal client contracts both use shared TypeScript authorization modules.
3. Pattern precedence: exact match > prefix wildcard > global wildcard > default-deny.
4. Write serialization: `RepoBranchCoordinator` Durable Object per repo branch.
5. Approval workflow state: Postgres, with Durable Objects used only for coordination and idempotency.
6. Audit hooks: emit event per denied/allowed protected-branch action.
7. Branch deletion governance: enforced in Worker API before any branch state mutation.

## 5. Deployment Targets

## MVP

- Dashboard/API: single Worker with Static Assets and Hono API routes.
- Database: managed Postgres through Hyperdrive.
- Object storage: private R2 bucket.
- Coordination: Durable Objects for branch locks and token consumption.
- Background jobs: Queues and Workflows.
- Optional SSH compatibility service: TypeScript Node container/VM behind Cloudflare Tunnel.
- Email: Resend or Postmark HTTPS API.

## Scale-up

- Split dashboard, public API, internal admin API, queue consumers, and workflow entrypoints into separate Workers.
- Use separate Hyperdrive configs for read/write or environment-specific database access.
- Add Cloudflare Load Balancing for optional SSH compatibility origins where Tunnel/Spectrum topology requires it.
- Add Logpush to R2 plus external SIEM.
- Enable API Shield schema validation and mTLS for enterprise service-account endpoints.
- Use Spectrum for public SSH edge if plan availability and cost are acceptable.

## 6. Optional Alternatives

1. Use D1 for a small hosted prototype if Postgres operations are too heavy at MVP time. Document this in an ADR and re-evaluate before multi-tenant launch.
2. Use Next.js with OpenNext if dashboard SSR becomes important.
3. Add a TypeScript Node SSH compatibility service only if SSH UX remains a hard product requirement after the HTTPS CLI MVP.

## 7. Version and Dependency Policy

1. Pin Worker `compatibility_date` and advance it deliberately.
2. Pin major versions for crypto and auth dependencies.
3. Establish regular dependency audit cadence.
4. Run SBOM generation and vulnerability scanning in CI.
5. Crypto library selection rationale:
   - Prefer Web Crypto where it covers the primitive.
   - Prefer audited TypeScript libraries for age-compatible envelope encryption and XChaCha20-Poly1305.
   - Avoid rolling custom crypto; use audited, well-maintained libraries only.
6. Cloudflare binding policy:
   - Define all bindings in `wrangler.jsonc` or `wrangler.toml`.
   - Use separate dev/staging/prod resources.
   - Never share production R2 buckets, Durable Object namespaces, queues, or Hyperdrive configs with preview environments.
7. Dependency update SLA: critical security patches within 48 hours; non-critical within 2 weeks.
