# Wenvy Design Documentation

Wenvy is a CLI-first E2EE secrets version-control system. These documents are the product and engineering contracts for a future implementation; they do not describe completed software.

## Normative Reading Order

1. [System design](system-design.md) — boundaries, components, data flow, and core invariants.
2. [Threat model and key transparency](threat-model-and-key-transparency.md) — guarantees, limitations, and public-key directory trust.
3. [Cryptography and key management](crypto-and-key-management.md) — algorithms, hierarchy, envelopes, onboarding, and rotation.
4. [CLI and versioning](cli-and-versioning.md) — Git-like commands, local state, commits, branches, merges, and stash.
5. [Database schema](database-schema.md) — authoritative conceptual relational model and constraints.
6. [Authentication and access flows](auth-and-access-flows.md) — enrollment, login, access grants, service accounts, and recovery.
7. [GitHub App RBAC](github-app-rbac.md) — external membership reconciliation into Wenvy groups.
8. [Tech stack](tech-stack.md) and [platform decisions](platform-decisions.md) — implementation and hosting choices.
9. [Security operations](security-operations.md) — monitoring, rotation operations, incidents, and recovery.
10. [Implementation plan](implementation-plan.md) and [roadmap](roadmap-and-milestones.md) — delivery order and acceptance gates.

The [architecture diagram](system-architecture.mmd) is a compact rendering of the system design.

## Normative Terminology

- **Repository**: Git-like metadata container with commits and branches.
- **Branch vault**: one repository branch and its cryptographic read boundary.
- **Group**: RBAC and key-sharing unit. A user owns one implicit personal group in each joined organization.
- **Account key**: versioned X25519 encryption and Ed25519 signing keypair bundle.
- **SSH key**: Ed25519 authentication credential only; never an envelope recipient.
- **Group Key (GK)**: symmetric key distributed to group members.
- **Vault Key (VK)**: versioned symmetric key for one branch vault.
- **Data Encryption Key (DEK)**: fresh symmetric key for one immutable item version.
- **Projection commit**: target-branch commit produced by a cross-branch merge.

## Global Invariants

1. Secret key names and values leave clients only as authenticated ciphertext.
2. Operational metadata—org/repo/branch names, graph, authors, timestamps, and commit messages—is visible to the service.
3. Server authorization and cryptographic possession are both required for reads.
4. Account encryption keys, signing keys, and SSH authentication keys are separate.
5. A cross-branch ref never points directly to ciphertext scoped only to another branch.
6. Revocation blocks online access immediately and blocks affected writes until rotation.
7. Revocation is forward-only; previously read plaintext and old ciphertext cannot be clawed back.
8. The web UI is governance-only in v1. Enrollment and secret cryptography are CLI-only.

## Scope Guardrails

- Wenvy versions key-value secrets, not source code or arbitrary directory trees.
- Stash and working state are local and encrypted.
- No implicit plaintext `.env` working tree is created.
- Separate repositories must be used when an organization wants distinct trust boundaries without cross-branch history.
- Cloudflare hosts the HTTP control plane and storage integrations; inbound SSH remains a Go TCP service.
