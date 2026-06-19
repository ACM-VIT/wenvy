# System Design

## 1. Objective

Wenvy is a zero-knowledge-for-secret-content, SSH-first secrets version-control platform with:

- Git-like repositories, staging, commits, branches, merges, refs, remotes, and stash.
- Key-value-aware three-way merge behavior.
- Branch-specific cryptographic read boundaries.
- Group RBAC and witnessed asynchronous onboarding.
- Passwordless server authentication plus local master-password key unlock.
- A governance-only web dashboard and CLI-only secret cryptography.

## 2. Architectural Principles

1. Secret key names and values are encrypted before leaving a client.
2. The server sees operational metadata and enforces authorization but cannot decrypt secret payloads.
3. Authentication credentials and encryption recipients are separate.
4. Repository branches are both versioning refs and cryptographic vaults.
5. Immutable item versions use per-version envelope encryption.
6. Ref updates use compare-and-swap and immutable signed commits.
7. Revocation blocks authorization immediately and affected writes until client-assisted rotation.
8. The service never claims to revoke plaintext a user already observed.

## 3. Components

### CLI and local memory agent

- Generates account, Group, Vault, and item keys.
- Unlocks the encrypted account bundle using the master password or recovery mnemonic.
- Maintains encrypted working state, index, object cache, refs, and stash.
- Performs K-V diffs, three-way merges, projection commits, signing, encryption, and decryption.
- Communicates with the SSH gateway for operational data and HTTPS control plane for selected governance flows.

### Go SSH gateway

- Authenticates registered SSH Ed25519 keys.
- Exposes typed fetch, push, ref, rotation, and bridge-token operations.
- Calls the shared authorization service before returning envelopes or ciphertext.
- Streams ciphertext without inspecting payloads.
- Runs behind Cloudflare Tunnel for MVP or Spectrum when public L4 proxying is required.

### Cloudflare Worker control plane

- Passwordless email auth, sessions, MFA, organizations, groups, invitations, and access requests.
- Account public-key directory and transparency checkpoint APIs.
- Branch policies, change requests, approvals, service accounts, audit, and rotation orchestration.
- React/Vite governance dashboard served through Workers Static Assets.
- OpenAPI 3.1 contracts for HTTPS endpoints.

### Key transparency witnesses

- Three separately deployed witness services verify append-only directory consistency.
- Clients require signatures from two witnesses on accepted checkpoints.
- Witnesses receive Merkle data and key hashes, not private keys or secret payloads.

### Postgres through Hyperdrive

- Authoritative identity, access, policy, key metadata, commit graph, ref, audit, and job state.
- Relational constraints prevent partial memberships, duplicate envelopes, and invalid active versions.

### R2

- Private storage for encrypted account bundles and immutable encrypted item payloads.
- Opaque UUID or content-hash object names that reveal no organization, repository, branch, or key name.

### Durable Objects

- Serialize branch ref updates and protected change-request activation.
- Enforce single-use login and bridge tokens.
- Coordinate rotation claims, idempotency windows, and rate counters.

### Queues, Workflows, and scheduled Workers

- Queues handle email, GitHub reconciliation, audit fanout, and consistency checks.
- Workflows coordinate rotations and wait for signed client-generated key artifacts.
- Cron Triggers initiate reconciliation, retention checks, and invariant scans.

### GitHub App adapter

- Imports GitHub organization/team membership into Wenvy groups.
- Uses immutable GitHub IDs and read-only membership permissions.
- Never grants Wenvy owner, bypasses branch policy, or handles secret plaintext.

## 4. Data Domains

1. Identity: users, emails, account-key versions, SSH keys, sessions, and recovery policy.
2. Transparency: directory entries, Merkle checkpoints, and witness signatures.
3. Access: organizations, groups, memberships, invitations, branch grants, and external mappings.
4. Crypto: Group Keys, branch Vault Keys, DEK envelopes, and encrypted account bundles.
5. Versioning: repositories, refs, commits, parents, trees, item versions, and blobs.
6. Policy: branch patterns, role rules, protections, change requests, and approvals.
7. Operations: audit events, security events, idempotency, and rotation jobs.

