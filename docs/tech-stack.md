# Tech Stack

Reviewed: 2026-06-19

## 1. Primary Stack

| Layer | Choice | Responsibility |
|---|---|---|
| CLI and key agent | Go, Cobra | Local encrypted state, K-V index, merge, crypto, SSH protocol, memory-only unlock agent |
| Local storage | Structured encrypted files initially; BoltDB only if required | `.wenvy` objects, index, worktree, refs, envelopes, and stash |
| SSH gateway | Go, `golang.org/x/crypto/ssh` | Ed25519 authentication and typed fetch/push protocol |
| Dashboard/API | Cloudflare Workers, Hono, React, Vite, TypeScript | Governance, auth, policy, directory, and orchestration APIs |
| API contract | OpenAPI 3.1 | Source of truth for HTTPS control-plane interfaces |
| Metadata | Managed Postgres through Hyperdrive | Relational source of truth |
| Ciphertext objects | Private Cloudflare R2 | Account bundles and immutable item payloads |
| Coordination | Durable Objects | Ref compare-and-swap serialization, token consumption, leases, rate counters |
| Async fanout | Cloudflare Queues and Cron Triggers | Email, GitHub reconciliation, checks, alerts |
| Rotation orchestration | Cloudflare Workflows | Durable workflow waiting for signed client artifacts |
| Read-mostly cache | Workers KV | Non-authoritative public configuration only |
| GitHub RBAC | Organization-installed GitHub App | Read-only organization/team membership |
| Observability | Workers Logs, Analytics Engine, Logpush, optional Sentry | Operational telemetry; Postgres remains audit source |

## 2. Go Crypto Dependencies

Use standard or well-maintained audited implementations; do not implement primitives manually.

- Argon2id and HKDF: `golang.org/x/crypto`.
- XChaCha20-Poly1305: `golang.org/x/crypto/chacha20poly1305`.
- Ed25519: Go `crypto/ed25519`.
- X25519: Go `crypto/ecdh`.
- HPKE: select a maintained RFC 9180-compatible Go implementation only after interoperability and test-vector review; pin the exact module and version in the crypto ADR.
- SSH: `golang.org/x/crypto/ssh`.
- BIP39 encoding: a maintained library with fixed test vectors; the mnemonic is encoding, not the KDF.
- Canonical objects and wire control frames: deterministic CBOR compliant with RFC 8949.

Do not use `age` SSH recipients, Ed25519-to-X25519 conversion, RSA OAEP, or SSH private keys for Wenvy envelopes.

## 3. CLI Architecture

- One static binary per supported OS/architecture.
- A local user-session agent holds decrypted keys in locked memory where supported and clears them on lock, timeout, or process exit.
- IPC is local-user restricted and challenge authenticated.
- Secret values are accepted by prompt, stdin, or file descriptor, not positional arguments.
- Structured serializers use RFC 8949 deterministic CBOR with cross-language golden fixtures.
- Local encrypted files use atomic write-rename and fsync behavior appropriate to each platform.

## 4. SSH Gateway

- Accept only `ssh-ed25519` and security-key Ed25519 user keys.
- Disable arbitrary shell, port forwarding, agent forwarding, X11, and filesystem subsystems.
- Dispatch a versioned typed protocol over SSH exec/channel frames.
- Enforce frame-size limits before allocation and stream ciphertext blobs.
- Share authorization contracts with the Worker control plane rather than duplicating policy semantics.
- Deploy on a VM/container behind Cloudflare Tunnel for MVP; evaluate Spectrum for public L4 edge.

Cloudflare Workers cannot serve inbound raw SSH, so Workers-only SSH is not an option.

## 5. Worker Control Plane

- Hono routes generated/validated against OpenAPI 3.1.
- React/Vite dashboard contains no secret decryption code.
- Hyperdrive connects to production Postgres.
- R2 access remains private and mediated by authenticated operations.
- Durable Objects coordinate only hot consistency paths; Postgres receives durable authoritative results.
- Service bindings isolate public API, queue consumers, and workflows as the deployment grows.

## 6. Key Transparency

- Merkle construction and canonical leaf/checkpoint formats use a small shared library with test vectors.
- Directory signing key lives in Cloudflare Secrets Store or Worker secrets.
- Three witness services run under separate credentials and at least two hosting failure domains outside the primary control-plane account.
- CLI releases embed witness public keys and enforce two-of-three quorum.
- Witness endpoints verify consistency before signing and persist their last accepted checkpoint.

## 7. Data and Storage Rules

- Postgres, not D1 or KV, is production source of truth.
- R2 object names are UUID/content identifiers and never include tenant, repository, branch, or secret names.
- Durable Objects do not become the sole durable copy of branch heads, grants, or jobs.
- KV never stores sessions, revocations, branch heads, policies, memberships, envelopes, or one-time tokens.
- All database access uses tenant-scoped queries and explicit transactions for activation paths.

## 8. Async Classes

- `email`
- `github-sync`
- `audit-fanout`
- `consistency-checks`
- `rotation-start`
- `security-alerts`

Queues carry IDs and hashes, never plaintext secrets or key material. Rotation Workflows hold only job/version metadata and wait for a client event containing signed encrypted artifacts.

## 9. Security Tooling

- Dependency and license scanning, SBOM generation, secret scanning, and signed release artifacts.
- Crypto golden vectors on every supported platform.
- Fuzzing for parsers, canonicalization, dotenv/JSON import, wire frames, commits, and envelopes.
- Static analysis and race detection for CLI/gateway code.
- WAF/rate limits and Turnstile for interactive HTTP abuse.
- TOTP and WebAuthn for governance MFA.
- Append-only audit table plus signed audit checkpoints exported to R2/SIEM.

## 10. Version Policy

- Pin crypto dependencies exactly and review upgrades explicitly.
- Pin Worker `compatibility_date` and advance deliberately.
- Critical security fixes: target 48 hours; other dependency updates: two weeks.
- Version every wire message, canonical object, envelope, KDF wrapper, and ciphertext suite.
- Unknown versions fail closed.

## 11. Deployment Environments

Development, staging, and production use separate Postgres databases, Hyperdrive configs, R2 buckets, Durable Object namespaces, queues, workflow bindings, signing keys, and witness policies. Production data or keys are never shared with preview environments.
