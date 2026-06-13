# Platform Decisions

Reviewed: 2026-06-13

This document maps Wenvy's requirements to the platform services that fit the current architecture. Wenvy is an SSH-first, zero-knowledge secrets sync system, so the managed platform is useful for the HTTP control plane, dashboard, storage, orchestration, security edge, and observability. The raw SSH data plane needs special handling because Cloudflare Workers cannot currently accept inbound raw TCP connections.

## 1. Recommended Stack

| Wenvy layer | Primary choice | Why |
|---|---|---|
| Web dashboard | Cloudflare Workers with Static Assets, React, Vite, TypeScript | Workers can serve static assets and APIs from one deployment. The Cloudflare Vite plugin runs app code inside `workerd` for closer local/prod parity. |
| HTTP control plane | Cloudflare Workers, TypeScript, Hono | Good fit for auth, RBAC, branch policy checks, audit APIs, and service account APIs. Hono is small, Worker-native, and keeps request handlers explicit. |
| Production metadata database | Managed Postgres accessed from Workers through Hyperdrive | Wenvy's schema needs relational integrity, constraints, transactional branch updates, and audit queries. Hyperdrive gives Workers pooled, cached access to existing Postgres or Postgres-compatible databases. |
| MVP metadata option | D1 only for early low-write prototypes | D1 is Cloudflare's native serverless SQL database. Use it only if the product is still single-tenant or low-write, and the schema is consciously limited to SQLite semantics and D1 limits. |
| Encrypted snapshot blobs | R2 | Wenvy stores ciphertext objects only. R2 is S3-compatible object storage without typical cloud egress fees and with strong consistency per object. |
| Single-use tokens and locks | Durable Objects | Magic-link consumption, bridge-token consumption, branch head serialization, per-repo write locks, and rate counters need consistent coordination. Durable Objects provide global uniqueness and strongly consistent transactional storage per object. |
| Async tasks | Queues | Email retries, audit fanout, GitHub sync, envelope checks, and low-risk background jobs should use Queues for guaranteed delivery and buffering. |
| GitHub RBAC integration | Organization-installed GitHub App with `Members: read-only` | Installation tokens, signed webhooks, and stable GitHub IDs provide least-privilege org/team membership sync without repository access or long-lived personal tokens. |
| Rotation saga orchestration | Workflows | Key rotation is multi-step, retryable, and checkpointed. Workflows map directly to durable step execution, retries, sleeps, and waiting for external events. |
| Scheduled checks | Cron Triggers on Workers | Run envelope consistency checks, audit retention sweeps, stale invite cleanup, and backup validation triggers. |
| Read-mostly config cache | Workers KV | Use only for read-heavy, non-authoritative data: feature flags, static public config, JWKS cache, and pricing/config snapshots. Do not use KV for tokens, branch heads, locks, or authorization decisions that require read-after-write consistency. |
| SSH gateway | Go service behind Cloudflare Tunnel or Cloudflare Spectrum | The SSH protocol is raw TCP. Workers TCP sockets are outbound only today, so the Go SSH gateway must run as a real TCP service. Tunnel removes public origin ports; Spectrum is the Cloudflare L4 proxy option for public TCP/UDP services. |
| Container workloads | Cloudflare Containers where the workload is HTTP-mediated or Worker-routed | Containers can run non-JavaScript code as part of Workers apps, but they should not be treated as a replacement for public raw TCP ingress until the target ingress path is verified. |
| App credentials | Cloudflare Secrets Store or Worker secrets | Store provider credentials, signing keys for non-secret metadata, webhook secrets, and database credentials. Wenvy customer plaintext secrets must never be stored server-side. |
| Abuse protection | WAF custom rules, WAF rate limiting, Turnstile, optional API Shield | Protect login, invite, service-account, and API surfaces at the edge. API Shield schema validation and mTLS are strongest for enterprise API hardening. |
| Observability | Workers Logs, Workers Analytics Engine, Logpush to R2/SIEM, optional Sentry | Keep audit events in Postgres, operational logs in Workers Logs/Logpush, high-cardinality metrics in Analytics Engine, and exceptions in Sentry if desired. |
| Deployment | Wrangler, environment-specific bindings, GitHub Actions | Pin `compatibility_date`, define bindings per environment, and deploy Workers, Queues, Durable Objects, R2, and Hyperdrive through `wrangler` plus IaC where needed. |

## 2. Explicit Product Choices

### Use Workers instead of Pages for the app shell

Cloudflare now supports full-stack apps, static assets, APIs, and SSR on Workers. Pages is still valid for simple static sites, but Wenvy needs Durable Objects, Queues, Workflows, service bindings, and stronger observability. Use Workers with Static Assets as the default.

Use Next.js with the OpenNext adapter only if the dashboard needs Next-specific SSR/App Router features. For the first governance dashboard, React + Vite + Hono is simpler and avoids framework runtime constraints.

### Use Postgres + Hyperdrive instead of D1 for production

D1 is attractive for a small Worker-native prototype, but Wenvy's authoritative state includes:

1. Team, repo, branch, and policy relations.
2. Audit queries over tenant and actor scope.
3. Concurrency-sensitive branch head updates.
4. Rotation job state and envelope consistency checks.
5. Future enterprise reporting and retention requirements.

Postgres remains the production source of truth. Hyperdrive is the Cloudflare-native access layer for Workers. D1 can be revisited for local-first/community deployments or read-mostly auxiliary data, but it should not replace Postgres for the production control plane without a separate ADR.

### Use Durable Objects instead of Redis locks

The previous design used Redis for ephemeral tokens, distributed locks, and temporary state. On Cloudflare:

1. A `RepoBranchCoordinator` Durable Object serializes writes for one repo branch.
2. An `AuthTokenCoordinator` Durable Object enforces single-use magic and bridge tokens.
3. A `RateLimitCoordinator` Durable Object handles user, service account, and repo-level rate counters that need stronger consistency than edge WAF counters.
4. Postgres remains the durable audit/source-of-truth record after the Durable Object accepts an operation.

### Use Queues and Workflows instead of a generic worker pool

Use Queues for background fanout and retryable jobs. Use Workflows for long-running, checkpointed, multi-step jobs where partial failure must resume correctly. Team key rotation should be a Workflow, not a generic queue consumer, because each step has a security invariant.

### Use R2 for ciphertext blobs only

R2 stores encrypted snapshots and optional log exports. Object names should be content-addressed or UUID-based and should not reveal org names, repo names, branch names, environment names, or secret keys. R2 bucket access must be private and mediated by Workers or short-lived signed operations.

### Use a GitHub App instead of OAuth or personal access tokens for RBAC sync

Install the app on each linked GitHub organization and request only read-only `Members` organization permission. Use short-lived installation access tokens for reconciliation and signed webhooks for low-latency updates. User authorization is used only to prove the GitHub account linked to a Wenvy user.

The integration does not request repository permission and does not write organization or team membership. GitHub-derived roles are bounded by Wenvy organization policy; `owner` remains local-only. See `github-app-rbac.md`.

### Do not use KV for security-critical mutable state

Workers KV is eventually consistent. It is acceptable for read-heavy configuration and cached non-authoritative data. It is not acceptable for:

1. One-time token consumption.
2. Branch heads.
3. Repo write locks.
4. Session revocation checks requiring immediate effect.
5. Branch policy or RBAC decisions that need immediate propagation.

Use Durable Objects and Postgres for those paths.

## 3. SSH Gateway Options

Wenvy's CLI-first workflow depends on SSH. Cloudflare gives useful edge/networking options, but not all of them replace an SSH server.

| Option | Fit | Notes |
|---|---|---|
| Go SSH gateway on a small VM/container + Cloudflare Tunnel | Best MVP/default | No public inbound port on the origin. The origin runs the real SSH server. Good for early production. |
| Go SSH gateway behind Cloudflare Spectrum | Best public TCP edge when available | Spectrum is the L4 TCP/UDP proxy path for public SSH-like services. Plan availability and cost must be confirmed before committing. |
| Cloudflare Containers | Watch/optional | Good for code that needs a container and is orchestrated by Workers. Do not assume public raw TCP SSH ingress until the exact route is validated. |
| Workers only | Not viable for SSH today | Workers can create outbound TCP sockets, but inbound TCP connections to Workers are not currently supported. |

The docs should continue to model the SSH gateway as a Go service. The HTTP control plane can be Worker-native.

## 4. Deployment Topology

1. `app.wenvy.dev`
   - Worker with Static Assets for the dashboard.
   - Hono API routes under `/api`.
   - Bindings: Hyperdrive, R2, Queues, Durable Objects, Secrets Store, Analytics Engine.

2. `api.wenvy.dev`
   - Optional separate Worker if API isolation is preferred.
   - Same bindings as dashboard, but no static asset serving.

3. `ssh.wenvy.dev`
   - Go SSH gateway origin.
   - Published through Cloudflare Tunnel for MVP or Spectrum for public L4 edge.
   - Talks to the Worker HTTP control plane for authz decisions or directly to Postgres/R2 if latency requires it.

4. Background processing
   - Queue consumers for email, audit fanout, GitHub sync, and checks.
   - Workflows for team/repo key rotation.
   - Cron Triggers to enqueue periodic consistency checks.

5. Data
   - Managed Postgres as source of truth.
   - Hyperdrive between Workers and Postgres.
   - R2 for ciphertext blobs and exported logs.
   - Durable Objects for serialized coordination.

## 5. Source References

- Cloudflare Workers Static Assets: https://developers.cloudflare.com/workers/static-assets/
- Pages to Workers migration guide: https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/
- Cloudflare Vite plugin: https://developers.cloudflare.com/workers/vite-plugin/
- Cloudflare storage options: https://developers.cloudflare.com/workers/platform/storage-options/
- Hyperdrive: https://developers.cloudflare.com/hyperdrive/
- Durable Objects: https://developers.cloudflare.com/durable-objects/
- D1: https://developers.cloudflare.com/d1/
- R2: https://developers.cloudflare.com/r2/
- Queues: https://developers.cloudflare.com/queues/
- Workflows: https://developers.cloudflare.com/workflows/
- Workers KV consistency: https://developers.cloudflare.com/kv/concepts/how-kv-works/
- Workers TCP sockets: https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/
- Cloudflare Tunnel: https://developers.cloudflare.com/tunnel/
- Cloudflare Spectrum: https://developers.cloudflare.com/spectrum/
- Cloudflare Containers: https://developers.cloudflare.com/containers/
- Secrets Store: https://developers.cloudflare.com/secrets-store/
- Turnstile: https://developers.cloudflare.com/turnstile/
- WAF rate limiting rules: https://developers.cloudflare.com/waf/rate-limiting-rules/
- API Shield schema validation: https://developers.cloudflare.com/api-shield/security/schema-validation/
- Workers Logs: https://developers.cloudflare.com/workers/observability/logs/workers-logs/
- Workers Analytics Engine: https://developers.cloudflare.com/analytics/analytics-engine/
- Workers Logpush: https://developers.cloudflare.com/workers/observability/logs/logpush/
