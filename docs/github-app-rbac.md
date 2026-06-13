# GitHub App RBAC Integration

## 1. Objective

The Wenvy GitHub App lets an organization inherit membership and team RBAC from GitHub while retaining Wenvy-specific controls at organization and user scope.

The integration is one-way:

- GitHub is authoritative for linked organization and team membership.
- Wenvy maps GitHub identities and teams into Wenvy roles.
- Wenvy organization policy and user overrides can narrow, deny, or explicitly grant access.
- Wenvy never writes GitHub organization or team membership.

This avoids duplicate onboarding and offboarding while preserving Wenvy's branch policy, key-envelope, and audit model.

## 2. GitHub App Registration

Register an organization-installable GitHub App named `Wenvy RBAC`.

Required configuration:

| Setting | Value |
|---|---|
| Installation target | Organization accounts |
| Organization permission | `Members: read-only` |
| Repository permissions | None for RBAC sync |
| Webhook | Active, HTTPS, secret configured |
| Webhook events | `installation`, `membership`, `organization`, `team` |
| Setup URL | `/api/integrations/github/setup` |
| Callback URL | Optional; only required if user authorization is added |

Use installation access tokens for reconciliation API calls. Do not store installation access tokens; generate them when needed and keep them only in memory for their short lifetime. Store the GitHub App private key and webhook secret in Cloudflare Secrets Store or Worker secrets.

The app deliberately requests read-only membership access. Wenvy does not need GitHub repository access or permission to mutate GitHub teams.

## 3. Installation and Identity Linking

### Organization Installation

1. A Wenvy organization owner starts the installation.
2. GitHub requires an organization owner or authorized app manager to approve it.
3. GitHub sends the `installation.created` webhook.
4. Wenvy verifies the webhook signature and stores the installation ID and GitHub organization node ID.
5. Wenvy performs a full organization, team, and team-membership reconciliation.
6. A Wenvy owner configures the organization default and team mappings.
7. Wenvy computes effective access and queues required envelope provisioning.

One active GitHub installation maps to one Wenvy organization. Re-linking an installation to a different Wenvy organization requires explicit owner approval and an audit event.

### User Identity Linking

GitHub access is not activated by matching email addresses. A Wenvy user must prove control of the GitHub account through GitHub App user authorization, and Wenvy stores the immutable GitHub user ID.

Rules:

- GitHub login is an identity-linking flow, not a replacement for SSH authentication.
- GitHub login names may change and are display metadata only.
- One GitHub user ID can link to only one Wenvy user.
- Unlinked GitHub members appear as pending identities and receive no decryptable envelopes.
- Linking a pending identity triggers access recomputation and envelope provisioning.

## 4. Permission Configuration

### Organization-Level Policy

Each linked organization defines:

- `default_org_membership_role`: Wenvy governance role for active GitHub organization members; fixed to `member` by default.
- `github_org_owner_governance_role`: governance role for GitHub organization owners; recommended `admin`.
- `default_access_role`: org-wide data role granted to active GitHub organization members; default `none`.
- `github_org_owner_access_role`: org-wide data role for GitHub organization owners; recommended `admin`.
- `role_ceiling`: maximum role GitHub-derived grants may produce; recommended `admin`.
- `sync_mode`: `enforced` or `monitor_only`.
- `removal_grace_period`: optional delay before destructive key rotation; authorization is denied immediately.

Wenvy `owner` is never granted by GitHub sync. It is a local break-glass and billing/governance role that requires an explicit Wenvy owner action.

Governance roles (`member`, `admin`, `owner`) control organization settings. Data roles (`none`, `viewer`, `editor`, `admin`, `owner`) control team/repo secret operations. They are evaluated separately.

### Team Mapping

A GitHub team can map to one Wenvy team and role:

| GitHub membership | Mapping |
|---|---|
| Team member | Configured `member_role` |
| Team maintainer | Configured `maintainer_role`, or `member_role` when unset |
| Child team member | No implicit parent-team grant; map the child explicitly |
| Pending invitation | No access |

Example:

| GitHub team | Wenvy team | Member role | Maintainer role |
|---|---|---|---|
| `platform` | `platform` | `editor` | `admin` |
| `security` | `production` | `viewer` | `admin` |
| `contractors` | `development` | `viewer` | `viewer` |

### User-Level Overrides

An organization owner or admin may define a user override:

- `grant`: adds a Wenvy role independent of GitHub team membership.
- `cap`: limits the maximum effective role.
- `deny`: denies access at organization, team, or repo scope.

