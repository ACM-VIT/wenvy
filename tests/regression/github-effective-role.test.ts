import { describe, expect, it } from "vitest";
import { evaluateGithubEffectiveRole } from "@wenvy/domain";

const now = new Date("2026-06-13T00:00:00.000Z");

describe("GitHub App effective role regression", () => {
  it("requires linked GitHub user", () => {
    const decision = evaluateGithubEffectiveRole({
      linkedGithubUser: false,
      installationActive: true,
      failClosed: true,
      roleCeiling: "admin",
      grants: [{ source: "team-member", role: "editor", scope: "team:platform" }],
      overrides: [],
      now,
      scope: "team:platform"
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("github-user-not-linked");
  });

  it("fail-closes when installation is suspended", () => {
    const decision = evaluateGithubEffectiveRole({
      linkedGithubUser: true,
      installationActive: false,
      failClosed: true,
      roleCeiling: "admin",
      grants: [{ source: "team-member", role: "editor", scope: "team:platform" }],
      overrides: [],
      now,
      scope: "team:platform"
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("github-installation-inactive");
  });

  it("selects highest grant and applies organization ceiling", () => {
    const decision = evaluateGithubEffectiveRole({
      linkedGithubUser: true,
      installationActive: true,
      failClosed: true,
      roleCeiling: "editor",
      grants: [
        { source: "org-default", role: "viewer", scope: "*" },
        { source: "team-maintainer", role: "admin", scope: "team:platform" }
      ],
      overrides: [],
      now,
      scope: "team:platform"
    });

    expect(decision.role).toBe("editor");
    expect(decision.allowed).toBe(true);
  });

  it("never returns owner from GitHub-derived grants", () => {
    const decision = evaluateGithubEffectiveRole({
      linkedGithubUser: true,
      installationActive: true,
      failClosed: true,
      roleCeiling: "owner",
      grants: [{ source: "org-owner", role: "owner", scope: "*" }],
      overrides: [],
      now,
      scope: "team:platform"
    });

    expect(decision.role).toBe("admin");
  });

  it("applies cap after grants and deny wins", () => {
    const capped = evaluateGithubEffectiveRole({
      linkedGithubUser: true,
      installationActive: true,
      failClosed: true,
      roleCeiling: "admin",
      grants: [{ source: "team-maintainer", role: "admin", scope: "team:platform" }],
      overrides: [{ mode: "cap", role: "viewer", scope: "team:platform" }],
      now,
      scope: "team:platform"
    });
    const denied = evaluateGithubEffectiveRole({
      linkedGithubUser: true,
      installationActive: true,
      failClosed: true,
      roleCeiling: "admin",
      grants: [{ source: "team-maintainer", role: "admin", scope: "team:platform" }],
      overrides: [{ mode: "deny", scope: "team:platform" }],
      now,
      scope: "team:platform"
    });

    expect(capped.role).toBe("viewer");
    expect(denied.allowed).toBe(false);
    expect(denied.reasons).toContain("deny-override");
  });
});
