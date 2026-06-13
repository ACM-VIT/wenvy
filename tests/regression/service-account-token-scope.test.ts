import { describe, expect, it } from "vitest";
import { authorizeServiceAccount } from "@wenvy/domain";

const now = new Date("2026-06-13T12:00:00.000Z");

describe("service account token scope regression", () => {
  it("allows pull for matching branch allow-list", () => {
    const decision = authorizeServiceAccount({
      token: {
        status: "active",
        allowedBranches: ["production", "release/*"],
        capabilities: "pull-only"
      },
      branchName: "production",
      operation: "pull",
      now
    });

    expect(decision).toEqual({ allowed: true, reason: "allowed" });
  });

  it("denies push for pull-only service account tokens", () => {
    const decision = authorizeServiceAccount({
      token: {
        status: "active",
        allowedBranches: ["production"],
        capabilities: "pull-only"
      },
      branchName: "production",
      operation: "push",
      now
    });

    expect(decision).toEqual({ allowed: false, reason: "capability-denied" });
  });

  it("denies access outside allowed branch patterns", () => {
    const decision = authorizeServiceAccount({
      token: {
        status: "active",
        allowedBranches: ["production", "release/*"],
        capabilities: "push-and-pull"
      },
      branchName: "dev",
      operation: "pull",
      now
    });

    expect(decision).toEqual({ allowed: false, reason: "branch-not-allowed" });
  });

  it("rejects revoked and expired service account tokens before branch evaluation", () => {
    const revoked = authorizeServiceAccount({
      token: {
        status: "revoked",
        allowedBranches: ["*"],
        capabilities: "push-and-pull"
      },
      branchName: "production",
      operation: "pull",
      now
    });
    const expired = authorizeServiceAccount({
      token: {
        status: "active",
        expiresAt: "2026-06-13T11:59:59.000Z",
        allowedBranches: ["*"],
        capabilities: "push-and-pull"
      },
      branchName: "production",
      operation: "pull",
      now
    });

    expect(revoked.reason).toBe("token-revoked");
    expect(expired.reason).toBe("token-expired");
  });

  it("forbids membership policy and rotation operations", () => {
    const decision = authorizeServiceAccount({
      token: {
        status: "active",
        allowedBranches: ["*"],
        capabilities: "push-and-pull"
      },
      branchName: "production",
      operation: "rotate-key",
      now
    });

    expect(decision).toEqual({ allowed: false, reason: "forbidden-operation" });
  });
});
