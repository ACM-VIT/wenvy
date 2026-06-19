# Wenvy

Wenvy is a design-stage, CLI-first, end-to-end encrypted secrets version-control system. It gives key-value secrets a Git-like workflow—working state, staging, commits, branches, merges, remotes, and stash—without placing plaintext secret names or values on the server.

The server authenticates users, enforces repository and branch policy, coordinates ref updates, and stores ciphertext. Encryption, decryption, merge resolution, key generation, and commit signing happen on user devices.

## Design Goals

- Git-like CLI semantics for secret key-value repositories.
- Cryptographically isolated branch reads and policy-controlled branch writes.
- Asynchronous onboarding without sharing a static project key out of band.
- Efficient user addition through Group Key envelopes.
- Honest forward-only revocation semantics.
- Multiple verified emails and multiple SSH authentication keys per user.
- A governance-focused web UI that never decrypts secrets.

## Core Model

```text
User X25519 public key
  -> Group Key
    -> branch Vault Key
      -> item-version DEK
        -> encrypted {key, value}
```

Users authenticate CLI sessions with SSH Ed25519 keys. Those SSH keys are deliberately separate from the X25519 account encryption key and Ed25519 Wenvy signing key. Direct grants use the user's one-member personal group within that organization.

Each repository branch is a cryptographic vault. Cross-branch merges are resolved locally and produce a target-keyed projection commit. A removed member is denied immediately; affected branches reject writes until a legitimate client completes key rotation.

## Planned CLI Experience

```bash
wenvy clone ssh://ssh.wenvy.dev/acme/payments
cd payments

wenvy switch -c feature/provider-change
wenvy set STRIPE_API_KEY --stdin
wenvy add STRIPE_API_KEY
wenvy commit -m "Rotate payment provider credentials"
wenvy push -u origin feature/provider-change

wenvy switch production
wenvy merge feature/provider-change
wenvy push --change-request
```

These commands are product contracts in the design documents; this repository does not yet contain their implementation.

## Documentation

Start with [docs/README.md](docs/README.md). The most important specifications are:

- [System design](docs/system-design.md)
- [Threat model and key transparency](docs/threat-model-and-key-transparency.md)
- [Cryptography and key management](docs/crypto-and-key-management.md)
- [CLI and versioning](docs/cli-and-versioning.md)
- [Database schema](docs/database-schema.md)
- [Authentication and access flows](docs/auth-and-access-flows.md)

## Project Status

Architecture and protocol design only. No production implementation, migration, or compatibility guarantee exists yet.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
