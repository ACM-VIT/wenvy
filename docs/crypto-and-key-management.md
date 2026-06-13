# Crypto and Key Management

## 1. Goals

1. Preserve confidentiality of secrets under server compromise.
2. Support efficient sharing to teams and multiple devices.
3. Allow revocation and rotation without re-encrypting large history blobs.

## 2. Key Hierarchy

1. User SSH Key Pair
- Private key remains on user device.
- Public key registered with server.
- Used for identity and envelope unwrapping.
- **Key type handling**: Ed25519 SSH keys cannot be used directly for encryption. The private signing key is converted to an X25519 key via the birational map from the Ed25519 curve to Curve25519. This conversion is handled by `age` (which natively supports SSH Ed25519 keys as recipients) or by explicit `crypto_sign_ed25519_sk_to_curve25519` via libsodium.
- RSA SSH keys: encrypted via OAEP padding directly. RSA-2048 minimum enforced.
- ECDSA SSH keys: not recommended; prefer Ed25519. Support may be limited.

2. Recovery Key (optional, per-user)
- A high-entropy recovery key (256-bit, BIP39 mnemonic or raw base64) generated at user onboarding.
- Displayed once to the user for offline storage (printed/saved to password manager).
- Acts as an additional envelope recipient: team keys are also wrapped for the recovery key.
- Allows account recovery without depending on an admin's device being online.
- Recovery key envelopes are stored server-side like SSH key envelopes.
- If a user loses all SSH keys, they authenticate by email, prove possession of recovery key, register a new SSH key, and re-wrap envelopes client-side.
- Recovery key can be rotated (generates new key, re-wraps all envelopes).
- Organizations can enforce or disable recovery keys via policy.

3. Team Key (symmetric, versioned)
- Shared cryptographic boundary for a team.
- Rotated on revocation/security events.

4. Repo Key (symmetric, versioned)
- Encrypts repo snapshots.
- Encrypted by active team key version.

5. Snapshot Payload Keying
- Repo key encrypts canonical snapshot payload.

## 3. Envelope Model

1. Team key envelope
- Team key encrypted for each active user SSH key.

2. Repo key envelope
- Repo key encrypted by team key.

3. Data payload
- Snapshot encrypted by repo key.

This keeps membership changes efficient because most operations re-wrap small keys, not large blobs.

## 4. Crypto Lifecycle

## Create Team

1. Creator client generates team key version 1.
2. Client wraps team key for creator SSH key.
3. Envelope stored in metadata DB.

## Create Repo

1. Client generates repo key version 1.
2. Client encrypts repo key with active team key.
3. Repo key envelope metadata stored.

## Push Snapshot

1. Client decrypts envelope chain to obtain repo key.
2. Client canonicalizes env state and encrypts snapshot payload.
3. Client signs commit metadata and uploads ciphertext blob.
4. Server stores blob pointer and metadata only.

## Pull Snapshot

1. Server returns relevant team envelope + repo key envelope + blob ref.
2. Client unwraps team key with private SSH key.
3. Client unwraps repo key with team key.
4. Client decrypts snapshot locally.

## 5. Rotation Policy

## Trigger Conditions

1. Member removed from team.
2. SSH key compromised or revoked.
3. Scheduled periodic rotation policy.
4. Incident response procedure.
5. Secondary team access revoked from a repo.

## Rotation Process

1. Generate new team key version.
2. Wrap new team key for remaining active SSH keys (and recovery keys).
3. Re-wrap active repo keys to new team key version.
4. Mark old key version retired after rollout completion.
5. Emit audit and rotation job result events.

## Partial Rotation Failure Handling (Saga/Compensation)

1. Rotation is treated as a multi-step saga with checkpointing.
2. Steps are idempotent: each step can be retried without side effects.
3. Checkpoint states tracked in `rotation_jobs`:
   - `key_generated`: new team key version created.
   - `envelopes_wrapped`: all member envelopes created for new version.
   - `repo_keys_rewrapped`: all repo keys re-wrapped to new team key.
   - `old_key_retired`: old version marked retired.
4. If step 3 fails partway (some repos re-wrapped, some not):
   - The rotation job records which repo keys have been re-wrapped.
   - Retry resumes from the last un-wrapped repo key.
   - Both old and new team key versions remain active until completion.
   - Clients check `team_key_version` on each repo key envelope and can decrypt with either.
5. If rotation is stuck for longer than the configured SLA, an alert fires.
6. Manual intervention runbook: admin can force-complete or rollback (re-retire new version and keep old).
7. Concurrent rotations for the same team are serialized by a per-team Durable Object, with Postgres state used as the auditable source of truth.

## 6. Revocation Semantics

