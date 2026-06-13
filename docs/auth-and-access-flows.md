# Authentication and Access Flows

## 1. Auth Modes

1. Web passwordless email magic link.
2. CLI SSH key authentication.
3. SSH-to-web bridge (terminal-authenticated browser login).
4. Branch-aware authorization for all write operations.
5. Optional GitHub App identity linking and RBAC inheritance.

## 2. Web Passwordless Account Flow

1. User enters email in web login form.
2. Server generates short-lived one-time token and emails magic link.
3. Server stores a browser session fingerprint hash (derived from the originating request's session cookie or CSRF token) alongside the token.
4. User clicks link.
5. Server validates token hash, expiration, unused status, and **browser session fingerprint match** (the link must be opened in the same browser that initiated the login).
6. Server creates web session and marks token used.
7. If user does not exist, create user shell account and mark onboarding state.

Cloudflare implementation note:
- Token consumption is coordinated through an `AuthTokenCoordinator` Durable Object so a magic link cannot be redeemed twice from different edge locations.
- The durable audit/session record is persisted to Postgres after the Durable Object accepts the redemption.

Device binding rationale:
- Prevents magic link interception attacks: an attacker who captures the email link cannot use it from a different browser/device.
- The fingerprint is a hash of the session cookie set when the login form was submitted; it is not a hardware fingerprint.

Onboarding state options:

- `No SSH key yet`: governance-only UI with setup prompts.
- `SSH key registered`: full access according to team roles.

## 3. SSH CLI Login Flow

1. CLI opens SSH connection.
2. Server validates SSH signature challenge against stored public key fingerprint.
3. Server resolves user and evaluates account status.
4. Server authorizes command by org/team/repo role.
5. Server returns requested metadata/blob pointers/envelopes as applicable.

## 4. SSH-to-Web Bridge Flow

1. User runs SSH login bridge command in terminal.
2. SSH service verifies key identity.
3. Server issues one-time bridge token (short TTL).
4. CLI prints URL containing token.
5. User opens URL in browser.
6. Web service validates and consumes token.
7. Web session is created for authenticated user.

Controls:

- Single use only.
- Short expiry (max 5 minutes).
- Token hash only stored server-side.
- Token consumption coordinated through the same Durable Object path used by magic links.
- **IP binding**: bridge token is bound to the IP address of the SSH session; the browser must originate from the same IP (or a configurable IP allow-list for NAT environments).
- **Scope restriction**: bridge sessions created via this flow can optionally be restricted to read-only governance actions for the first N minutes, requiring explicit re-confirmation for sensitive operations.

## 5. Invitation and Membership Flow

1. Admin/Owner invites user by email to team or org role.
2. Invite token is issued and emailed.
3. User accepts invite via magic link and authenticates.
4. If new user, complete SSH key registration.
5. Team membership becomes active.
6. Admin client re-wraps active team key for new member SSH key(s).
7. Envelope entries are stored.
8. If new member has a recovery key configured, team key is also wrapped for recovery key.

## 5a. CI/CD Service Account Authentication Flow

1. CI/CD pipeline authenticates via scoped API token in HTTP `Authorization: Bearer <token>` header.
2. Server validates token hash against `service_account_tokens`, checks expiry, revocation, and status.
3. Server resolves the service account's org/team/repo scope and allowed branches.
4. Server authorizes the requested operation (pull only or push-and-pull) against scope and branch allow-list.
5. If authorized, server returns envelopes and blob references (for pull) or accepts blob upload (for push).
6. Service account decrypts using its embedded private key following the same envelope chain as user SSH keys.
7. All service account actions are audit-logged with `actor_service_account_id`.

Restrictions:
- Service accounts cannot: manage membership, rotate keys, modify policies, create invites, or access the web dashboard.
- Service accounts cannot authenticate via SSH or magic links.
- Token rotation: service account tokens should be rotated periodically; old tokens are revoked.

## 5b. Multi-Device SSH Key Addition Flow

1. User registers a new SSH public key via CLI (`wenvy keys add`) or web dashboard.
2. If the user has an existing working device:
   - CLI on existing device decrypts current team key(s) using the existing SSH key.
   - CLI wraps team key(s) for the new SSH key and uploads new envelopes.
   - New device can immediately pull and decrypt.
3. If the user has no existing device but has a recovery key:
   - User authenticates via email.
   - User proves recovery key possession (server challenge-response).
   - CLI decrypts team key(s) using recovery key envelope.
   - CLI wraps team key(s) for the new SSH key.
4. If the user has neither existing device nor recovery key:
   - A team admin must perform envelope re-wrap from their own device.
   - This is a privileged, audit-logged operation.
   - Admin is notified of the request; they can approve or deny.

## 5c. GitHub App Membership Flow

1. A Wenvy owner installs the GitHub App on the corresponding GitHub organization.
2. Wenvy stores the installation and immutable GitHub organization ID.
3. A user links their GitHub identity through GitHub user authorization; email matching alone is never sufficient.
4. Wenvy reconciles active organization and mapped team memberships.
5. Organization defaults, team mappings, and user overrides produce the effective Wenvy role.
6. Unlinked GitHub users remain pending and receive no key envelopes.
7. When a linked membership grants access, envelope provisioning is queued.
8. When GitHub-derived access is removed, new access is denied immediately and key rotation is queued.

GitHub sync cannot grant Wenvy `owner`, bypass branch policy, or mutate GitHub membership. See `github-app-rbac.md`.

## 6. Role-Based Access Matrix

1. `viewer`
- Can pull/decrypt secrets.
- Cannot push new versions.
- Cannot manage membership.

2. `editor`
- Can pull and push secret snapshots.
- Cannot change team membership.
- Cannot rotate keys directly.

3. `admin`
- Can manage team members.
- Can trigger key rotation.
- Can manage repo access policies.

4. `owner`
- Full control over organization/team/repo governance.

Role scope note:

- Team/repo role is baseline capability.
- Branch policy can further restrict capabilities for specific branches.
- GitHub mappings and local user overrides determine the baseline role for linked organizations.
- Explicit denies and branch policy always take precedence over grants.

## 7. Branch-Based Access Rules

1. Policy model
- Evaluate role permission first, then branch-specific policy.
- Deny if either check fails.

2. Default branch rules
- `dev`: `editor`, `admin`, `owner` write allowed.
- `staging`: `editor` write may require approval based on branch policy; `admin` and `owner` can approve/merge.
- `production`: direct `editor` writes denied; `admin` and `owner` only under protected branch controls.

3. Protected-branch control points
- Approval requirement before branch head move.
- Freeze window support for temporary write lock.
- Force-push behavior explicitly controlled by policy.

4. Branch access examples
- User with `editor` team role may still be blocked from `production` branch writes.
- User with `viewer` cannot write to any branch even if branch policy is permissive.

## 8. Write Authorization Flow (Branch-Aware)

1. Authenticate user via SSH session.
2. Resolve org/team membership and effective repo role.
3. Resolve matching branch policy by branch name/pattern.
4. Validate operation (`push`, `merge`, `policy update`) against branch role rules.
5. If approvals are required, create change request and wait for approval threshold.
6. On success, accept commit/branch update and emit audit event.
7. On failure, deny and emit denied audit/security event.

## 9. Revocation Flow

1. Admin removes a team member or revokes an SSH key.
2. Server immediately blocks future authenticated fetches.
3. Rotation job is queued based on policy.
4. New team key version is generated.
5. New envelopes are created for remaining active members.
6. Repo keys are re-wrapped to active team key version.
7. Rotation completion event is audited.

## 10. Error and Recovery Paths

1. Expired magic link
- User re-requests login link.

2. Lost SSH key (single key)
- User authenticates from another registered device.
- Uses existing device to wrap team keys for a new SSH key.
- Access resumes immediately.

3. Lost all SSH keys (with recovery key)
- User authenticates by verified email.
- Proves recovery key possession.
- Registers new SSH key.
- CLI decrypts team keys via recovery key envelope and re-wraps for new SSH key.

4. Lost all SSH keys (without recovery key)
- User authenticates by verified email.
- Adds new SSH key with possession proof flow.
- A team admin must re-wrap team key envelopes from their device.
- Access resumes after admin-performed envelope re-wrap.
- This scenario is slow and requires admin availability — recovery keys are strongly recommended.

5. Suspicious token reuse
- Reject attempt.
- Emit security event.
- Optionally revoke active sessions.

6. Account takeover via email compromise
- Risk: attacker who controls a user's email can initiate magic link login, add a new SSH key, and request envelope re-wrap.
- Mitigation layers:
  - MFA (TOTP/WebAuthn) required for sensitive actions (adding SSH keys, session creation) if org policy enables it.
  - Recovery key proof required for envelope re-wrap (attacker would need both email and recovery key).
  - Admin notification on new SSH key registration for existing accounts.
  - Suspicious login detection (new IP/geo, new user agent) triggers security event.
  - Org admins can enforce a mandatory cool-down period before new SSH keys can receive envelopes.

## 11. Abuse Prevention

1. Rate-limit login and invite endpoints.
2. Add per-IP and per-email throttles.
3. Add anomaly detection for failed SSH attempts.
4. Require re-auth for sensitive actions (member removal, role elevation, rotation).
5. Alert on denied write attempts to protected branches.
6. **Rate-limit SSH data-plane commands** (push/pull): per-user and per-repo throttles to prevent rapid exfiltration by a compromised key before revocation.
7. Service account token rate limits: per-token request caps with configurable burst.
8. Apply Cloudflare WAF rate limiting to HTTP auth endpoints and Durable Object-backed counters for app-level per-user, per-repo, and per-token limits.

## 12. Multi-Factor Authentication (MFA)

1. MFA is optional per-user and enforceable per-organization.
2. Supported second factors:
   - TOTP (RFC 6238) via authenticator app.
   - WebAuthn/FIDO2 hardware key (recommended for high-security orgs).
3. MFA is required for:
   - Web dashboard login (when org policy enforces it).
   - Adding or revoking SSH keys via web dashboard.
   - Modifying team membership or roles.
   - Changing branch protection policies.
4. MFA is **not** required for:
   - SSH CLI push/pull (SSH key possession is the factor).
   - SSH-to-web bridge (SSH key authentication serves as the factor).
5. MFA recovery:
   - Backup codes generated at MFA enrollment (one-time use).
   - Recovery key can bypass MFA for account recovery with admin approval.
6. Org-level MFA policy:
   - `disabled`: MFA not available.
   - `optional`: users can enable MFA voluntarily.
   - `required`: all org members must enroll MFA within a grace period.
   - `required_for_admins`: only admin/owner roles must have MFA.
