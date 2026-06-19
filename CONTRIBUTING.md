# Contributing to Wenvy

Wenvy is currently an architecture and protocol design project. Contributions should preserve the security boundaries and terminology defined in [docs/README.md](docs/README.md).

## Before Opening a Change

1. Search existing issues and design documents.
2. State the user or engineering problem, security impact, and affected contracts.
3. For crypto, identity, authorization, storage, or wire-format changes, include threat-model and migration analysis.
4. Do not introduce implementation code for a design-only issue unless the issue explicitly authorizes it.

## Pull Requests

- Create a focused branch and keep commits scoped.
- Explain what changed, why, alternatives considered, and compatibility impact.
- Update every dependent document when changing terminology, schema, algorithms, flows, commands, or invariants.
- Add or update test-vector and acceptance-test requirements for protocol changes.
- Confirm examples contain no real credentials or realistic live tokens.
- Link the relevant issue and identify any unresolved decision explicitly.

Documentation changes should be checked for:

- Valid relative links and renderable Mermaid syntax.
- Consistent use of repository, branch vault, group, account key, Group Key, Vault Key, DEK, and projection commit.
- No implication that SSH keys encrypt Wenvy data.
- No implication that key rewrapping revokes plaintext or keys previously obtained by a legitimate reader.
- No server-side secret decryption or merge path.

## Security Reports

Do not open a public issue for a suspected vulnerability, leaked credential, or exploitable design flaw. Contact the maintainers privately using the project security contact when available. Do not include real secret values in reports, logs, screenshots, or reproduction data.

## Review Standard

Reviewers should reject changes that weaken fail-closed behavior, blur authentication and encryption-key roles, bypass witnessed key provisioning, permit writes during required rotation, or leave related documents contradictory.

## Code of Conduct

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
