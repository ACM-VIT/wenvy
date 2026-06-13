import { maxDataRole, minDataRole, type DataRole } from "./roles.js";

export type OverrideMode = "grant" | "cap" | "deny";

export interface GithubGrant {
  readonly source:
    | "org-default"
    | "org-owner"
    | "team-member"
    | "team-maintainer"
    | "user-override";
  readonly role: DataRole;
  readonly scope: string;
}

export interface UserOverride {
  readonly mode: OverrideMode;
  readonly role?: DataRole;
  readonly scope: string;
  readonly expiresAt?: string;
}

export interface EffectiveGithubRoleInput {
  readonly linkedGithubUser: boolean;
  readonly installationActive: boolean;
  readonly failClosed: boolean;
  readonly roleCeiling: DataRole;
  readonly grants: readonly GithubGrant[];
  readonly overrides: readonly UserOverride[];
  readonly now: Date;
  readonly scope: string;
}

export interface EffectiveGithubRoleDecision {
  readonly allowed: boolean;
  readonly role: DataRole;
  readonly denied: boolean;
  readonly reasons: readonly string[];
}

export function evaluateGithubEffectiveRole(
  input: EffectiveGithubRoleInput
): EffectiveGithubRoleDecision {
  const reasons: string[] = [];

  if (!input.linkedGithubUser) {
    return { allowed: false, role: "none", denied: true, reasons: ["github-user-not-linked"] };
  }

  if (!input.installationActive && input.failClosed) {
    return { allowed: false, role: "none", denied: true, reasons: ["github-installation-inactive"] };
  }

  const activeOverrides = input.overrides.filter((override) =>
    isOverrideActiveForScope(override, input.scope, input.now)
  );

  if (activeOverrides.some((override) => override.mode === "deny")) {
    return { allowed: false, role: "none", denied: true, reasons: ["deny-override"] };
  }

  const grantRoles = input.grants
    .filter((grant) => grant.scope === input.scope || grant.scope === "*")
    .map((grant) => normalizeGithubGrantRole(grant.role));

  const overrideGrantRoles = activeOverrides
    .filter((override): override is UserOverride & { readonly role: DataRole } =>
      override.mode === "grant" && override.role !== undefined
    )
    .map((override) => override.role);

  let role = maxDataRole([...grantRoles, ...overrideGrantRoles, "none"]);
  role = minDataRole(role, normalizeGithubGrantRole(input.roleCeiling));

  for (const cap of activeOverrides.filter(
    (override): override is UserOverride & { readonly role: DataRole } =>
      override.mode === "cap" && override.role !== undefined
  )) {
    role = minDataRole(role, normalizeGithubGrantRole(cap.role));
  }

  if (role === "none") {
    reasons.push("no-effective-grant");
  }

  return {
    allowed: role !== "none",
    role,
    denied: false,
    reasons
  };
}

function normalizeGithubGrantRole(role: DataRole): DataRole {
  return role === "owner" ? "admin" : role;
}

function isOverrideActiveForScope(
  override: UserOverride,
  scope: string,
  now: Date
): boolean {
  if (override.scope !== scope && override.scope !== "*") return false;
  if (!override.expiresAt) return true;
  return Date.parse(override.expiresAt) > now.getTime();
}
