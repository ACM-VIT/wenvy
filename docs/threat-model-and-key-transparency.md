# Threat Model and Key Transparency

## 1. Security Objective

Wenvy protects secret key names and values against network observers, database leaks, object-storage leaks, routine server operators, and compromised server-side storage credentials. Secret cryptography executes only in the CLI or its local memory agent.

The system also detects an online service attempting to replace an established user's public account key or present inconsistent directory histories. It does not eliminate every first-contact identity risk.

## 2. Trust Boundaries

### Trusted

- The user's endpoint while unlocked.
- The CLI binary and approved crypto libraries.
- The user's master password and offline recovery mnemonic.
- The user's account private keys while held in memory.

### Semi-trusted

- The control plane for email verification, account-to-email mapping, authorization, policy, branch coordination, and audit persistence.
- The SSH gateway for authentication and command routing.
- Independent transparency witnesses for checkpoint validation.

### Untrusted for secret plaintext

- Networks, Postgres, R2, queues, logs, backups, and analytics.
- A stolen web session without the account private encryption key.

## 3. Protected Data and Exposed Metadata

Encrypted:

- Key names and values.
- Item payload type and item-specific application metadata.
- Account private encryption and signing keys.
- Group Keys, Vault Keys, and DEKs.
- Local working state, index, object cache, and stash.

Visible to the service:

- User IDs, verified email addresses, SSH public keys, and account public keys.
- Organization, group, repository, and branch names.
- Membership, role, policy, and access-grant relationships.
- Commit graph, author IDs, timestamps, messages, random item IDs, sizes, and change patterns.
- Audit, security, and rotation-job metadata.

Wenvy does not claim metadata anonymity.

## 4. Adversaries and Guarantees

| Adversary | Guarantee |
|---|---|
| Database or R2 thief | Cannot decrypt account bundles or secret payloads without client-held credentials. |
| Network observer | TLS/SSH plus payload E2EE prevents plaintext disclosure and tampering. |
| Stolen web session | Can perform only authorized governance actions; cannot decrypt secrets. |
| Revoked member | Is denied new server reads immediately and cannot decrypt post-rotation item versions. Previously learned data remains known. |
| Compromised SSH key | Can authenticate until revoked but cannot unlock the account bundle without the master password or active local agent. |
| Malicious directory server | Cannot silently replace an established key without producing a witnessed inconsistent or appended directory event. |
| Compromised endpoint | May read plaintext available during that unlocked session; this remains an accepted hard boundary. |

## 5. Key Directory Log

Every account-key event is an append-only Merkle-log leaf containing:

- Directory sequence number.
- User UUID and account-key version.
- SHA-256 hashes of the X25519 and Ed25519 public keys.
- Event type: `enroll`, `rotate`, `recover`, `revoke`, or `suspend`.
- Previous key-event hash for that user.
- Event timestamp and client signature. First enrollment is self-signed; later events are signed by the prior account key except declared unverified recovery.

Email addresses are not included in public leaves. The control plane resolves a verified email to a user UUID; the log proves the key history for that UUID.

## 6. Checkpoints and Witnesses

1. The directory publishes a signed checkpoint containing tree size, Merkle root, timestamp, and previous checkpoint hash.
2. Three witness services run under separate credentials and hosting failure domains.
3. Each witness verifies append-only consistency from its last checkpoint before signing the new checkpoint.
4. Clients require two valid witness signatures from the configured set of three.
5. Clients pin the newest accepted checkpoint and reject rollback, missing consistency proofs, invalid inclusion proofs, or insufficient quorum.
6. Witness public keys are embedded in signed CLI releases. A witness-set change requires a release and a policy event checkpointed by the previous witness quorum.

An administrator's client must validate the recipient key's inclusion proof, consistency proof, checkpoint, and witness quorum before creating a Group Key envelope.

## 7. First-Contact Limitation

Key transparency proves that clients observe one append-only key history. It cannot independently prove that a first-time email-to-user binding represents the intended human. Standard onboarding therefore trusts Wenvy's verified-email or linked-GitHub identity process for first contact.

High-assurance organizations may additionally require an administrator to verify the account-key fingerprint through an external channel. That is optional and is not required for normal asynchronous onboarding.

## 8. Recovery and Key Changes

- Normal rotation is signed by the previous Ed25519 account key.
- Recovery decrypts the stored account bundle with the offline mnemonic, allowing the prior signing key to authorize a replacement.
- If neither the master password nor recovery mnemonic is available, the user creates a new account-key version and requires administrator re-onboarding. The directory records an unsigned recovery event and surfaces a high-severity warning.
- Key suspension blocks new envelopes immediately but preserves historical signatures and log entries.

## 9. Explicit Non-Goals

- Revoking plaintext already viewed by a legitimate user.
- Hiding repository usage patterns or commit metadata.
- Protecting secrets from malware on an unlocked endpoint.
- Making email a cryptographic proof of human identity.
- Post-quantum confidentiality in v1.
