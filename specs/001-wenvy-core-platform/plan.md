# Implementation Plan: Wenvy Core Platform

**Branch**: `001-wenvy-core-platform` | **Date**: 2026-06-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-wenvy-core-platform/spec.md`

## Summary

Build Wenvy as a monorepo with an Elixir/Phoenix control plane and governance UI,
an Elixir worker and SSH gateway runtime, and a Rust CLI that owns all plaintext,
cryptography, canonical repository objects, local merges, and Git-like workflows.
PostgreSQL is the authoritative store for identities, authorization, repository
metadata, append-only audit history, and a transactional outbox. Encrypted object
payloads are stored behind an object-store port, asynchronous work behind an
at-least-once queue port, and disposable acceleration data behind a cache port.
Provider adapters are selected by configuration and must pass shared conformance
suites; planned adapters cover S3-compatible storage, Google Cloud Storage,
RabbitMQ, Cloudflare Queues, and the Redis protocol used by Redis and Valkey.

## Technical Context

**Language/Version**: Elixir 1.18+ on Erlang/OTP 27+ for backend services; Rust
2024 edition with MSRV 1.85+ for the CLI and local cryptographic core; SQL for
PostgreSQL schema and invariants

**Primary Dependencies**: Phoenix and Phoenix LiveView, Ecto/Postgrex, Plug,
Telemetry and OpenTelemetry on Elixir; Tokio, Clap, Serde, Reqwest with rustls,
SQLx for local SQLite metadata, RustCrypto primitives, `secrecy`, and `zeroize` on
Rust. Dependency versions are locked by `mix.lock` and `Cargo.lock` and upgraded
through reviewed compatibility changes.

**Storage**: PostgreSQL 16+ is authoritative; immutable encrypted payloads use an
`ObjectStore` port; the CLI uses repository files plus SQLite for indexes and
derived local state; `Cache` data is non-authoritative and rebuildable

**Testing**: ExUnit, StreamData, Ecto SQL Sandbox, adapter conformance tests, and
integration tests with disposable PostgreSQL/provider services; `cargo test`,
property tests, golden canonical-object fixtures, security regression tests, and
cross-language contract tests; end-to-end CLI/SSH/API tests and load benchmarks

**Target Platform**: Containerized Linux backend and workers; Rust CLI binaries
for Linux, macOS, and Windows; evergreen browsers for the governance UI

**Project Type**: Monorepo containing web service, governance web UI, SSH gateway,
workers, provider adapters, shared contracts, and a cross-platform CLI

**Performance Goals**: Preserve the specification budgets: status/diff for 10,000
secrets within 2 seconds, one-item stage/commit within 3 seconds, and a
non-conflicting 10,000-item merge within 10 seconds for 95% of reference runs.
Control-plane metadata requests target 500 ms p95 and push/fetch negotiation
targets 1 second p95, excluding encrypted blob transfer. Queue handlers must
sustain 100 jobs/second per worker pool under the reference workload.

**Constraints**: The backend, workers, logs, queue, cache, and object store never
receive plaintext secret names or values. Unknown object/protocol versions are
rejected. Network object uploads default to a 64 MiB encrypted-object limit and
1,000 objects per negotiation batch. Local status, diff, staging, and merge remain
offline-capable. Queue delivery is at-least-once, so all handlers are idempotent.
Cache failure cannot change correctness. Provider-specific types do not cross port
boundaries.

**Scale/Scope**: Initial validation baseline is 10,000 live secret items per
branch, 100 branches per repository, 1,000 members per organization, 10 million
immutable object/audit metadata rows per deployment, and encrypted attachments up
to 64 MiB each. Limits are configurable only where contract negotiation exposes
the effective server value.

## Architecture and Ownership Boundaries

- `backend/apps/wenvy_domain` owns account, organization, policy, repository graph,
  revocation, rotation, and audit state transitions. It has no Phoenix, Ecto, or
  provider SDK dependencies.
- `backend/apps/wenvy_control` owns HTTP/OpenAPI, LiveView governance flows, SSH
  subsystem request handling, authentication, and presentation. It delegates all
  policy decisions to `wenvy_domain`.
- `backend/apps/wenvy_persistence` owns Ecto schemas, PostgreSQL transactions,
  append-only constraints, and the transactional outbox.
- `backend/apps/wenvy_providers` owns the object-store, queue, and cache behaviours,
  adapters, configuration, health checks, and provider conformance suites.
- `backend/apps/wenvy_workers` owns outbox dispatch, rotation coordination,
  notification delivery, garbage collection, and idempotent queue consumers.
- `cli/crates/wenvy-core` is the sole owner of plaintext normalization, canonical
  objects, repository graph operations, merge rules, key hierarchy operations,
  and redaction policy.
- `cli/crates/wenvy-cli` owns commands, local identity selection, prompts, and
  user-facing output. `wenvy-transport` owns HTTP and SSH transport only.
- `contracts/` is normative across runtimes. OpenAPI, canonical object schemas,
  SSH wire messages, and golden fixtures are versioned together. Generated types
  may depend on contracts; domain logic may not depend on generated transport code.

## Provider Port Semantics

- `ObjectStore`: streaming `put_if_absent`, `get`, `head`, and lifecycle-only
  `delete`, keyed by opaque encrypted object ID. Adapters expose capabilities such
  as multipart upload but callers depend only on the common contract. Writes are
  immutable and checksum-verified.
- `Queue`: publish a versioned envelope and consume deliveries with explicit
  `ack`/`retry`/`dead_letter`. The common guarantee is at-least-once delivery with
  no ordering assumption; handlers use idempotency keys persisted in PostgreSQL.
  Cloudflare push delivery and RabbitMQ pull delivery terminate in separate
  adapters but enter the same consumer boundary.
- `Cache`: namespaced `get`, `put` with TTL, and `delete`. Redis and Valkey share
  one RESP-compatible adapter unless provider conformance proves divergent
  behavior. Cache entries contain no plaintext secrets and are never an authority
  for authentication, authorization, audit, or key state.
- Every port ships with an in-memory test adapter and a black-box conformance suite.
  Startup validates configured adapter capabilities and fails closed on an unknown
  or incomplete provider.

## Constitution Check

*GATE: Passed before research and passed again after design.*

### I. Code Quality Is a Release Gate — PASS

Ownership is split between pure Elixir domain logic, persistence, transports,
provider adapters, workers, and the Rust local core. Policy evaluation exists only
in `wenvy_domain`; plaintext and cryptographic repository rules exist only in
`wenvy-core`. Provider SDKs are contained behind narrow ports with conformance
tests. ADRs are required for the cryptographic suite and canonical format, SSH
subsystem protocol, and external-provider port semantics.

### II. Tests Prove Behavior Before Merge — PASS

Unit and property tests cover normalization, deterministic encoding, merge tables,
policy precedence, redaction, and state machines. Integration tests cover
PostgreSQL constraints, HTTP/SSH contracts, object-store/queue/cache adapters,
outbox delivery, revocation, and rotation. Security tests prove that plaintext is
absent from server/provider payloads and logs, invalid signatures and unknown
versions fail closed, and revoked readers cannot obtain future key envelopes.
Performance suites enforce every declared local and network budget.

### III. UX Consistency Preserves Trust — PASS

The CLI contract defines Git-derived commands and output, always-visible commit
authorship, active SSH identity display, default redaction, merge conflict states,
and confirmations. The LiveView governance UI uses the same glossary and cannot
request plaintext. CLI and UI contract changes are reviewed with the relevant
OpenAPI and command-contract updates.

### IV. Performance Budgets Are Product Requirements — PASS

The plan retains all spec budgets and adds p95 control-plane, transfer-size, batch,
queue-throughput, and scale baselines. Criterion benchmarks, backend load tests,
query plans, Telemetry metrics, and provider adapter benchmarks are release gates.

### V. Security and Contract Integrity Are Non-Negotiable — PASS

The server stores only opaque encrypted content and public/derived metadata.
Canonical objects are signed and versioned; unknown versions are rejected.
Authorization and key-envelope eligibility are checked independently. PostgreSQL
enforces audit immutability. API, SSH, provider, and object contracts are explicit
and versioned. Security/protocol ADRs are mandatory before implementation merges.

### Post-Design Re-evaluation

PASS. The data model records lifecycle invariants, contracts define version and
failure behavior, and the quickstart supplies automated validation paths. No
constitution exception is required.

## Project Structure

### Documentation (this feature)

```text
specs/001-wenvy-core-platform/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── canonical-objects.md
│   ├── cli.md
│   ├── openapi.yaml
│   ├── provider-ports.md
│   └── ssh-wire.md
└── tasks.md
```

### Source Code (repository root)

```text
backend/
├── apps/
│   ├── wenvy_domain/
│   ├── wenvy_control/
│   ├── wenvy_persistence/
│   ├── wenvy_providers/
│   └── wenvy_workers/
├── config/
├── test/
│   ├── contract/
│   ├── integration/
│   ├── security/
│   └── support/
└── mix.exs
cli/
├── crates/
│   ├── wenvy-cli/
│   ├── wenvy-core/
│   ├── wenvy-crypto/
│   ├── wenvy-protocol/
│   └── wenvy-transport/
├── tests/
│   ├── contract/
│   ├── integration/
│   └── security/
├── Cargo.toml
└── rust-toolchain.toml
contracts/
├── openapi/
├── objects/
├── ssh/
└── fixtures/
infra/
├── compose/
└── containers/
scripts/
└── validation/
```

**Structure Decision**: Use one repository with an Elixir umbrella backend and a
Rust workspace CLI. This keeps deployment units and language-specific dependency
graphs explicit while versioning all cross-language contracts and fixtures in one
place. The feature-level `contracts/` documents planned surfaces; implementation
promotes their machine-readable forms and fixtures into root `contracts/`.

## Delivery Slices

1. Establish canonical objects, cryptographic envelopes, CLI repository storage,
   fixtures, and offline init/status/diff/add/commit/branch/merge behavior.
2. Establish accounts, emails, SSH identities, HTTP/SSH authentication, repository
   graph persistence, encrypted object upload/fetch, and push authorization.
3. Add organizations, groups, branch permissions, key-envelope distribution,
   append-only audit, revocation, rotation state, and workers.
4. Add the LiveView governance UI and provider adapters for S3-compatible storage,
   GCS, RabbitMQ, Cloudflare Queues, Redis, and Valkey-compatible RESP.
5. Complete historical lockout, cross-provider conformance, scale/security suites,
   operational dashboards, recovery exercises, and release packaging.

Each slice must be independently testable and may not merge with placeholder
security behavior or an unversioned contract.

## Complexity Tracking

No constitution violations require exceptions. The multi-application backend,
Rust workspace, and provider ports are required ownership boundaries for the
explicitly requested multi-runtime and multi-provider architecture, not optional
abstraction layers.
