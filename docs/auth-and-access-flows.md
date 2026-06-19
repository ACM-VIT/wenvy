# Authentication and Access Flows

## 1. Separate Authentication and Unlock

Server authentication proves which account is making a request. Local unlock proves possession of secret-decryption material. Neither substitutes for the other.

- Web authentication: verified email magic link, optional MFA, or SSH-to-web bridge.
- CLI transport authentication: registered SSH Ed25519 key.
- Local crypto unlock: master password or offline recovery mnemonic.
- Commit/envelope authorization: Ed25519 account-key signature.
- Payload decryption: X25519 account key followed by symmetric envelope keys.

## 2. Account Creation and CLI Enrollment

1. User verifies an email through a browser-bound magic link.
2. Server creates a `pending_enrollment` account.
3. User installs the CLI and runs `wenvy auth enroll`.
4. CLI asks for a master password, generates X25519 and Ed25519 account keys, generates a recovery mnemonic, and encrypts the private bundle locally.
5. CLI requires the user to confirm selected mnemonic words before upload.
6. CLI uploads the encrypted bundle, public keys, wrappers, and self-signed enrollment event.
7. Key directory appends the event and obtains two-of-three witness signatures.
8. CLI pins the accepted checkpoint and the server activates the account key and user.

The web UI cannot generate, unlock, or recover account crypto keys in v1.

## 3. Multiple Emails

- A user may add multiple addresses and select exactly one verified primary address.
- Adding an address requires a new browser-bound verification link and recent authentication.
- Invitations can be accepted through any verified address matching the invite.
- Removing an address requires another verified address; the primary must be changed first.
- Email compromise alone cannot unlock account keys or create Group Key envelopes.
- Sensitive email changes notify all other verified addresses and active sessions.

## 4. SSH Key Registration

1. User authenticates through an existing strong session or email plus MFA/recovery policy.
2. Client submits an Ed25519 SSH public key and label.
3. Server returns a nonce bound to user, key fingerprint, and expiry.
4. Client signs the nonce with the corresponding SSH private key.
5. Server verifies proof and activates the key.

Adding an SSH key never causes Group/Vault envelope generation. Revocation blocks new SSH sessions immediately and preserves historical attribution.

## 5. Web Magic-Link Login

1. User submits a verified email.
2. Server sets an origin-browser nonce and sends a short-lived one-time link.
3. Durable Object atomically verifies token hash, expiry, unused state, and browser-binding hash.
4. MFA is applied according to organization policy before privileged governance access.
5. Postgres receives the durable session and audit record.

The link cannot be redeemed in a different browser. A web session can manage governance but cannot retrieve decryptable envelope chains or secret ciphertext.

## 6. SSH-to-Web Bridge

1. User runs `wenvy auth web` over an authenticated SSH session.
2. Gateway issues a single-use token valid for at most five minutes and records the issuing SSH key.
3. Browser redeems the token through a Durable Object.
4. IP binding is enforced by default with an organization-configurable NAT allow-list.
5. Server creates a web session at the SSH session's authentication strength.

## 7. Invitation and n+1 Provisioning

1. Admin creates an organization/group invitation for an email and role.
2. Recipient accepts using an account with that verified email.
3. Server creates `pending_key_provisioning` membership and, for a first organization join, an `initializing` personal group.
4. If enrollment is incomplete, recipient completes CLI enrollment first.
5. Recipient CLI initializes its per-organization personal Group Key and self-envelope when needed.
6. Admin's unlocked CLI fetches the recipient account key and directory proofs.
7. CLI validates inclusion, consistency, pinned checkpoint progression, and two-of-three witness quorum.
8. Admin wraps the invited Group Key for the recipient X25519 key and signs the artifact.
9. Server validates all required envelopes and atomically activates organization/group membership.
10. Recipient unlocks and downloads the Group Key envelope.

The same flow applies to an approved access request. Approval alone never grants decryptable access.

## 8. Personal Groups and Direct Shares

Every user owns an immutable one-member personal group in each joined organization. Granting one user direct branch access grants that personal group. This avoids a direct-user envelope exception and preserves:

