import { describe, expect, it } from "vitest";
import { evaluateBranchAccess, resolveBranchPolicy, type BranchPolicy } from "@wenvy/domain";

const policies: BranchPolicy[] = [
  {
    branchPattern: "*",
    classification: "development",
    isProtected: false,
    allowForcePush: false,
    requireChangeApproval: false,
    requiredApprovals: 0,
    freezeWrites: false,
    rules: [
      { role: "viewer", canRead: true, canWrite: false, canMerge: false, canChangePolicy: false },
      { role: "editor", canRead: true, canWrite: true, canMerge: false, canChangePolicy: false },
      { role: "admin", canRead: true, canWrite: true, canMerge: true, canChangePolicy: true },
      { role: "owner", canRead: true, canWrite: true, canMerge: true, canChangePolicy: true }
    ]
  },
  {
    branchPattern: "release/*",
    classification: "preproduction",
    isProtected: true,
    allowForcePush: false,
    requireChangeApproval: true,
    requiredApprovals: 1,
    freezeWrites: false,
    rules: [
      { role: "viewer", canRead: true, canWrite: false, canMerge: false, canChangePolicy: false },
      { role: "editor", canRead: true, canWrite: true, canMerge: false, canChangePolicy: false },
      { role: "admin", canRead: true, canWrite: true, canMerge: true, canChangePolicy: true },
      { role: "owner", canRead: true, canWrite: true, canMerge: true, canChangePolicy: true }
    ]
  },
  {
    branchPattern: "production",
    classification: "production",
    isProtected: true,
    allowForcePush: false,
    requireChangeApproval: true,
    requiredApprovals: 2,
    freezeWrites: false,
    rules: [
      { role: "viewer", canRead: true, canWrite: false, canMerge: false, canChangePolicy: false },
      { role: "editor", canRead: true, canWrite: false, canMerge: false, canChangePolicy: false },
      { role: "admin", canRead: true, canWrite: true, canMerge: true, canChangePolicy: true },
      { role: "owner", canRead: true, canWrite: true, canMerge: true, canChangePolicy: true }
    ]
  }
];

describe("branch policy regression", () => {
  it("prefers exact over prefix wildcard and global wildcard", () => {
    expect(resolveBranchPolicy("production", policies)?.branchPattern).toBe("production");
    expect(resolveBranchPolicy("release/2026-06", policies)?.branchPattern).toBe("release/*");
    expect(resolveBranchPolicy("feature/new-flow", policies)?.branchPattern).toBe("*");
  });

  it("default-denies unmatched write operations to non-admin roles", () => {
    const decision = evaluateBranchAccess({
      role: "editor",
      branchName: "feature/new-flow",
      operation: "write",
      policies: []
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("default-deny");
  });

  it("denies editor direct write to production even when approval is satisfied", () => {
    const decision = evaluateBranchAccess({
      role: "editor",
      branchName: "production",
      operation: "write",
      policies,
      approvalsSatisfied: true
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("role-denied");
  });

  it("requires approval before protected branch head moves", () => {
    const decision = evaluateBranchAccess({
      role: "admin",
      branchName: "production",
      operation: "write",
      policies
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("approval-required");
  });

  it("requires owner for protected branch deletion", () => {
    const adminDecision = evaluateBranchAccess({
      role: "admin",
      branchName: "production",
      operation: "delete",
      policies
    });
    const ownerDecision = evaluateBranchAccess({
      role: "owner",
      branchName: "production",
      operation: "delete",
      policies
    });

    expect(adminDecision.allowed).toBe(false);
    expect(adminDecision.reason).toBe("protected-branch");
    expect(ownerDecision.allowed).toBe(true);
  });
});