Overrides require a reason and optional expiry. Permanent grants for users who are no longer active GitHub organization members should be rejected unless the actor is an owner and marks the override as break-glass.

## 5. Effective Role Evaluation

For each request:

1. Require an active Wenvy user and active organization membership.
2. Reject if the GitHub installation is suspended or deleted and policy is fail-closed.
3. Collect the org-wide data default, GitHub organization-owner data mapping, and all mapped GitHub team grants.
4. Add active user `grant` overrides.
5. Select the highest role, bounded by the organization `role_ceiling`.
6. Apply user `cap` overrides.
7. Apply organization, team, and repo `deny` overrides; deny always wins.
8. Apply repo role ceilings and repo-specific overrides.
9. Apply branch policy. A role grant never bypasses branch protection.

Role order:

`none < viewer < editor < admin < owner`

Only local assignments can produce `owner`.

## 6. Synchronization Model

Webhooks provide low-latency updates but are not the source of truth. Every webhook enqueues an idempotent sync job, and a scheduled full reconciliation repairs missed or reordered deliveries.

### Event Handling

| Event | Action |
|---|---|
| `installation.created` | Link installation and run full reconciliation |
| `installation.suspended` | Fail closed for GitHub-derived grants |
| `installation.unsuspended` | Reconcile before restoring grants |
| `installation.deleted` | Disable integration and revoke GitHub-derived grants |
| `membership` | Reconcile the affected GitHub team and user |
| `team` | Reconcile team metadata and mappings |
| `organization.member_added` | Reconcile organization membership |
| `organization.member_removed` | Revoke GitHub-derived grants immediately |

Processing requirements:

- Verify `X-Hub-Signature-256` against the raw request body.
- Deduplicate on `X-GitHub-Delivery`.
- Persist receipt before returning a successful response.
- Acknowledge quickly and process through the `github-sync` queue.
- Use installation and GitHub node IDs as stable identifiers.
- Run full reconciliation at least every six hours and on demand.

## 7. Revocation and Key Handling

When GitHub-derived effective access is lost:

1. Mark the derived grant inactive in one transaction.
2. Deny new pull, push, envelope, and signed-URL requests immediately.
3. Recompute all affected team and repo permissions.
4. Queue team or repo key rotation according to the configured revocation policy.
5. Audit the GitHub delivery ID, prior role, new role, and affected scopes.

A grace period may delay rotation to absorb accidental GitHub changes, but it must never preserve online authorization during the grace period. Historical ciphertext already downloaded by a former member cannot be revoked; rotation protects future snapshots.

## 8. Failure Behavior

- Webhook outage: continue using the last reconciled state, surface stale status, and retry reconciliation.
- GitHub API outage: do not invent memberships; retain current state until the maximum staleness threshold.
- Staleness threshold exceeded: fail closed for GitHub-derived access to protected teams and repos; organization policy may allow fail-open for development-only scopes.
- Rate limit exhaustion: back off using GitHub response headers and prioritize removals over additions.
- Mapping deletion: revoke only grants produced by that mapping, then recompute effective roles.

## 9. Dashboard

Organization settings must provide:

- Installation status, GitHub organization, last webhook, and last full reconciliation.
- Organization defaults, role ceiling, staleness policy, and sync mode.
- Team mapping editor with member and maintainer roles.
- User identity link status and pending GitHub identities.
- User override editor with scope, mode, reason, and expiry.
- Effective-access inspector explaining every grant, cap, and deny source.
- Dry-run diff before enabling `enforced` mode.
- Manual reconcile and integration disable controls.

## 10. Security and Audit Requirements

- Least privilege: `Members: read-only`; no repository permission for RBAC sync.
- Constant-time webhook signature comparison and replay deduplication.
- Private keys and webhook secrets stored only in managed secret storage.
- Installation tokens never persisted or logged.
- GitHub payloads logged only after redacting tokens, emails, and unnecessary profile data.
- All mapping, override, installation, sync, and effective-role changes emit immutable audit events.
- Integration disable, installation transfer, and role-ceiling changes require recent MFA.

## 11. Official References

- Registering a GitHub App: https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app
- Authenticating as an installation: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation
- Team member REST endpoints: https://docs.github.com/en/rest/teams/members
- Organization member REST endpoints: https://docs.github.com/en/rest/orgs/members
- Webhook events and payloads: https://docs.github.com/en/webhooks/webhook-events-and-payloads
- Validating webhook deliveries: https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
