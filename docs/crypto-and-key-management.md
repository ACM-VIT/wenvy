# Cryptography and Key Management

## 1. Goals

1. Secret key names and values remain confidential under server-storage compromise.
2. Adding a user to a group changes one small recipient envelope, not repository data.
3. Branches can have different cryptographic readers.
4. Item payloads can be reused across branches by rewrapping DEKs.
5. Revocation prevents future access without falsely promising recovery of previously disclosed data.
6. All cryptographic artifacts are versioned, signed, and algorithm-identified.

## 2. Algorithm Suite

| Purpose | Required v1 algorithm |
|---|---|
| Master-password KDF | Argon2id v1.3, 64 MiB, `t=3`, `p=1`, 16-byte random salt, 32-byte output |
| Account and recovery bundle encryption | XChaCha20-Poly1305 |
| Public-key envelopes | HPKE Base mode: DHKEM(X25519, HKDF-SHA-256), HKDF-SHA-256, ChaCha20-Poly1305 |
| Group/Vault/DEK wrapping | XChaCha20-Poly1305 |
| Item payload encryption | XChaCha20-Poly1305 |
| Protocol and commit signatures | Ed25519 |
| SSH authentication | `ssh-ed25519` and `sk-ssh-ed25519@openssh.com` |
| Hashing | SHA-256 |
| Recovery encoding | BIP39 24-word mnemonic representing 256 bits of entropy |

RSA and ECDSA recipients are not supported. X25519 is used only through HPKE, not as a standalone encryption primitive. Ed25519 keys are never converted into X25519 keys.

All symmetric keys are 256 random bits from the operating system CSPRNG. XChaCha20 nonces are 192 random bits and must never be reused with the same key. Every ciphertext includes an algorithm-suite version and authenticated associated data.

Signed and hashed cryptographic objects use RFC 8949 deterministic CBOR. HTTP APIs represent binary fields as base64url in JSON; decoding must reproduce the canonical CBOR object before signature verification.

## 3. Account Key Bundle

Enrollment generates:

- One versioned X25519 keypair for receiving Group Key envelopes.
- One versioned Ed25519 keypair for commits, envelope artifacts, and key lifecycle events.
- One random Account Bundle Key (ABK).

The private keys and local-state root are serialized into a versioned bundle and encrypted with the ABK. The ABK is wrapped twice:

1. By an Account Encryption Key derived from the master password with the stored Argon2id parameters.
2. By a Recovery Encryption Key derived from the offline recovery mnemonic using domain-separated HKDF-SHA-256.

The server stores the encrypted bundle, wrappers, salts, KDF parameters, and public keys. It never receives the master password, AEK, recovery mnemonic, ABK, or plaintext private keys.

Changing the master password derives a new AEK and rewraps the same ABK. Rotating account keys creates a new bundle and account-key version; it does not reuse key material.

### Normal account-key rotation

1. Unlocked client generates a new X25519/Ed25519 bundle and signs the directory event with the old Ed25519 key.
2. After witness quorum, the new account-key version enters `provisioning`.
3. Client decrypts each active Group Key available to the user and HPKE-wraps it for the new X25519 key.
4. Server verifies complete active-group coverage and atomically activates the new account key while retiring the old one.
5. Old account-key envelopes remain as historical records but are no longer delivered.

This operation is O(number of joined groups) and does not touch Vault Keys, item DEKs, or payloads. If the old account key is suspected compromised, use the compromise rotation path instead because every Group Key it could decrypt must also rotate.

## 4. Authentication Keys Are Separate

SSH public keys authenticate transport sessions and bind audit events to a user. They do not encrypt Group Keys, sign Wenvy commits, or unlock the account bundle.

Consequences:

- Adding or revoking an SSH key causes no envelope churn.
- A stolen SSH private key cannot decrypt secrets without the unlocked account bundle.
- A user may register multiple SSH keys after proof of possession.
- Historical SSH authentication events remain attributable after key revocation.

## 5. Key Hierarchy

```text
Account X25519 key
  -> active Group Key
    -> authorized branch Vault Key versions
      -> item-version DEK
        -> encrypted {key, value, media_type}
```

### Group Key

- One active version per group, including personal groups.
- Wrapped with HPKE independently for each active member account-key version.
- Rotated when a member loses group read access or the key is suspected compromised.

### Branch Vault Key

- One current version per repository branch.
- Wrapped by every active Group Key with read access to that branch.
- Historical versions remain available to authorized current groups for history decryption.
- Rotated when any former reader must be excluded from future branch versions.

### Item-version DEK

- Fresh for every immutable item version.
- Encrypts the normalized key name and value together.
- Wrapped independently for each branch Vault Key version that references the item version.
- Never reused to encrypt a different plaintext version.

## 6. Associated Data

Every encryption operation binds context to prevent envelope transplantation:

- Account bundle: user ID, account-key version, bundle schema version.
- Group Key envelope: organization ID, group ID, Group Key version, recipient user ID, recipient account-key version.
- Vault Key envelope: repository ID, branch ID, Vault Key version, group ID, Group Key version.
- DEK envelope: repository ID, branch ID, item ID, item-version ID, Vault Key version.
- Item payload: repository ID, item ID, item-version ID, payload schema version.

Any mismatch is a hard decryption failure and emits a local security diagnostic without secret material.

