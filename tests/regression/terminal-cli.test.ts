import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const cliPath = "packages/terminal-client/src/cli-entry.ts";

describe("terminal CLI regression", () => {
  it("prints canonical snapshot bytes without extra terminal output", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wenvy-cli-"));
    const envFile = join(dir, ".env");
    await writeFile(envFile, "B=two\n# ignored\nA=one\n", "utf8");

    const result = spawnSync("pnpm", ["exec", "tsx", cliPath, "snapshot:canonicalize", envFile], {
      cwd: process.cwd(),
      encoding: "utf8"
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("A=one\nB=two\n");
    expect(result.stderr).toBe("");
  });

  it("prints snapshot hash with exactly one trailing newline", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wenvy-cli-"));
    const envFile = join(dir, ".env");
    await writeFile(envFile, "EMPTY=\n", "utf8");

    const result = spawnSync("pnpm", ["exec", "tsx", cliPath, "snapshot:hash", envFile], {
      cwd: process.cwd(),
      encoding: "utf8"
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("7819c04858487b8325a083235e0697f271991cb446086084807fec586dc27427\n");
    expect(result.stderr).toBe("");
  });

  it("exits nonzero for invalid CLI input without leaking env contents or stack traces", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wenvy-cli-"));
    const envFile = join(dir, ".env");
    await writeFile(envFile, "SUPER_SECRET_VALUE_WITHOUT_SEPARATOR\n", "utf8");

    const result = spawnSync("pnpm", ["exec", "tsx", cliPath, "snapshot:hash", envFile], {
      cwd: process.cwd(),
      encoding: "utf8"
    });

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Invalid env line");
    expect(result.stderr).not.toContain("SUPER_SECRET_VALUE_WITHOUT_SEPARATOR");
    expect(result.stderr).not.toContain("at ");
  });
});
