<!--
Sync Impact Report
- Version change: template/unversioned -> 1.0.0
- Modified principles:
  - Template principle 1 -> I. Code Quality Is a Release Gate
  - Template principle 2 -> II. Tests Prove Behavior Before Merge
  - Template principle 3 -> III. UX Consistency Preserves Trust
  - Template principle 4 -> IV. Performance Budgets Are Product Requirements
  - Template principle 5 -> V. Security and Contract Integrity Are Non-Negotiable
- Added sections:
  - Engineering Guardrails
  - Delivery Workflow
- Removed sections:
  - None
- Templates requiring updates:
  - ✅ updated: .specify/templates/plan-template.md
  - ✅ updated: .specify/templates/spec-template.md
  - ✅ updated: .specify/templates/tasks-template.md
  - ✅ updated: AGENTS.md
- Follow-up TODOs:
  - None
-->
# Wenvy Constitution

## Core Principles

### I. Code Quality Is a Release Gate
All production changes MUST leave the codebase easier to reason about than it was
before the change. Every change MUST have explicit ownership boundaries, stable
interfaces, clear error handling, and naming that matches the domain terms in the
design documents. Duplication of security-critical or policy-evaluation logic
across CLI, SSH gateway, and control plane is prohibited unless an ADR records why
shared code is impossible. Temporary hacks, compatibility shims without sunset
criteria, and speculative abstractions are not allowed in merged work.

Rationale: Wenvy handles cryptographic, policy, and version-control invariants
that fail badly when behavior is ambiguous or fragmented.

### II. Tests Prove Behavior Before Merge
Every behavior change MUST be backed by tests that fail before the implementation
and pass after it. Unit tests MUST cover deterministic logic, canonical encoding,
policy evaluation, and redaction behavior. Integration tests MUST cover
cross-boundary flows for CLI, SSH, Worker APIs, storage, and rotation/revocation
paths when those boundaries are touched. Security regression tests MUST exist for
any change affecting cryptography, authorization, envelope handling, logging, or
state transitions that enforce access guarantees. A change is not complete until
its required test evidence is automated and reproducible.

Rationale: For Wenvy, correctness is a security property, not a cleanup task.

### III. UX Consistency Preserves Trust
User-facing flows MUST behave consistently across CLI and governance UI with
matching terminology, predictable defaults, and explicit confirmation around
destructive or plaintext-revealing actions. Secret values MUST remain redacted by
default, and any action that could reveal plaintext or widen access MUST require
clear user intent. Command names, flags, error messages, and UI labels MUST align
with the normative product contracts in the design documentation unless the
contracts are updated in the same change. When tradeoffs exist, prefer behavior
that reduces operator surprise over behavior that is merely convenient to
implement.

Rationale: Users trust Wenvy only if safety-sensitive workflows are coherent and
hard to misuse.

### IV. Performance Budgets Are Product Requirements
Each feature MUST define measurable performance expectations before implementation
starts and MUST validate them before release. Local-first workflows such as status,
diff, unlock, and staging MUST remain responsive without network dependency.
Networked operations MUST declare latency, throughput, and payload-size limits, and
changes that add persistent overhead to branch creation, merge, onboarding, or
rotation MUST include a budget impact assessment. Performance regressions are
acceptable only when the change includes documented justification, updated budgets,
and mitigation work in the same plan.

Rationale: Wenvy’s security model is only usable if the system remains responsive
under realistic repository and membership growth.

### V. Security and Contract Integrity Are Non-Negotiable
No implementation may introduce server-side plaintext handling, weaken
deterministic encoding rules, accept unknown protocol/object versions, or bypass
documented authorization and witness checks. All external contracts including CLI
behavior, SSH wire operations, OpenAPI schemas, canonical object formats, and
database invariants MUST be treated as versioned product surfaces. Contract changes
MUST update the relevant design docs, fixtures, migrations, and compatibility notes
in the same delivery slice.

Rationale: Wenvy’s security and interoperability guarantees depend on strict
contract discipline.

## Engineering Guardrails

1. Technical decisions MUST be justified against these principles first, then
   against delivery speed.
2. New dependencies, storage systems, protocol changes, or architecture seams MUST
   be recorded in an ADR when they alter security posture, operational ownership,
   testing scope, or performance budgets.
3. Feature plans MUST identify the impacted invariants, required test layers, UX
   surfaces, and performance budgets before implementation tasks are approved.
4. Any justified exception to this constitution MUST be documented in the plan’s
   Complexity Tracking section with the simpler rejected alternative and the
   containment strategy.

## Delivery Workflow

1. Specifications MUST define user-visible behavior, acceptance scenarios, UX
   consistency expectations, and measurable success criteria including performance.
2. Implementation plans MUST fail the Constitution Check if they do not identify
   code-quality risks, required automated tests, UX alignment points, performance
   budgets, and contract/security impacts.
3. Task lists MUST include the tests, documentation, and validation work needed to
   prove each story independently, not only the implementation steps.
4. Reviews MUST verify adherence to this constitution before merge approval. A
   reviewer finding that violates a principle is a blocking issue until fixed or
   explicitly excepted.

## Governance

This constitution supersedes informal engineering preference for all product and
implementation work in this repository.

Amendments MUST:

1. describe the principle or governance change,
2. explain why the current wording is insufficient,
3. update affected templates, instructions, and design references in the same
   change, and
4. record the version bump according to the policy below.

Versioning policy:

1. MAJOR: Removes a principle, materially weakens a mandatory gate, or redefines
   governance in a backward-incompatible way.
2. MINOR: Adds a new principle or materially expands required engineering behavior.
3. PATCH: Clarifies wording, examples, or references without changing obligations.

Compliance review expectations:

1. Every plan, spec, and task set MUST include an explicit constitution check.
2. Every pull request or equivalent review MUST confirm test evidence, UX impact,
   performance impact, and contract/security impact for the changed surface.
3. Unresolved constitution violations MUST be tracked as blockers, not deferred as
   silent follow-up work.

**Version**: 1.0.0 | **Ratified**: 2026-06-20 | **Last Amended**: 2026-06-20
