# Feature Specification: Wenvy Core Platform

**Feature Branch**: `001-wenvy-core-platform`

**Created**: 2026-06-20

**Status**: Draft

**Input**: User description: "Develop Wenvy, a CLI-first developer-oriented E2EE
secrets VCS that follows Git UX as closely as possible, supports multi-user local
CLI workflows, SSH identity linking, a GitHub-like governance website, multi-email
accounts, branch-level access control, append-only audit history, K-V merge, and
key hierarchy-based encryption with rotation and revocation."

## Clarifications

### Session 2026-06-20

- Q: What happens when a push uses an SSH identity linked to a different account
  than the commit author? → A: Reject the push, require the commit to be reverted
  and recreated under an eligible account, and always display the commit author.
- Q: How is delete-versus-modify handled during merge? → A: Leave it as a merge
  conflict for the user to resolve and commit.
- Q: What happens when write access is removed but read access remains through
  another group? → A: Preserve read key access, remove write authorization, and
  flag rotation only when read access is revoked.
- Q: What happens to pending email-bound workflows during a primary-email switch?
  → A: Hold them until the new primary email is verified, then resume them against
  the new primary email.
- Q: How are duplicate SSH identities and normalized secret keys handled? → A:
  An SSH identity may belong to only one account, and normalized-key collisions
  must be resolved by removing one entry before commit.
- Q: How are non-UTF-8 secret values stored? → A: Use binary attachment mode;
  values support either UTF-8 text or binary data while key names remain UTF-8.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manage Secrets Like Git (Priority: P1)

A developer initializes or clones a secrets repository, edits secret entries
locally, stages changes, reviews diffs and status, commits, branches, merges, and
pushes updates using commands and terminology that closely match Git while
preserving end-to-end encryption of secret content.

**Why this priority**: This is the product’s primary value proposition. Without a
Git-like local workflow, Wenvy is not meaningfully differentiated from a generic
secret store.

**Independent Test**: A developer can create or clone a repository, add and modify
secret entries, inspect staged and unstaged changes, commit them, create a branch,
merge a non-conflicting change, and push the result without the service learning
secret key names or values.

**Acceptance Scenarios**:

1. **Given** a developer has enrolled an account and initialized a repository,
   **When** they add or update UTF-8 secret entries and run `status`, `diff`,
   `add`, and `commit`, **Then** the CLI shows Git-like workflow states and
   records an encrypted commit, always displays the Wenvy account recorded as its
   author, and does not expose plaintext secret content to the service.
2. **Given** a developer has a local repository with a remote configured,
   **When** they run `fetch`, `pull`, `push`, `branch`, `checkout`, and `merge`,
   **Then** the commands behave consistently with Git expectations except where
   branch-specific encryption requires explicit Wenvy behavior.
3. **Given** source and target branches change the same normalized key name,
   **When** a developer runs `merge`, **Then** one-sided changes merge
   automatically, identical two-sided results merge once, and conflicting
   add/modify/delete/rename combinations are surfaced for local resolution and a
   subsequent user commit.

---

### User Story 2 - Manage Identities and Access Across Devices (Priority: P2)

A user manages one Wenvy account with multiple verified emails and multiple SSH
identities, links any eligible local SSH identity to the account, switches active
identity context locally, and uses the website to review and govern account access
without handling secret plaintext in the browser.

**Why this priority**: Multi-user operation, identity flexibility, and safe
account recovery are required for real team use and directly affect onboarding and
ongoing administration.

**Independent Test**: A user can register an account, verify multiple emails, add
and revoke multiple SSH identities, switch between account identities locally, and
authenticate to the web interface to inspect account state and governance actions
without decrypting secrets in the browser.

**Acceptance Scenarios**:

1. **Given** a user has multiple SSH identities present on a device, **When**
   they link one or more of them to a Wenvy account, **Then** each linked identity
   is independently visible, revocable, and usable for local authentication.
