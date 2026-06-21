# Provider Port Contract

These ports are backend-internal, versioned architecture surfaces. Provider SDK
types, errors, and configuration objects must not escape an adapter.

## ObjectStore v1

Operations:

- `put_if_absent(key, stream, size, checksum) -> stored | already_present`
- `get(key, optional_range) -> metadata + stream`
- `head(key) -> metadata | not_found`
- `delete_lifecycle_candidate(key, expected_checksum) -> deleted | not_found`
- `health() -> healthy | degraded | unavailable`

Rules:

- Keys are opaque and must match the generated Wenvy object-store key grammar.
- Writes are immutable. Existing content with a different checksum is
  `integrity_conflict`, never overwritten.
- Adapters verify checksums and exact byte counts. Reads return checksum metadata.
- `delete` is available only to the reachability/retention worker and is safe to
  retry. Application flows never use delete as rollback.
- Common errors: `not_found`, `integrity_conflict`, `too_large`, `throttled`,
  `unavailable`, `unauthorized`, and `invalid_configuration`.
- Optional multipart or signed-transfer capabilities are advertised at startup;
  callers must provide a streaming fallback.

Required adapters: filesystem (development/tests), S3-compatible, and Google Cloud
Storage.

## Queue v1

Published envelope fields:

| Field | Rule |
|---|---|
| version | Must equal `1` |
| message_id | UUID unique per publish intent |
| idempotency_key | Stable across retries |
| topic | Allow-listed domain topic |
| occurred_at | UTC timestamp |
| trace_context | Optional, no sensitive baggage |
| payload | Versioned allow-listed JSON object containing opaque IDs only |

Operations:

- `publish(envelope) -> accepted`
- `deliver(envelope, delivery_metadata) -> ack | retry(delay) | dead_letter(reason)`
- `health() -> healthy | degraded | unavailable`

Rules:

- Delivery is at least once. Ordering is unspecified.
- Consumers persist a `ConsumerReceipt` before irreversible external effects.
- Unknown versions/topics are dead-lettered and alerted, not retried forever.
- Retries use bounded exponential backoff and provider-neutral attempt metadata.
- Provider delivery IDs are diagnostic only; business idempotency uses the Wenvy
  idempotency key.
- Cloudflare HTTP push requests require adapter-level signature/authentication
  verification before entering `deliver`.

Required adapters: in-process (tests), RabbitMQ, and Cloudflare Queues.

## Cache v1

Operations:

- `get(namespace, key) -> value | miss`
- `put(namespace, key, value, ttl) -> stored | unavailable`
- `delete(namespace, key) -> deleted | unavailable`
- `health() -> healthy | degraded | unavailable`

Rules:

- Cache values are schema-versioned and contain no plaintext secret material,
  credentials, raw signatures, key envelopes, or authorization decisions.
- Every entry has a finite TTL and versioned namespace.
- Misses, eviction, and unavailability fall back to the authoritative path.
- Cache errors may affect latency but cannot approve/deny access or lose work.

Required adapters: in-memory (tests) and RESP-compatible Redis/Valkey.

## Adapter Conformance

Each adapter must pass the same black-box suite for operation results, retry/error
mapping, checksum behavior, timeout cancellation, telemetry fields, health states,
and recovery after transient failure. Provider-specific features require a new
capability flag and cannot silently change common semantics.
