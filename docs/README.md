# Wenvy Planning Docs

This folder contains the architecture and delivery planning set for Wenvy, an SSH-first, end-to-end encrypted secrets sync platform.

## Document Map

1. `system-design.md`
Purpose: End-to-end system architecture, components, trust boundaries, and runtime topology.

2. `implementation-plan.md`
Purpose: Practical implementation sequence, milestones, dependencies, and execution strategy.

3. `database-schema.md`
Purpose: Full conceptual schema for identity, auth, RBAC, cryptographic envelopes, repository state, and auditability.

4. `auth-and-access-flows.md`
Purpose: Passwordless web auth, SSH auth, SSH-to-web bridge, invitations, team membership, and revocation flows.

5. `crypto-and-key-management.md`
Purpose: Key hierarchy, encryption/decryption model, envelope handling, rotation strategy, and threat-model-driven decisions.

6. `tech-stack.md`
Purpose: Recommended technologies, libraries, infrastructure, and rationale for each system layer.

7. `platform-decisions.md`
Purpose: Platform service decisions, deployment topology, and explicit constraints for Workers, R2, Hyperdrive, Durable Objects, Queues, Workflows, Tunnel, and Spectrum.

8. `security-operations.md`
Purpose: Security controls, monitoring, incident handling, backup/recovery policy, and operational hardening.

9. `roadmap-and-milestones.md`
Purpose: MVP-to-production roadmap with acceptance criteria and measurable deliverables.

## Suggested Reading Order

1. `system-design.md`
2. `crypto-and-key-management.md`
3. `database-schema.md`
4. `auth-and-access-flows.md`
5. `tech-stack.md`
6. `platform-decisions.md`
7. `implementation-plan.md`
8. `roadmap-and-milestones.md`
9. `security-operations.md`

## Scope Guardrails

- Wenvy is a secrets state sync system, not a source-code VCS replacement.
- Server-side services are zero-knowledge for secret plaintext.
- Secret encryption/decryption stays on client devices.
- Web dashboard is governance-first; operational secret usage remains CLI-first.
- Branches (`dev`, `staging`, `production`, feature branches) are first-class policy targets with explicit access rules.
- Cloudflare Workers are the default for the dashboard and HTTP control plane, but raw SSH remains a Go TCP service behind Cloudflare Tunnel or Spectrum.