## 7. Asynchronous n+1 Onboarding

1. User B verifies an email and runs `wenvy auth enroll` locally.
2. The CLI creates and uploads B's encrypted account bundle and public keys.
3. The directory appends B's key event and obtains a two-of-three witnessed checkpoint.
4. B accepts an invitation or submits an access request; membership remains `pending_key_provisioning`.
5. An authorized administrator unlocks their CLI and fetches B's key plus inclusion, consistency, and witness proofs.
6. The administrator rejects the operation if any proof fails.
7. The administrator decrypts the active Group Key locally and HPKE-wraps it for B's X25519 account key.
8. The administrator signs and uploads the envelope.
9. The server atomically activates membership only after validating the signature, recipient key status, key-directory proof reference, and envelope uniqueness.
10. B downloads one Group Key envelope and can traverse already stored Vault Key and DEK envelopes.

No static project key, master password, private key, branch payload, or out-of-band shared secret is transmitted. Addition work is O(1) per group joined, independent of branch and item counts.

## 8. Group and Branch Creation

### Create group

1. Creator generates Group Key version 1.
2. Creator wraps it for their witnessed account key.
3. Server validates and activates the group and creator membership transactionally.

The same process initializes a user's one-member personal group on first joining each organization; no personal group exists outside an organization.

### Create repository and initial branch

1. Client creates repository metadata and a first branch Vault Key.
2. Client wraps the Vault Key for every granted group.
3. Client creates the initial signed empty commit.
4. Server activates the branch only when its reader groups all have valid envelopes.

### Create branch

The client generates a distinct Vault Key, rewraps source item-version DEKs for it, wraps it for reader groups, and creates the new ref. Existing item ciphertext is not re-encrypted.

## 9. Item Write and Read

### Write

1. Normalize the key to NFC and resolve its random item ID.
2. Generate a fresh DEK.
3. Encrypt `{key, value, media_type}` using XChaCha20-Poly1305.
4. Wrap the DEK with the active branch Vault Key.
5. Build and sign the new commit locally.
6. Upload immutable ciphertext and envelope objects before the compare-and-swap ref update.

### Read

1. Authenticate and pass branch-read authorization.
2. Download the user Group Key envelope, Group-to-Vault envelope, item DEK envelope, and ciphertext.
3. Validate signatures, versions, associated data, and ciphertext hashes.
4. Decrypt entirely on the client.

## 10. Cross-Branch Projection

A client with read access to source and target decrypts both logical trees, resolves conflicts, and produces a target projection commit. Existing immutable item ciphertext may be reused by adding a target Vault Key envelope for its DEK. Newly resolved or edited values receive fresh DEKs.

Because branch Vault Keys differ, the target ref never fast-forwards directly to a source-only commit.

## 11. Revocation and Lazy Rotation

### Immediate phase

1. Remove or suspend authorization in the server transaction.
2. Mark the affected Group Key `compromised` when a group member is removed.
3. Mark every reachable current Vault Key `compromised`.
4. Set affected branches to `rotation_required` and reject writes.
5. Authorized remaining users may continue reading existing versions.

Removing an entire group from one branch rotates that branch Vault Key but need not rotate the group's key.

### Client-assisted phase

1. The next authorized unlocked CLI detects the rotation requirement and claims a lease.
2. For member removal, it generates a new Group Key and wraps it for remaining witnessed account keys.
3. It generates new current Vault Keys for affected branches.
4. It wraps each new Vault Key for every currently authorized group.
5. It rewraps retained historical Vault Key versions under the new Group Key so remaining and future group members retain history access.
6. It signs and uploads a complete rotation manifest.
7. The server validates expected versions, membership snapshots, signatures, envelope coverage, and lease ownership.
8. Activation changes all active versions and branch states atomically.

Cloudflare Workflows persists orchestration and waits for signed client artifacts; it never generates or sees plaintext keys.

## 12. Revocation Guarantee

Standard rotation is forward-only:

- Server access is revoked immediately.
- No new item version is written under a compromised Vault Key.
- A removed user cannot decrypt post-rotation item versions.
- A removed user may retain plaintext, DEKs, and key versions legitimately obtained earlier.
- Rewrapping a DEK does not erase a former reader's cached copy.

Current-state or full-history payload re-encryption is outside v1. The documentation must not describe key rewrapping as backward revocation.

## 13. Recovery

- The recovery mnemonic unwraps the ABK and restores the account private bundle.
- Recovery is local; the server verifies only signed key lifecycle artifacts and authenticated account control.
- Organizations may require recovery enrollment before granting secret access.
- Losing both master password and recovery mnemonic requires a new account-key version and administrator re-onboarding.
- Recovery-key replacement creates a new wrapper and invalidates the old wrapper after a confirmed round-trip.

## 14. Service Accounts

Service accounts use separate X25519 and Ed25519 keypairs. Their encrypted or raw private bundle is provisioned once into the CI platform's secret store. A scoped bearer token authenticates API access; signed requests prove possession of the service-account signing key. Group Key envelopes target the service-account X25519 key and remain bounded by explicit branch allow-lists.

## 15. Crypto Agility

Every key, envelope, payload, signature, and KDF wrapper stores a suite identifier and schema version. Readers reject unknown suites. Algorithm migration creates new versions and envelopes; it never silently reinterpret existing ciphertext.