2. **Given** a user has multiple verified emails on one account, **When** they
   change the active email context, **Then** notifications, primary identity
   display, and account recovery flows reflect the selected email without creating
   a separate account; pending email-bound workflows remain on hold until the new
   primary email is verified and then resume against that address.
3. **Given** a user signs into the website, **When** they manage SSH keys, emails,
   organizations, or groups, **Then** the web experience resembles repository
   governance tools such as GitHub while keeping secret decryption and secret value
   handling in the local CLI only.

---

### User Story 3 - Govern Branch Access and Revocation (Priority: P3)

An organization administrator defines branch-level read/write/none access through
groups, audits all privileged events through immutable append-only records, and
revokes members or keys in a way that prevents future unauthorized access while
preserving usable team workflows.

**Why this priority**: Team trust depends on precise branch-level access, visible
governance actions, and revocation behavior that operators can understand and
verify.

**Independent Test**: An administrator can create an organization with a default
all-members group, manage personal and shared groups, grant branch permissions,
review append-only audit history, revoke a user or SSH key, and observe the
expected access changes and required rotation behavior.

**Acceptance Scenarios**:

1. **Given** an organization has multiple repositories and branches, **When** an
   administrator grants read, write, or no access at the branch level, **Then**
   each affected user sees only the branches allowed by both authorization and key
   access.
2. **Given** an administrator revokes a member or SSH identity, **When** the
   organization completes the required rotation flow, **Then** the revoked subject
   loses the access defined by the finalized revocation model and the remaining
   team can continue with valid branch state.
3. **Given** users perform account, repository, policy, key, and branch actions,
   **When** auditors review event history, **Then** every event is recorded in
   append-only chronological order and prior audit records cannot be modified or
   deleted.

### Edge Cases

- A push authenticated by an SSH identity linked to an account other than the
  commit author is rejected. The user must revert the offending commit, select an
  SSH identity linked to an account eligible to write the branch, recreate the
  commit under that account, and retry; every successful commit displays its
  Wenvy account author.
- A delete-versus-modify merge remains conflicted until the user selects the
  intended result and commits the resolution.
- When write access is removed but read access remains through any group, the
  system removes write authorization while preserving the branch key access
  needed for reads. Rotation is flagged as due only when effective read access is
  revoked.
- A revocation that removes effective branch read access immediately marks the
  branch as `rotation due`; branch state remains flagged until rotation completes.
- Pending invitations, notifications, and recovery steps tied to the primary email
  remain on hold during a primary-email switch. After the replacement address is
  verified, they resume against the new primary email.
- An SSH identity already linked to one account cannot be registered to another.
  If multiple entries normalize to the same secret key, the CLI reports the
  collision and blocks the commit until the user removes one entry.
- Secret values that are not valid UTF-8 use explicit binary attachment mode. A
  secret value may be UTF-8 text or binary data, but every secret key name remains
  normalized UTF-8 text.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a CLI-first repository workflow with
  commands equivalent in purpose to `init`, `clone`, `pull`, `push`, `remote`,
  `fetch`, `diff`, `status`, `log`, `branch`, `checkout`, and `merge`.
- **FR-002**: The system MUST preserve Git-like command semantics, output
  terminology, and workflow expectations wherever branch-specific encryption does
  not require a different user-visible behavior.
- **FR-003**: The system MUST encrypt secret key names and values before they leave
  the local CLI and MUST prevent plaintext secret content from being processed in
  the website or remote service.
- **FR-004**: The system MUST support a multi-user local CLI environment in which a
  device can hold multiple Wenvy account contexts and multiple linked SSH
  identities without requiring users to share local plaintext state.
- **FR-005**: The system MUST allow a user to discover eligible SSH identities on a
  device and link any selected unlinked identity to any Wenvy account they control;
  one SSH identity MUST NOT be linked to more than one Wenvy account at a time.
