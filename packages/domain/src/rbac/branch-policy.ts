import { canRead, canWrite, type DataRole } from "./roles.js";

export type BranchClassification = "development" | "preproduction" | "production";

export interface BranchRoleRule {
  readonly role: DataRole;
  readonly canRead: boolean;
  readonly canWrite: boolean;
  readonly canMerge: boolean;
  readonly canChangePolicy: boolean;
}

export interface BranchPolicy {
  readonly branchPattern: string;
  readonly classification: BranchClassification;
  readonly isProtected: boolean;
  readonly allowForcePush: boolean;
  readonly requireChangeApproval: boolean;
  readonly requiredApprovals: number;
  readonly freezeWrites: boolean;
  readonly rules: readonly BranchRoleRule[];
}

export type BranchOperation = "read" | "write" | "merge" | "change-policy" | "delete";

export interface BranchAccessDecision {
  readonly allowed: boolean;
  readonly reason:
    | "allowed"
    | "default-deny"
    | "missing-rule"
    | "protected-branch"
    | "frozen"
    | "approval-required"
    | "role-denied";
  readonly matchedPolicy?: BranchPolicy;
}

export function resolveBranchPolicy(
  branchName: string,
  policies: readonly BranchPolicy[]
): BranchPolicy | undefined {
  const exact = policies.find((policy) => policy.branchPattern === branchName);
  if (exact) return exact;

  const prefixMatches = policies
    .filter((policy) => policy.branchPattern.endsWith("/*"))
    .filter((policy) => branchName.startsWith(policy.branchPattern.slice(0, -1)))
    .sort((left, right) => right.branchPattern.length - left.branchPattern.length);

  if (prefixMatches[0]) return prefixMatches[0];

  return policies.find((policy) => policy.branchPattern === "*");
}

export function evaluateBranchAccess(input: {
  readonly role: DataRole;
  readonly branchName: string;
  readonly operation: BranchOperation;
  readonly policies: readonly BranchPolicy[];
  readonly approvalsSatisfied?: boolean;
}): BranchAccessDecision {
  const matchedPolicy = resolveBranchPolicy(input.branchName, input.policies);

  if (!matchedPolicy) {
    return {
      allowed: input.operation === "read" ? canRead(input.role) : input.role === "admin" || input.role === "owner",
      reason:
        input.operation === "read" && canRead(input.role)
          ? "allowed"
          : input.role === "admin" || input.role === "owner"
            ? "allowed"
            : "default-deny"
    };
  }

  if (input.operation !== "read" && matchedPolicy.freezeWrites) {
    return { allowed: false, reason: "frozen", matchedPolicy };
  }

  if (input.operation === "delete" && matchedPolicy.isProtected && input.role !== "owner") {
    return { allowed: false, reason: "protected-branch", matchedPolicy };
  }

  if (
    (input.operation === "write" || input.operation === "merge") &&
    matchedPolicy.requireChangeApproval &&
    input.approvalsSatisfied !== true
  ) {
    return { allowed: false, reason: "approval-required", matchedPolicy };
  }

  const rule = matchedPolicy.rules.find((candidate) => candidate.role === input.role);
  if (!rule) {
    return { allowed: false, reason: "missing-rule", matchedPolicy };
  }

  const allowed = isOperationAllowed(input.operation, rule, input.role);
  return {
    allowed,
    reason: allowed ? "allowed" : "role-denied",
    matchedPolicy
  };
}

function isOperationAllowed(
  operation: BranchOperation,
  rule: BranchRoleRule,
  role: DataRole
): boolean {
  switch (operation) {
    case "read":
      return rule.canRead || canRead(role);
    case "write":
      return rule.canWrite && canWrite(role);
    case "merge":
      return rule.canMerge && canWrite(role);
    case "change-policy":
      return rule.canChangePolicy && (role === "admin" || role === "owner");
    case "delete":
      return role === "admin" || role === "owner";
  }
}