1. Access revocation is immediate at server authorization layer.
2. Cryptographic revocation is finalized after key rotation.
3. High-sensitivity repos should enforce immediate rotation.
4. Standard repos may use near-term queued rotation with strict SLA.

## 6a. Forward Secrecy Trade-Off (Explicit)

Rotation generates a new team key and re-wraps active repo keys, but **old `repo_key_versions` remain wrapped with the old team key** in the metadata DB. This means:

1. A revoked member who previously decrypted the old team key retains the ability to decrypt any historical snapshots they can obtain (e.g., from a database or object storage leak).
2. Re-encrypting all historical blobs with the new key is prohibitively expensive for large histories and is **not performed** during standard rotation.
3. This is an accepted trade-off: Wenvy protects forward confidentiality (new secrets after rotation are safe) but does not guarantee backward confidentiality for data the revoked member already had access to.
4. For high-compliance environments requiring full backward confidentiality:
   - Enable the optional `full_re_encryption` rotation mode, which re-encrypts all historical snapshots with the new repo key. This is slow and should be used sparingly.
   - Alternatively, create a new repo and migrate only current-state secrets, abandoning old history.

## 7. Integrity and Authenticity

1. Sign commit metadata using user SSH signing key (Ed25519 `ssh-keygen -Y sign` compatible).
2. Verify signatures on pull/merge operations.
3. Validate ciphertext hash and blob integrity metadata.
4. Maintain immutable audit record for key and role changes.

### Signature Verification for Revoked Keys

- Historical commits signed by a now-revoked key remain valid: the signature proves the commit was created when the key was active.
- Verification uses the public key stored in `user_ssh_keys` regardless of `revoked_at` status.
- The CLI should display a warning: "Signed by key [fingerprint] (revoked on [date])" to distinguish from active-key signatures.
- Key revocation does not invalidate past signatures; it only prevents future signing.

## 8. Practical SSH Key Compatibility

1. Prefer Ed25519 keys; enforce consistent key policy per organization.
2. Support multiple registered keys per user (laptop, desktop, CI).
3. Prevent envelope issuance for revoked keys.
4. Enforce fingerprint pinning behavior in CLI for peer trust workflows.

### Multi-Device Key Addition Flow

When a user registers a new SSH key (e.g., key #4 on a new device):

1. User authenticates from an existing device (where they have a working SSH key).
2. User registers the new public key via CLI or web dashboard.
3. On the existing device, CLI decrypts the current team key using the existing SSH key.
4. CLI re-encrypts the team key for the new SSH key and uploads the new envelope.
5. The new device can now pull and decrypt.
6. If the user has no existing device available but has a recovery key:
   - Authenticate via email + recovery key proof.
   - Decrypt team key using recovery key envelope.
   - Wrap team key for the new SSH key.
7. If the user has neither an existing device nor a recovery key:
   - A team admin must perform the envelope re-wrap from their device.
   - Admin decrypts team key with their own SSH key, wraps for the user's new key.
   - This is a privileged operation and is audit-logged.

## 9. Threat Model Notes

1. DB leak should not expose plaintext.
2. Object storage leak should not expose plaintext.
3. Stolen web session should not grant decryption unless matching SSH envelope and key access exist.
4. Compromised endpoint remains a hard risk; reduce blast radius with short-lived materialization and key hygiene.

## 10. Branch Controls and Crypto Boundary

1. Branch-based access control is enforced by authorization policy, not by separate branch keys in v1.
2. Snapshot encryption remains repo-key based across branches.
3. For high-compliance use cases, future versions can add branch-scoped repo key versions, but this increases rotation complexity.

## 11. Recommended Crypto Primitives

| Purpose | Algorithm | Library |
|---|---|---|
| Envelope encryption (SSH key → team key) | X25519 + AEAD via age-compatible envelope encryption | Audited TypeScript/Web Crypto-compatible age library selected by ADR |
| Symmetric encryption (repo key → snapshot) | XChaCha20-Poly1305 | Audited TypeScript implementation selected by ADR |
| Team/repo key material | 256-bit random | `crypto/rand` |
| Commit signing | Ed25519 signature | Web Crypto or audited TypeScript Ed25519 library |
| Content hashing | SHA-256 | `crypto/sha256` |
| Token hashing | SHA-256 or BLAKE2b | Web Crypto SHA-256 or audited TypeScript BLAKE2b |
| Recovery key encoding | BIP39 mnemonic (24 words = 256 bits) | `github.com/tyler-smith/go-bip39` |

All symmetric keys are 256-bit. Nonces are randomly generated per encryption operation (never reused). AEAD construction ensures both confidentiality and integrity.
