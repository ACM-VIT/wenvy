# Platform Decisions

Reviewed: 2026-06-19

## 1. Decision Matrix

| Concern | Decision |
|---|---|
| CLI and key agent | Go outside Cloudflare; cryptography and plaintext remain local |
| Raw SSH | Go gateway behind Cloudflare Tunnel for MVP, Spectrum if justified later |
| Web/API | Cloudflare Workers with Hono and React/Vite Static Assets |
| Production relational state | Managed Postgres through Hyperdrive |
| Ciphertext blobs | Private R2 |
| Branch/token coordination | Durable Objects |
| Fanout and retry | Queues |
| Client-assisted rotation | Workflows waiting for external client events |
| Scheduled repair | Cron Triggers |
| Public config cache | Workers KV, never authoritative security state |
| GitHub membership | Read-only organization GitHub App |
| Provider credentials | Cloudflare Secrets Store or Worker secrets |

## 2. Workers for the Governance Plane

Workers host the dashboard, HTTPS API, magic-link/session logic, policy evaluation, key-directory API, and orchestration endpoints. Workers do not decrypt customer account bundles or secret payloads.

React + Vite is the default dashboard stack. Next.js/OpenNext is not justified unless a concrete SSR requirement appears.

## 3. Postgres over D1

The schema requires partial unique indexes, foreign keys, activation transactions, recursive/history queries, audit retention, and strict branch/key invariants. Managed Postgres is the production source of truth. D1 may be used only for isolated prototypes under a separate ADR.

## 4. Durable Objects over Redis Locks

Use named coordinators:

- `BranchCoordinator(repository_id, branch_id)` for ref updates and protected-change activation.
- `AuthTokenCoordinator(token_partition)` for one-time token consumption.
- `RotationCoordinator(rotation_job_id)` for client claim leases and activation serialization.
- `RateLimitCoordinator(scope_id)` where application-level consistency is required.

After coordination, Postgres transactionally records authoritative state and audit data.

## 5. Queues versus Workflows

Queues handle independent retryable events. Workflows handle rotations because rotation has durable phases, can wait for an unlocked user client, and must resume after failure.

The workflow never generates Group or Vault keys. It transitions the job to `awaiting_client`, receives a signed artifact event, invokes validation, and coordinates atomic activation.

## 6. R2 for Ciphertext Only

R2 stores encrypted account bundles, immutable encrypted item payloads, signed audit exports, and operational log exports. Customer plaintext, decrypted keys, master passwords, recovery mnemonics, secret names, and deterministic name hashes are prohibited.

Object keys are opaque. R2 access is private and mediated by Workers/gateway or narrowly scoped short-lived operations.

## 7. KV Is Non-Authoritative

Workers KV may cache feature flags, public client configuration, witness public-key sets, pricing, or static documentation data. It must not store or decide:

- Sessions or revocation state.
- Branch heads or locks.
- Group membership or branch grants.
- Policies or approval state.
- Envelopes or rotation state.
- Key-directory checkpoints used for acceptance without authoritative verification.

## 8. SSH Ingress

Workers do not accept inbound raw TCP SSH. The Go gateway runs as a real TCP service:

- MVP: private origin reached through Cloudflare Tunnel.
- Scale option: redundant origins and Spectrum if product availability/cost fit.
- Cloudflare Containers are not assumed to provide the public raw TCP path.

The gateway disables shell features and implements only Wenvy's typed protocol.

## 9. Transparency Deployment

The primary directory log is part of the Worker/Postgres control plane. Three witnesses must not share the primary account's credentials or state:

- Witness A may run in a separate Cloudflare account.
- Witnesses B and C run on two independent non-primary hosting accounts/providers.
- Client acceptance requires any two signatures.

Witnesses verify Merkle consistency and sign hashes only. A provider outage may reduce enrollment/key-rotation availability but must not cause clients to bypass quorum.

## 10. Deployment Topology

- `app.wenvy.dev`: dashboard and governance API Worker.
- `ssh.wenvy.dev`: Go SSH gateway through Tunnel/Spectrum.
- Managed Postgres through Hyperdrive.
- Private R2 buckets for ciphertext and retained exports.
- Queue consumers and Workflow entrypoints in separately deployable Workers as scale requires.
- Witness endpoints on independent domains and credentials.

## 11. Explicit Rejections

- No Redis requirement for MVP coordination.
- No Workers KV security source of truth.
- No SSH private key conversion into encryption recipients.
- No RSA account-encryption fallback.
- No server-generated customer symmetric keys.
- No server-side merge of secret content.
- No web secret decryption in v1.
- No implicit plaintext `.env` working tree.

## 12. Primary References

- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Hyperdrive](https://developers.cloudflare.com/hyperdrive/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [R2](https://developers.cloudflare.com/r2/)
- [Queues](https://developers.cloudflare.com/queues/)
- [Workflows](https://developers.cloudflare.com/workflows/)
- [Workflow events](https://developers.cloudflare.com/workflows/build/events-and-parameters/)
- [Workers KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/)
- [Workers TCP sockets](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/)
- [Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/)
- [Cloudflare Spectrum](https://developers.cloudflare.com/spectrum/)
