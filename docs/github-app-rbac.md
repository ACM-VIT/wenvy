# GitHub App RBAC Integration

## 1. Objective

The Wenvy GitHub App imports organization and team membership into Wenvy groups without giving GitHub access to secrets or allowing synchronization to bypass cryptographic provisioning.

GitHub is authoritative only for the external memberships it reports. Wenvy remains authoritative for owners, account keys, envelopes, repository/branch grants, policy, overrides, and rotation.

## 2. GitHub App Permissions

- Organization installation only.
- `Members: read-only` organization permission.
- No repository permissions.
- Webhooks: `installation`, `membership`, `organization`, and `team`.
- Short-lived installation tokens generated as needed; never persisted.
- App private key and webhook secret stored in Cloudflare Secrets Store or Worker secrets.

## 3. Identity Linking

1. User starts GitHub linking from an authenticated Wenvy session.
2. GitHub user authorization proves control of a GitHub account.
3. Wenvy stores immutable GitHub user ID; login and email are display metadata only.
4. Email matching alone never links identities.
5. One active GitHub identity may link to one Wenvy user.

Linking does not grant envelopes.

## 4. Group Mapping

An owner maps an immutable GitHub team ID to a Wenvy group with a maximum Wenvy role. The UI displays a dry-run diff before activation.

- GitHub member -> Wenvy group `viewer`, `editor`, or `admin` at most.
- GitHub cannot grant organization `owner`.
- Personal groups cannot be mapping targets.
- Local deny/cap overrides and branch policy always take precedence.

## 5. Reconciliation

1. Verify webhook signature before parsing.
2. Deduplicate by `X-GitHub-Delivery`.
3. Queue the immutable delivery ID and payload hash.
4. Fetch current GitHub state using a fresh installation token.
5. Update reconciled GitHub membership tables transactionally.
6. Derive desired Wenvy group membership changes.
7. Apply authorization removals immediately.
8. Create additions as `pending_key_provisioning` and notify group administrators.
9. Queue rotation for removals after authorization commits.

A full installation reconciliation runs at least every six hours and repairs missed, delayed, duplicated, or reordered webhooks.

## 6. Addition Flow

If a GitHub member has a linked, enrolled Wenvy account:

1. Create pending group membership.
2. Administrator CLI validates the user's witnessed account key.
3. Administrator wraps the active Group Key for that account key.
4. Membership becomes active only after envelope validation.

If no linked account exists, record an unresolved external member and send no envelope. This preserves the n+1 onboarding security boundary.

## 7. Removal Flow

1. Reconciliation marks group membership removed and blocks new fetches immediately.
2. Group Key and reachable branch Vault Keys are marked compromised.
3. Affected branches block writes.
4. Client-assisted lazy rotation creates new epochs for remaining members/groups.

A configurable debounce may delay destructive rotation for noisy GitHub changes, but it never restores online authorization or permits writes under a compromised key.

## 8. Effective Role

1. Collect active organization and mapped-group grants.
2. Select the highest role.
3. Apply organization ceilings and repository caps.
4. Apply explicit local denies.
5. Apply branch group grant ceiling.
6. Apply branch policy capability.
7. Require cryptographic envelope possession for reads.

The effective-access inspector must explain the GitHub installation, team mapping, local overrides, branch grant, policy rule, and envelope-provisioning state that produced the result.

## 9. Failure Modes

- Invalid webhook signature: reject and emit high-severity security event.
- Duplicate delivery: return success without reapplying changes.
- GitHub outage/rate limit: retain current authorization, retry with backoff, and surface stale-sync age.
- Installation suspension/deletion: block GitHub-derived access immediately and queue affected rotations.
- Unlinked user: remain pending without envelopes.
- Envelope provisioning failure: authorization remains inactive; retry requires an unlocked administrator client.
- Missed event: scheduled full reconciliation repairs state.

## 10. Audit Requirements

Record installation/link changes, mapping changes, webhook delivery IDs, reconciliation snapshots, derived membership deltas, effective-role changes, pending/active provisioning transitions, immediate removals, and rotation-job IDs. Never include GitHub access tokens, webhook secrets, secret names, or values.