## 5. Repository and Branch Model

- A repository owns a commit DAG and named branches.
- Every branch has a distinct Vault Key lifecycle and explicit reader groups.
- Branch write permissions are evaluated independently from cryptographic read grants.
- A user must have both server `can_read` authorization and a valid envelope chain.
- `dev`, `staging`, and `production` are conventional defaults, not hard-coded branches.

Policy precedence is exact name, longest prefix wildcard, global wildcard, then default deny. Viewer can read only granted branches; editor can propose writes; admin can manage non-owner policy; owner controls organization trust and recovery policy.

## 6. Write Path

1. CLI unlocks the account bundle and reads encrypted local working/index state.
2. CLI creates immutable item versions, DEK envelopes, a canonical tree, and a signed commit.
3. SSH gateway authenticates the SSH key and resolves the user.
4. Server checks organization, group, repository, branch, and operation policy.
5. Server rejects writes if branch crypto state is not `active`.
6. Client uploads immutable objects idempotently.
7. Branch coordinator compares `expected_old_head`, validates object references and signature metadata, and serializes the update.
8. Postgres records the new head and audit event transactionally.

## 7. Read Path

1. Gateway authenticates the SSH key and evaluates branch-read authorization.
2. Server returns visible commit/tree metadata, ciphertext object references, and only the caller's authorized envelope chain.
3. CLI verifies commit signatures, transparency checkpoint freshness, hashes, versions, and associated data.
4. CLI decrypts Group Key, Vault Key, DEK, then item payload locally.

## 8. Merge and Protected Branch Path

1. Client fetches source, target, and merge base.
2. Client decrypts and performs a K-V three-way merge.
3. Client creates a target projection commit with source and target parents.
4. Client reuses item ciphertext by adding target DEK envelopes where possible.
5. Unprotected target push uses expected-head compare-and-swap.
6. Protected target push creates a change request bound to commit and base head.
7. Approval activation advances only the ref; the server never constructs the merge.

## 9. Onboarding Path

1. User enrolls account keys in the CLI and publishes witnessed public-key metadata.
2. User accepts an invitation or requests group access.
3. Administrator CLI verifies directory inclusion, consistency, and two-of-three witness quorum.
4. Administrator wraps one active Group Key for the user and signs the envelope.
5. Server activates membership after artifact validation.

This resolves n+1 onboarding without a shared project key or out-of-band secret transfer.

## 10. Revocation Path

1. Server removes authorization immediately.
2. Affected branch states become `rotation_required`; reads for remaining members continue, writes stop.
3. Workflow waits for an authorized unlocked CLI to claim the job.
4. Client creates new Group/Vault keys and complete envelopes.
5. Server validates and atomically activates the new epochs.
6. Future item versions use fresh DEKs under new Vault Keys.

## 11. Local State

The `.wenvy/` structure is defined in `cli-and-versioning.md`. Secret-bearing local files are encrypted. Stash never synchronizes to the server. Plaintext export is explicit and outside the repository state model.

## 12. Consistency and Concurrency

- Immutable objects may be uploaded more than once; IDs and hashes make retries safe.
- Ref updates require expected-head compare-and-swap.
- Protected change requests become superseded when their base head changes.
- One Durable Object coordinates each repository branch.
- Rotation activation requires a complete membership snapshot and key-envelope coverage.
- Postgres is authoritative after coordination succeeds.

## 13. Non-Functional Targets

- Typical status/diff operations are local and require no network.
- User addition is one public-key envelope per joined group.
- Merge reuses item ciphertext where values are unchanged.
- No server log, audit payload, queue message, or object name contains a secret key name or value.
- Every privileged access, key, policy, ref, and recovery event is attributable and immutable.
