# SSH Wire Contract v1

## Transport

Wenvy uses the SSH subsystem name `wenvy`. After normal SSH public-key
authentication, peers exchange unsigned 32-bit big-endian length-prefixed
canonical CBOR messages. The maximum frame is 1 MiB. Binary objects are transferred
through separately authorized HTTPS streams, not embedded in SSH frames.

## Session Opening

Client sends `hello {version: 1, client_version, capabilities, request_id}`. Server
returns `hello_ok {version: 1, server_version, capabilities, limits}` or closes with
`unsupported_version`. The authenticated SSH fingerprint is bound to one active
Wenvy account before any repository operation.

## Operations

- `identity`: return the SSH identity ID, linked account ID/handle, and status.
- `fetch_negotiate`: repository/branch, known commit frontier, and requested refs;
  returns current refs plus missing object IDs and short-lived download grants.
- `push_negotiate`: repository/branch, expected head/ref version, proposed commit
  frontier, and object metadata; returns missing-object upload grants.
- `push_finalize`: expected head/ref version and proposed new head; atomically
  validates object availability, signatures, commit authorship, write permission,
  rotation state, and compare-and-swap.
- `rotation_submit`: submit replacement envelope object IDs for a due rotation.

## Error Codes

Stable codes include `unauthenticated`, `identity_unlinked`, `identity_revoked`,
`author_identity_mismatch`, `permission_denied`, `rotation_due`,
`non_fast_forward`, `object_missing`, `object_integrity_failed`, `limit_exceeded`,
`unsupported_version`, `rate_limited`, and `temporarily_unavailable`.

Errors include `request_id`, `retryable`, and optional safe metadata. They never
include secret names/values, ciphertext, key envelopes, tokens, or raw signatures.

## Push Authorship Rule

The SSH key authenticates the transport. Each proposed commit names and is signed
by its authoring Wenvy account key. Finalization rejects the push unless the SSH
identity's linked account equals every newly introduced commit author and has
effective branch write permission. The CLI then instructs the user to revert and
recreate offending commits under an eligible account.
