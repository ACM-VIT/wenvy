# Phase 0 Research: Wenvy Core Platform

## Runtime and Application Shape

**Decision**: Use an Elixir umbrella for the control plane, governance UI, SSH
gateway, provider adapters, and workers; use a Rust workspace for the CLI,
cryptographic core, repository engine, protocols, and transports.

**Rationale**: Elixir/OTP fits concurrent network services and supervised workers,
while Rust gives the local plaintext/crypto boundary deterministic resource
control and portable static binaries. Separate domain and adapter applications
prevent Phoenix, Ecto, and provider SDKs from becoming domain dependencies.

**Alternatives considered**: One Elixir application was rejected because provider,
transport, and policy ownership would blur. A Rust backend was rejected because it
contradicts the selected backend stack. Sharing domain logic through a native FFI
was rejected because it complicates deployment and secret-memory auditing.

## Authoritative Persistence

**Decision**: PostgreSQL 16+ is authoritative for identity, policy, repository
graph metadata, key-envelope metadata, immutable audits, idempotency records, and a
transactional outbox. Ecto transactions are the only backend write boundary.

**Rationale**: Authorization, audit, ref updates, and revocation need relational
constraints and atomic transitions. The outbox atomically records business state
and asynchronous intent, avoiding distributed transactions with queue providers.

**Alternatives considered**: Event sourcing for all state was rejected as excess
complexity; append-only audit remains separate from mutable projections. Using a
queue as the system of record was rejected because queue guarantees vary. Direct
provider writes inside database transactions were rejected as non-atomic.

## Encrypted Object Storage

**Decision**: Store immutable encrypted payloads through an `ObjectStore` port;
keep object metadata, checksums, reachability, and lifecycle state in PostgreSQL.
Support S3-compatible and Google Cloud Storage adapters plus a filesystem test/dev
adapter.

**Rationale**: Large opaque blobs do not need relational query semantics. A narrow
streaming API supports both provider families without leaking SDK types. Database
metadata enables authorization and garbage collection without listing buckets.

**Alternatives considered**: PostgreSQL large objects were rejected for the main
payload path due to backup and throughput coupling. A universal filesystem API was
rejected because cloud stores have different consistency and multipart behavior.
Cross-provider mirroring is deferred; it belongs above the single-store port.

## Queue Semantics

**Decision**: Define a versioned queue envelope and an at-least-once `Queue` port
with explicit acknowledge, retry, and dead-letter outcomes. Use PostgreSQL-backed
idempotency and an outbox dispatcher. Support RabbitMQ pull consumers and
Cloudflare Queues push consumers as separate adapters.

**Rationale**: At-least-once with no global ordering is the portable guarantee.
Idempotent consumers and persisted job state make correctness independent of
redelivery. Push and pull transports can converge at the same delivery handler.

**Alternatives considered**: Exactly-once delivery was rejected because neither
provider-independent transport nor side-effect execution can guarantee it.
Requiring FIFO was rejected because it would exclude providers or reduce
throughput. Oban-only execution was rejected because external queue portability is
an explicit requirement, though PostgreSQL may still run the outbox dispatcher.

## Cache Semantics

**Decision**: Define a best-effort TTL `Cache` port for derived, non-sensitive,
non-authoritative data. Use one RESP adapter for Redis and Valkey where conformance
matches, and an in-memory test adapter.

**Rationale**: Redis and Valkey share the required primitive subset. Treating
cache misses and outages as normal prevents authorization or security state from
depending on stale cache entries.

**Alternatives considered**: Caching decrypted content is prohibited. Caching
authorization decisions was rejected because revocation races are unacceptable.
Provider-specific advanced structures were rejected from the common port.

## Cryptographic and Canonical Object Boundary

**Decision**: Keep all plaintext processing in Rust. Use a versioned deterministic
CBOR profile for signed objects, XChaCha20-Poly1305 AEAD for secret payloads,
HKDF-SHA-256 for context-separated derivation, Ed25519 for object signatures, and
X25519-based recipient wrapping. Record the exact suite and vectors in an ADR
before implementation.