- **FR-006**: The system MUST allow one Wenvy account to hold multiple verified
  email addresses and MUST allow users to switch which email is treated as primary
  for account-facing workflows. Invitations, notifications, and recovery steps
  bound to the old primary email MUST remain on hold until the replacement primary
  email is verified, then resume against the replacement address.
- **FR-007**: The system MUST provide a governance website for signing in, linking
  and revoking SSH identities, managing emails, viewing organizations and groups,
  and reviewing repository and branch permissions.
- **FR-008**: The website MUST not decrypt, display, edit, or export secret key
  names or secret values.
- **FR-009**: The system MUST store secret keys as normalized UTF-8 text.
- **FR-010**: The system MUST store secret values as text by default and MUST
  support an explicit binary attachment mode for values that cannot be represented
  as UTF-8 text. Every secret value MUST carry a text or binary media type, while
  secret keys remain restricted to normalized UTF-8 text.
- **FR-011**: The system MUST use the account key -> group key -> branch Vault Key
  -> item-version DEK hierarchy for encrypting repository content.
- **FR-012**: The system MUST maintain one active Group Key per group, including
  personal groups, and MUST rotate that key when a member loses group read access
  or the key is suspected compromised.
- **FR-013**: The system MUST maintain one current Vault Key per repository branch
  and MUST rotate that key when a former branch reader must be excluded from future
  branch versions.
- **FR-014**: The system MUST issue a fresh DEK for every immutable item version
  and MUST never reuse a DEK for different plaintext content.
- **FR-015**: The system MUST compare merge base, source, and target by normalized
  key name during K-V merges.
- **FR-016**: The system MUST automatically accept one-sided add, modify, or delete
  changes during merge.
- **FR-017**: The system MUST accept identical two-sided merge results once.
- **FR-018**: The system MUST mark different two-sided additions or modifications
  as conflicts.
- **FR-019**: The system MUST mark delete-versus-modify combinations as conflicts.
- **FR-019A**: The system MUST require the user to resolve a delete-versus-modify
  conflict locally and commit the selected result before the merge is complete.
- **FR-020**: The system MUST treat renames as conflicts.
- **FR-021**: The system MUST support organizations with groups, including a
  default all-members group for every organization and a personal organization
  context for every user.
- **FR-022**: The system MUST enforce branch-level permissions with at least read,
  write, and none states.
- **FR-022A**: When a user loses branch write access but retains effective read
  access through any group, the system MUST remove write authorization while
  preserving the key access required to read the branch.
- **FR-023**: The system MUST require both authorization and valid key access
  before a user can read a branch.
- **FR-024**: The system MUST record all audit events in append-only immutable
  history that users with audit privileges can review chronologically.
- **FR-025**: The system MUST support revoking an SSH identity independently of
  revoking a user’s broader account membership.
- **FR-026**: The system MUST support member revocation through key rotation and
  MUST block unauthorized future access after revocation is finalized. Loss of
  effective branch read access MUST immediately flag the branch as `rotation due`
  until its required rotation completes.
- **FR-027**: The system MUST always block future access after revocation and MUST
  support an optional historical lockout mode for selected repositories or
  branches, where revocation triggers the re-encryption or replacement work needed
  to make prior protected history unreadable to revoked members.
- **FR-028**: The system MUST preserve append-only history for repository activity,
  audit events, and permission changes even when access is revoked later.
- **FR-029**: Every commit MUST record and display its authoring Wenvy account.
  Push authentication MUST use the active SSH identity. If that identity is linked
  to an account different from the commit author or ineligible to write the target
  branch, the system MUST reject the push and require the offending commit to be
  reverted and recreated under an eligible account before retry.
- **FR-030**: The system MUST reject linking an SSH identity already linked to a
  different Wenvy account.
- **FR-031**: The system MUST detect entries whose names normalize to the same
  secret key and MUST block commit until the user removes all but one colliding
  entry.

### UX Consistency Requirements *(mandatory)*

- The CLI MUST use Git-derived nouns and verbs for repository, remote, branch,
  status, diff, log, checkout, and merge workflows unless Wenvy-specific
  encryption behavior requires a different term.
