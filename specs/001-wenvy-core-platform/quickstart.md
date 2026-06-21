# Quickstart Validation Guide

This guide defines the runnable validation path the implementation must provide.
Commands describe the planned repository layout and become executable as delivery
slices land.

## Prerequisites

- Elixir 1.18+ and Erlang/OTP 27+
- Rust toolchain supporting edition 2024 (MSRV 1.85+)
- PostgreSQL 16+
- Docker or a compatible container runtime for provider integration tests
- `just` for the repository validation recipes

No cloud account is required for the default path. It uses PostgreSQL, filesystem
object storage, an in-process queue, and an in-memory cache. Provider conformance
profiles require their respective local emulator/service or test credentials.

## Bootstrap

```bash
just bootstrap
just dev-deps-up
just migrate
just seed-reference-accounts
```

Expected: PostgreSQL is ready, migrations apply cleanly, and two synthetic Wenvy
accounts with distinct SSH test identities are available. Seed data contains no
production credentials or secret material.

## Run Automated Gates

```bash
just format-check
just lint
just test-unit
just test-contract
just test-integration
just test-security
just test-e2e
just benchmark-reference
```

Expected:

- Elixir and Rust consume the same canonical-object golden fixtures.
- PostgreSQL rejects audit mutation and duplicate active SSH fingerprints.
- No server, queue, cache, object-store, log, or trace fixture contains plaintext
  secret names/values or key material.
- Status/diff, commit, merge, control-plane p95, queue throughput, and object-size
  budgets from [plan.md](plan.md) pass.

## Start the Local Stack

```bash
just dev
```

Expected services:

- governance/API endpoint on the configured local HTTPS port;
- SSH `wenvy` subsystem endpoint;
- supervised workers and outbox dispatcher; and
- Rust CLI available through `cargo run -p wenvy-cli --`.

## Scenario 1: Offline Repository and Merge

```bash
wenvy init demo
cd demo
wenvy secret set DATABASE_URL --stdin
wenvy add DATABASE_URL
wenvy commit -m "add database configuration"
wenvy branch feature
wenvy checkout feature
wenvy secret set DATABASE_URL --stdin
wenvy commit -am "change feature database"
wenvy checkout main
wenvy secret remove DATABASE_URL
wenvy commit -am "remove database configuration"
wenvy merge feature
```

Expected: commit output always shows `Committed by`. The merge exits with code 3
for delete-versus-modify, reveals no value by default, and cannot complete until
the user resolves the key and commits the result. Repeat with disjoint keys and
verify automatic completion within the 10,000-item reference budget.

## Scenario 2: Binary Attachment

```bash
wenvy secret attach TLS_BUNDLE ./fixtures/synthetic.bin \
  --media-type application/octet-stream
wenvy add TLS_BUNDLE
wenvy commit -m "add binary bundle"
```

Expected: the key remains normalized UTF-8, the value is represented as binary,
and all remote/provider observations contain only encrypted bytes and opaque IDs.

## Scenario 3: Identity Mismatch Push

```bash
wenvy identity use account-a-key
wenvy commit --allow-empty -m "account A commit"
wenvy identity use account-b-key
wenvy push origin main
```

Expected: the server returns `author_identity_mismatch`; no object becomes
reachable through the remote ref. The CLI identifies the active SSH identity and
linked account and instructs the user to revert and recreate the commit under an
eligible account. Switching back to the eligible identity permits push.

## Scenario 4: Access Downgrade and Revocation

Using the governance UI or API contract in
[contracts/openapi.yaml](contracts/openapi.yaml):

1. Grant group A `write` and group B `read` on a branch; place the same user in
   both groups.
2. Remove group A's grant.
3. Verify the user cannot push but can still fetch/decrypt and the branch remains
   `current`.
4. Remove group B's read grant.
5. Verify access is removed immediately and branch state becomes `rotation_due`.
6. Submit client-generated replacement envelopes and run workers until state is
   `complete/current`.

Expected: authorization changes, audit rows, rotation state, and outbox events are
atomic. A revoked reader cannot retrieve future envelopes.

## Scenario 5: Primary Email Hold

Create pending invitation, notification, and recovery workflows, then request a
primary switch. Expected: workflows become `held`; after verification they are
rebound to the replacement address and become `ready` unless expired. Audit
history records the transition without tokens or email message bodies.

## Provider Conformance

```bash
just test-provider object-store-filesystem
just test-provider object-store-s3
just test-provider object-store-gcs
just test-provider queue-rabbitmq
just test-provider queue-cloudflare
just test-provider cache-redis
just test-provider cache-valkey
```

Expected: each adapter passes the common behavior in
[contracts/provider-ports.md](contracts/provider-ports.md), including retry/error
mapping, checksum verification, idempotent redelivery, cache-outage fallback, and
sensitive-data telemetry checks.

## Failure and Recovery Exercises

```bash
just exercise postgres-restart
just exercise object-store-unavailable
just exercise queue-redelivery
just exercise cache-flush
just exercise rotation-worker-crash
```

Expected: PostgreSQL unavailability fails closed; object-store operations retry
without corrupting reachability; queue messages can redeliver without duplicate
effects; cache loss affects only latency; and rotation resumes from persisted state.

## Contract References

- [Data model](data-model.md)
- [Canonical objects](contracts/canonical-objects.md)
- [CLI behavior](contracts/cli.md)
- [SSH wire protocol](contracts/ssh-wire.md)
- [Provider ports](contracts/provider-ports.md)
- [OpenAPI](contracts/openapi.yaml)
