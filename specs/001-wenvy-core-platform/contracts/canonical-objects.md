# Canonical Object Contract v1

## Envelope

Every signed object is deterministic CBOR using the Wenvy v1 profile:

- maps are sorted by encoded key bytes;
- integers use the shortest valid encoding;
- indefinite lengths, floats, duplicate keys, and unknown fields are rejected;
- text is valid UTF-8 and normalized only where the object schema explicitly says
  so; and
- the top-level fields are `version`, `kind`, `suite`, `body`, `signer`, and
  `signature`.

The signature input is the canonical encoding with `signature` omitted. The object
ID is a domain-separated digest of the complete signed canonical encoding.

## Supported Kinds

- `commit`: parent IDs, encrypted tree/root ID, encrypted message object ID,
  author account ID, author key generation, and authored timestamp.
- `tree`: opaque encrypted normalized-key tokens mapped to item-version object IDs.
- `item_version`: media class, encrypted payload reference, fresh wrapped DEK,
  nonce, and authenticated metadata.
- `key_envelope`: source generation, recipient key generation, suite, and wrapped
  key bytes.
- `merge_resolution`: merge base/source/target IDs and selected conflict results.

## Cryptographic Suite 1

- payload AEAD: XChaCha20-Poly1305;
- derivation: HKDF-SHA-256 with mandatory domain/context labels;
- signing: Ed25519;
- recipient agreement/wrapping: X25519 plus suite-defined KDF/AEAD; and
- random nonces/DEKs: operating-system CSPRNG, with a fresh DEK for every immutable
  item version.

Exact byte layouts, labels, associated-data fields, and test vectors must be
approved in ADR-001 before implementation. No fallback or algorithm negotiation is
permitted inside suite 1.

## Version Handling

Readers accept only explicitly supported `(version, kind, suite)` combinations.
Unknown values return `unsupported_object_version` without attempting partial
decoding. Writers emit one configured current version. Migrations create new
objects; immutable old objects are never rewritten in place.

## Golden Fixtures

Root `contracts/fixtures/` will contain valid encodings, expected IDs/signatures,
and one invalid fixture per rejection rule. Rust and Elixir contract tests consume
the same bytes. Fixtures contain synthetic data only.