**Rationale**: Deterministic bytes are required for signatures and object IDs.
The selected primitives are well-supported, misuse-resistant when nonces and
contexts are generated correctly, and available in audited RustCrypto libraries.
Versioned suite IDs permit deliberate future migration and reject ambiguity.

**Alternatives considered**: JSON was rejected as the signed representation due to
canonicalization risk. Server-managed encryption was rejected because it violates
E2EE. AES-GCM was considered but XChaCha20-Poly1305 reduces random-nonce collision
risk for local clients. Inventing custom primitives is prohibited.

## API and SSH Transport

**Decision**: Use versioned HTTPS/JSON control APIs described by OpenAPI and an SSH
`wenvy` subsystem carrying length-prefixed canonical messages for repository
negotiation and identity proof. Blob bytes transfer through authorized HTTPS
streaming endpoints or provider-neutral signed transfer grants.

**Rationale**: OpenAPI supports UI/CLI contract testing. SSH integrates local SSH
identities without pretending Wenvy is a Git server. Separating negotiation from
blob transfer keeps authorization auditable and enables efficient object storage.

**Alternatives considered**: Git smart protocol was rejected because Wenvy objects
and branch-key semantics are not Git objects. SSH command-line parsing was rejected
as fragile. Direct permanent bucket credentials were rejected as excessive access.

## Repository and Merge Execution

**Decision**: Execute status, diff, staging, commit construction, normalization,
and three-way K-V merge entirely in the Rust core. The backend validates signed
object structure, graph reachability, actor eligibility, and atomic ref updates but
does not interpret encrypted key names or values.

**Rationale**: This preserves offline behavior and prevents plaintext leakage.
Optimistic ref compare-and-swap gives explicit non-fast-forward handling without
server-side merges.

**Alternatives considered**: Server-side merge was rejected because the server
cannot inspect normalized keys. Last-write-wins was rejected because it loses
changes. Client-specific merge rules were rejected in favor of shared fixtures.

## Audit, Revocation, and Rotation

**Decision**: Insert audit rows in the same PostgreSQL transaction as privileged
state changes and prohibit update/delete at the database level. Effective loss of
read access creates a persisted `rotation_due` state and outbox event. Workers
coordinate rotation; clients create replacement encrypted envelopes.

**Rationale**: Transactional audit prevents invisible state changes. Explicit
rotation state is observable and retryable. The server can coordinate but cannot
derive or unwrap branch keys.

**Alternatives considered**: Audit through queue-only consumers was rejected due
to loss windows. Automatic server-side re-encryption was rejected because the
server lacks plaintext and vault keys. Treating write-to-read downgrade as a key
revocation was rejected because read access remains effective.

## Observability and Sensitive Data

**Decision**: Use structured Telemetry/OpenTelemetry signals with opaque IDs,
operation classes, durations, result codes, provider name, retry count, and object
sizes. Apply allow-list logging and automated plaintext canary tests. Never record
payloads, normalized keys, encrypted key material, tokens, or raw SSH signatures.

**Rationale**: Operations need provider and state-machine visibility without
turning logs or traces into a new secret store.

**Alternatives considered**: Deny-list redaction was rejected as incomplete.
Verbose request-body logging was rejected. Provider dashboards alone were rejected
because they cannot correlate domain transitions.

## Version Baselines

**Decision**: Establish supported minimums rather than claiming floating “latest”
versions: Elixir 1.18+, OTP 27+, Rust 2024 edition/MSRV 1.85+, and PostgreSQL 16+.
Lock exact dependency and toolchain patch versions during repository bootstrap.

**Rationale**: Reproducible locks matter more than unbounded latest-version
selection. These baselines support the selected language features while allowing
CI to test an explicit minimum and a controlled upgrade lane.

**Alternatives considered**: Unpinned latest versions were rejected as
non-reproducible. Older editions/runtimes were rejected because the project has no
legacy compatibility requirement.
