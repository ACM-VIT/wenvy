export type ServiceAccountStatus = "active" | "suspended" | "revoked";
export type ServiceAccountCapability = "pull-only" | "push-and-pull";
export type ServiceAccountOperation =
  | "pull"
  | "push"
  | "manage-membership"
  | "change-policy"
  | "rotate-key";

export interface ServiceAccountTokenPolicy {
  readonly status: ServiceAccountStatus;
  readonly expiresAt?: string;
  readonly revokedAt?: string;
  readonly allowedBranches: readonly string[];
  readonly capabilities: ServiceAccountCapability;
}

export interface ServiceAccountAuthorizationInput {
  readonly token: ServiceAccountTokenPolicy;
  readonly branchName: string;
  readonly operation: ServiceAccountOperation;
  readonly now: Date;
}

export interface ServiceAccountAuthorizationDecision {
  readonly allowed: boolean;
  readonly reason:
    | "allowed"
    | "token-revoked"
    | "token-suspended"
    | "token-expired"
    | "branch-not-allowed"
    | "capability-denied"
    | "forbidden-operation";
}

export function authorizeServiceAccount(
  input: ServiceAccountAuthorizationInput
): ServiceAccountAuthorizationDecision {
  if (input.token.status === "revoked" || input.token.revokedAt !== undefined) {
    return { allowed: false, reason: "token-revoked" };
  }

  if (input.token.status === "suspended") {
    return { allowed: false, reason: "token-suspended" };
  }

  if (input.token.expiresAt && Date.parse(input.token.expiresAt) <= input.now.getTime()) {
    return { allowed: false, reason: "token-expired" };
  }

  if (
    input.operation === "manage-membership" ||
    input.operation === "change-policy" ||
    input.operation === "rotate-key"
  ) {
    return { allowed: false, reason: "forbidden-operation" };
  }

  if (!matchesAnyBranchPattern(input.branchName, input.token.allowedBranches)) {
    return { allowed: false, reason: "branch-not-allowed" };
  }

  if (input.operation === "push" && input.token.capabilities !== "push-and-pull") {
    return { allowed: false, reason: "capability-denied" };
  }

  return { allowed: true, reason: "allowed" };
}

export function matchesAnyBranchPattern(
  branchName: string,
  patterns: readonly string[]
): boolean {
  return patterns.some((pattern) => {
    if (pattern === "*") return true;
    if (pattern === branchName) return true;
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -1);
      return branchName.startsWith(prefix) && branchName.length > prefix.length;
    }
    return false;
  });
}