- The CLI MUST default to redacting secret values in status, diff, merge, and log
  output unless the user intentionally requests plaintext display in a local-only
  context.
- The website and CLI MUST use the same terminology for accounts, emails, SSH
  identities, organizations, groups, repositories, branches, permissions, and
  revocation state.
- User flows that change access, rotate keys, or reveal plaintext MUST require
  explicit confirmation and must explain the impact before completion.
- Local identity switching MUST make the active SSH identity and its linked Wenvy
  account obvious before network actions such as fetch, pull, or push are executed.

### Performance Requirements *(mandatory)*

- A user MUST be able to complete local status or diff checks for a repository with
  up to 10,000 secrets within 2 seconds under the standard reference dataset.
- A user MUST be able to stage and commit a single-secret change in under 3
  seconds under the standard reference dataset.
- A user MUST be able to link a discovered SSH identity to an account from the web
  and local CLI flow in under 2 minutes, excluding external email-delivery delay.
- A user MUST be able to complete a non-conflicting branch merge for a repository
  with up to 10,000 secrets within 10 seconds under the standard reference dataset.
- The system MUST allow user addition to an existing organization without work that
  scales linearly with the total number of stored secret items.
- Historical lockout mode, when enabled for a repository or branch, MUST make its
  additional rotation or re-encryption time visible to administrators before they
  confirm revocation.

### Key Entities *(include if feature involves data)*

- **Account**: A user-owned identity container with multiple verified emails,
  multiple linked SSH identities, one personal organization context, and account
  cryptographic material.
- **Organization**: A governance boundary containing repositories, groups,
  memberships, policies, and a required default all-members group.
- **Group**: A set of users that shares one active Group Key and can be granted
  branch-level access.
- **Repository**: A Git-like metadata container for encrypted secret history,
  remotes, branches, commits, and merge activity.
- **Branch**: A repository ref with its own permission state and Vault Key
  lifecycle.
- **Secret Item Version**: An immutable encrypted representation of one normalized
  secret key name, value, and text-or-binary media type protected by a fresh DEK.
- **SSH Identity**: A device authentication credential that is linked to at most
  one Wenvy account and can be listed, used, or revoked independently.
- **Audit Event**: An immutable append-only record describing a security,
  governance, identity, or repository action.
- **Revocation Event**: A governance action that removes a user or SSH identity
  from future access and flags the required branch or group key rotation whenever
  effective read access is removed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least 90% of experienced Git users can complete repository
  initialization or clone, create a change, commit it, and push it without
  consulting product documentation.
- **SC-002**: At least 95% of secret management tasks performed in the CLI can be
  completed without exposing plaintext secret content outside the local device.
- **SC-003**: At least 95% of non-conflicting K-V merges complete without manual
  intervention on the reference merge dataset.
- **SC-004**: Organization administrators can add or revoke a user’s branch access
  and verify the resulting access state in under 5 minutes for 95% of trials.
- **SC-005**: Status, diff, and single-secret commit workflows meet the declared
  performance budgets for 95% of runs on the reference dataset.

## Assumptions

- Wenvy v1 targets developers and security-conscious platform teams who already
  understand Git-style workflows.
- The initial release focuses on repository-governance web features and CLI-based
  secret handling; browser-side secret editing remains out of scope.
- Users may have multiple local SSH identities and multiple Wenvy accounts on one
  device. Each networked operation authenticates with one explicit active SSH
  identity; commits, rather than pushes, carry Wenvy account authorship.
- Branch access evaluation combines authorization policy and possession of the
  required key hierarchy; neither alone is sufficient for reads.
- Audit history is readable only to authorized viewers, but once recorded it cannot
  be altered or deleted through normal product flows.
- Binary attachment mode uses explicit user intent and is not the default path for
  everyday secret entry or editing.
- Historical lockout mode is opt-in at the repository or branch policy level rather
  than mandatory for every revocation event.