```text
user account key -> personal Group Key -> branch Vault Key
```

## 9. Authorization Evaluation

For every operation:

1. Validate account, credential/session, organization status, and request freshness.
2. Collect local and GitHub-derived active group memberships.
3. Apply organization role, group role, branch grant ceiling, and repository user overrides.
4. Deny wins over grants; caps bound the highest remaining role.
5. Match branch policy: exact, longest prefix wildcard, global wildcard, default deny.
6. Validate operation capability.
7. For reads, require an active branch grant and envelope chain.
8. For writes, require `branches.crypto_state=active` and expected-head consistency.

Roles:

- `viewer`: read granted branches.
- `editor`: read, create local commits, and propose/push where branch policy permits.
- `admin`: manage groups, grants, ordinary policy, and approve when policy permits.
- Organization `owner`: manage owners, trust policy, witness configuration changes, recovery policy, and destructive governance.

## 10. Protected Branch Flow

1. User creates the target projection commit locally.
2. `push --change-request` uploads immutable objects and records base/proposed commits.
3. Eligible reviewers approve the exact pair; proposer cannot self-approve.
4. Branch coordinator rechecks roles, policy, signatures, crypto state, object completeness, and base head.
5. If unchanged and threshold met, it moves the ref and records audit events transactionally.
6. A changed target head supersedes the request.

## 11. Revocation

### Remove group member

1. Authorization removal commits immediately.
2. Member envelope is revoked for new delivery.
3. Group Key and reachable current Vault Keys become compromised.
4. Affected branches become `rotation_required`; writes fail with `ROTATION_REQUIRED`.
5. Workflow waits for a remaining authorized unlocked client.
6. Client creates and uploads new key epochs and envelopes.
7. Server atomically activates the new state and re-enables writes.

### Remove group from branch

Authorization and envelope delivery stop immediately. Only the branch Vault Key requires rotation unless the Group Key itself is compromised.

Remaining authorized users may read old versions during rotation. Removed users may retain previously acquired material; only future confidentiality is guaranteed.

## 12. Account and Key Recovery

### Routine account-key rotation

An unlocked client publishes a new key version signed by the old signing key. After witness quorum, it rewraps every active Group Key for the new X25519 key. The server activates the new account key only when all active group memberships have new envelopes; SSH keys are unchanged.

### Forgotten master password

1. User authenticates to the server and obtains the encrypted bundle.
2. CLI uses the recovery mnemonic to unwrap the Account Bundle Key.
3. User chooses a new master password and uploads a replacement password wrapper.
4. Existing Group Key envelopes remain valid because account keys did not change.

### Lost all SSH keys

User authenticates through verified email plus required MFA/recovery checks, registers a new SSH key with proof of possession, then resumes normal CLI access. No secret envelope rewrap is required.

### Lost master password and recovery mnemonic

The user enrolls a new account-key version. Administrators must re-provision each Group Key. The directory records a high-risk recovery event. Old private bundle and any exclusively personal encrypted data are unrecoverable.

## 13. Service Accounts

1. Admin creates a service account and branch allow-list.
2. Client generates X25519/Ed25519 keys locally and uploads public keys.
3. Private bundle and raw API token are displayed/provisioned once into the CI secret store.
4. Admin client wraps required Group Keys for the service-account X25519 key.
5. API request presents bearer token and Ed25519 request signature.
6. Server checks token state, signature, capability, branch allow-list, policy, and crypto state.

Service accounts cannot use web/SSH login, manage membership/policy, approve changes, or perform human recovery. Token revocation blocks API authentication; key compromise additionally triggers reachable branch rotation.

## 14. Abuse Controls

- Per-IP and per-email limits for magic links, invitations, and recovery.
- Per-SSH-key, user, repository, and service-account limits for data operations.
- Reauthentication for email, MFA, owner, key, grant, and rotation changes.
- Notifications for account-key rotation, recovery, SSH-key addition, and privileged grants.
- Optional organization cooldown before a recovered account receives new Group Key envelopes.
- No plaintext values in prompts, errors, analytics, audit events, or support bundles.
