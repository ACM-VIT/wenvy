import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const cliPath = "packages/terminal-client/src/cli-entry.ts";

describe("terminal CLI regression", () => {
  it("prints a stepwise developer banner when run without arguments", () => {
    const result = spawnSync("pnpm", ["exec", "tsx", cliPath], {
      cwd: process.cwd(),
      encoding: "utf8"
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("wenvy");
    expect(result.stdout).toContain("wenvy init --repo <repo-id>");
    expect(result.stdout).toContain("wenvy doctor");
    expect(result.stdout).toContain("wenvy demo");
    expect(result.stdout).toContain("https://dash.wenvy.dev");
  });

  it("initializes project config with explicit repo and branch defaults", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wenvy-cli-"));

    const result = spawnSync(
      "pnpm",
      ["exec", "tsx", cliPath, "init", "--repo", "repo_01JY7X0WENVYAAA", "--branch", "main"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          WENVY_PROJECT_DIR: dir
        }
      }
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Initialized Wenvy project");
    expect(result.stdout).toContain(".wenvy/config.json");
    expect(JSON.parse(await readFile(join(dir, ".wenvy", "config.json"), "utf8"))).toEqual({
      remoteUrl: "https://api.wenvy.dev",
      repo: "repo_01JY7X0WENVYAAA",
      branch: "main"
    });
    expect(await readFile(join(dir, ".wenvy", ".gitignore"), "utf8")).toContain("*.token");
  });

  it("infers repo and branch from the current git repository when init has no repo flag", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wenvy-cli-git-"));
    mkdirSync(join(dir, "nested"), { recursive: true });
    runGit(["init", "-b", "feature/demo"], dir);
    runGit(["remote", "add", "origin", "git@github.com:ACM-VIT/ExamCooker-2024.git"], dir);

    const result = spawnSync("pnpm", ["exec", "tsx", cliPath, "init"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        WENVY_PROJECT_DIR: join(dir, "nested")
      }
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Detected:");
    expect(result.stdout).toContain("git remote: git@github.com:ACM-VIT/ExamCooker-2024.git");
    expect(result.stdout).toContain("repo id:    git_ACM-VIT_ExamCooker-2024");
    expect(result.stdout).toContain("branch:     feature/demo");
    expect(result.stdout).not.toContain("repo_demo_replace_me");
    expect(JSON.parse(await readFile(join(dir, "nested", ".wenvy", "config.json"), "utf8"))).toEqual({
      remoteUrl: "https://api.wenvy.dev",
      repo: "git_ACM-VIT_ExamCooker-2024",
      branch: "feature/demo"
    });
  });

  it("doctor falls back to git repo detection when config still has the old placeholder repo", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wenvy-cli-git-"));
    runGit(["init", "-b", "main"], dir);
    runGit(["remote", "add", "origin", "https://github.com/ACM-VIT/ExamCooker-2024.git"], dir);
    mkdirSync(join(dir, ".wenvy"), { recursive: true });
    await writeFile(
      join(dir, ".wenvy", "config.json"),
      JSON.stringify(
        {
          remoteUrl: "https://api.wenvy.dev",
          repo: "repo_demo_replace_me",
          branch: "main"
        },
        null,
        2
      ),
      "utf8"
    );

    const result = spawnSync("pnpm", ["exec", "tsx", cliPath, "doctor", "--skip-network"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        WENVY_PROJECT_DIR: dir,
        WENVY_TOKEN: "cli-test-token"
      }
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("[ok] repo: git_ACM-VIT_ExamCooker-2024 (detected from git)");
    expect(result.stdout).not.toContain("repo missing");
    expect(result.stdout).toContain("Ready.");
  });

  it("checks project readiness without requiring network when skipped", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wenvy-cli-"));
    await spawnInitForProjectDir(dir);

    const result = spawnSync("pnpm", ["exec", "tsx", cliPath, "doctor", "--skip-network"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        WENVY_PROJECT_DIR: dir,
        WENVY_TOKEN: "cli-test-token"
      }
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("[ok] config found");
    expect(result.stdout).toContain("[ok] token: found");
    expect(result.stdout).toContain("[skip] remote health");
    expect(result.stdout).toContain("Ready.");
  });

  it("loads the token from the project .env file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wenvy-cli-"));
    await spawnInitForProjectDir(dir);
    await writeFile(join(dir, ".env"), "WENVY_TOKEN=cli-test-token\n", "utf8");

    const result = spawnSync("pnpm", ["exec", "tsx", cliPath, "doctor", "--skip-network"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        WENVY_PROJECT_DIR: dir,
        WENVY_TOKEN: ""
      }
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("[ok] token: found");
    expect(result.stdout).toContain("Ready.");
  });

  it("prints demo endpoints that match the deployed dashboard and API", async () => {
    const result = spawnSync("pnpm", ["exec", "tsx", cliPath, "demo"], {
      cwd: process.cwd(),
      encoding: "utf8"
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("npm install -g wenvy");
    expect(result.stdout).toContain("https://api.wenvy.dev/health");
    expect(result.stdout).toContain("https://api.wenvy.dev/openapi.json");
    expect(result.stdout).toContain("https://dash.wenvy.dev");
    expect(result.stdout).toContain("https://wenvy.dev");
  });

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

  it("prints a guided snapshot summary for the friendly snapshot command", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wenvy-cli-"));
    const envFile = join(dir, ".env");
    await writeFile(envFile, "B=two\nA=one\n", "utf8");

    const result = spawnSync("pnpm", ["exec", "tsx", cliPath, "snapshot", envFile], {
      cwd: process.cwd(),
      encoding: "utf8"
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Wenvy snapshot");
    expect(result.stdout).toContain("A=one\nB=two\n");
    expect(result.stdout).toContain("SHA-256:");
    expect(result.stdout).toContain("wenvy push snapshot.enc");
  });

  it("pushes ciphertext through the friendly push command using project config defaults", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wenvy-cli-"));
    const ciphertextFile = join(dir, "snapshot.bin");
    const ciphertext = Buffer.from("sealed-ciphertext-bytes");
    await writeFile(ciphertextFile, ciphertext);
    await spawnInitForProjectDir(dir);

    const receivedRequests: ReceivedRequest[] = [];
    const server = createServer(async (request, response) => {
      await handleCliPushRequest(request, response, receivedRequests);
    });
    await listen(server);

    try {
      const address = server.address() as AddressInfo;
      await writeFile(
        join(dir, ".wenvy", "config.json"),
        JSON.stringify(
          {
            remoteUrl: `http://127.0.0.1:${address.port}`,
            repo: "repo_01JY7X0WENVYAAA",
            branch: "main"
          },
          null,
          2
        ),
        "utf8"
      );
      await writeFile(join(dir, ".env"), "WENVY_TOKEN=cli-test-token\n", "utf8");

      const result = await runCli(
        [
          "exec",
          "tsx",
          cliPath,
          "push",
          ciphertextFile,
          "--commit-id",
          "commit_01JY7X0WENVYAAA",
          "--idempotency-key",
          "idem_01JY7X0WENVYAAA",
          "--repo-key-version",
          "7"
        ],
        {
          WENVY_PROJECT_DIR: dir,
          WENVY_TOKEN: ""
        }
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Wenvy push complete");
      expect(result.stdout).toContain("Repo:   repo_01JY7X0WENVYAAA");
      expect(result.stdout).toContain("wenvy pull --output-file pulled.enc");
      expect(receivedRequests.map((request) => `${request.method} ${request.url}`)).toEqual([
        "POST /v1/repos/repo_01JY7X0WENVYAAA/branches/main/push/intent",
        "PUT /v1/blobs/commit_01JY7X0WENVYAAA",
        "POST /v1/repos/repo_01JY7X0WENVYAAA/branches/main/push/commit"
      ]);
    } finally {
      await close(server);
    }
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

  it("pushes ciphertext bytes through remote HTTPS-compatible routes without leaking plaintext markers", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wenvy-cli-"));
    const ciphertextFile = join(dir, "snapshot.bin");
    const ciphertext = Buffer.from("sealed-ciphertext-bytes");
    const plaintextMarker = "DATABASE_PASSWORD=super-secret";
    await writeFile(ciphertextFile, ciphertext);

    const receivedRequests: ReceivedRequest[] = [];
    const server = createServer(async (request, response) => {
      await handleCliPushRequest(request, response, receivedRequests);
    });
    await listen(server);

    try {
      const address = server.address() as AddressInfo;
      const remoteUrl = `http://127.0.0.1:${address.port}`;
      const result = await runCli(
        [
          "exec",
          "tsx",
          cliPath,
          "push:ciphertext",
          "--remote-url",
          remoteUrl,
          "--repo",
          "repo_01JY7X0WENVYAAA",
          "--branch",
          "main",
          "--ciphertext-file",
          ciphertextFile,
          "--expected-head",
          "null",
          "--commit-id",
          "commit_01JY7X0WENVYAAA",
          "--idempotency-key",
          "idem_01JY7X0WENVYAAA",
          "--repo-key-version",
          "7",
          "--token",
          "cli-test-token"
        ]
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        status: "committed",
        headCommit: "commit_01JY7X0WENVYAAA"
      });
      expect(receivedRequests.map((request) => `${request.method} ${request.url}`)).toEqual([
        "POST /v1/repos/repo_01JY7X0WENVYAAA/branches/main/push/intent",
        "PUT /v1/blobs/commit_01JY7X0WENVYAAA",
        "POST /v1/repos/repo_01JY7X0WENVYAAA/branches/main/push/commit"
      ]);

      const ciphertextSha256 = createHash("sha256").update(ciphertext).digest("hex");
      expect(JSON.parse(receivedRequests[0]!.body.toString("utf8"))).toMatchObject({
        expectedHead: null,
        nextCommit: "commit_01JY7X0WENVYAAA",
        payloadFingerprint: ciphertextSha256
      });
      expect(receivedRequests[1]!.body).toEqual(ciphertext);
      for (const request of receivedRequests) {
        expect(request.headers.authorization).toBe("Bearer cli-test-token");
      }
      expect(receivedRequests[1]!.headers["x-ciphertext-sha256"]).toBe(ciphertextSha256);
      expect(receivedRequests[1]!.headers["x-wenvy-repo-id"]).toBe("repo_01JY7X0WENVYAAA");
      expect(receivedRequests[1]!.headers["x-wenvy-branch"]).toBe("main");
      expect(JSON.parse(receivedRequests[2]!.body.toString("utf8"))).toMatchObject({
        expectedHead: null,
        commitId: "commit_01JY7X0WENVYAAA",
        parentCommitId: null,
        objectKey: "snapshots/opaque-object-key",
        ciphertextSha256,
        ciphertextSize: ciphertext.byteLength,
        repoKeyVersion: 7
      });

      const serializedWireBodies = receivedRequests.map((request) => request.body.toString("utf8")).join("\n");
      expect(serializedWireBodies).not.toContain(plaintextMarker);
      expect(serializedWireBodies).not.toContain("DATABASE_PASSWORD");
      expect(serializedWireBodies).not.toContain("super-secret");
    } finally {
      await close(server);
    }
  });

  it("fails remote data-plane commands before network access when no token is configured", async () => {
    const result = await runCli(
      [
        "exec",
        "tsx",
        cliPath,
        "pull",
        "--remote-url",
        "http://127.0.0.1:9",
        "--repo",
        "repo_01JY7X0WENVYAAA",
        "--branch",
        "main"
      ],
      { WENVY_TOKEN: "" }
    );

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("token is required");
    expect(result.stderr).not.toContain("127.0.0.1");
  });

  it("downloads pulled ciphertext through the authorized branch-scoped blob route", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wenvy-cli-"));
    const outputFile = join(dir, "pulled-snapshot.bin");
    const ciphertext = Buffer.from("sealed-pulled-ciphertext");
    const ciphertextSha256 = createHash("sha256").update(ciphertext).digest("hex");
    const plaintextMarker = "DATABASE_URL=postgres://secret";
    const receivedRequests: ReceivedRequest[] = [];
    const server = createServer(async (request, response) => {
      await handleCliPullRequest(request, response, receivedRequests, ciphertext, ciphertextSha256);
    });
    await listen(server);

    try {
      const address = server.address() as AddressInfo;
      await spawnInitForProjectDir(dir);
      await writeFile(
        join(dir, ".wenvy", "config.json"),
        JSON.stringify(
          {
            remoteUrl: `http://127.0.0.1:${address.port}`,
            repo: "repo_01JY7X0WENVYAAA",
            branch: "main"
          },
          null,
          2
        ),
        "utf8"
      );
      const result = await runCli([
        "exec",
        "tsx",
        cliPath,
        "pull",
        "--token",
        "cli-test-token",
        "--output-file",
        outputFile
      ], { WENVY_PROJECT_DIR: dir });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        status: "snapshot",
        snapshot: {
          commit: "commit_01JY7X0WENVYAAA",
          ciphertextSha256
        }
      });
      expect(await readFile(outputFile)).toEqual(ciphertext);
      expect(receivedRequests.map((request) => `${request.method} ${request.url}`)).toEqual([
        "POST /v1/repos/repo_01JY7X0WENVYAAA/branches/main/pull",
        "GET /v1/repos/repo_01JY7X0WENVYAAA/branches/main/blobs/commit_01JY7X0WENVYAAA"
      ]);
      for (const request of receivedRequests) {
        expect(request.headers.authorization).toBe("Bearer cli-test-token");
      }
      const serializedWireBodies = receivedRequests.map((request) => request.body.toString("utf8")).join("\n");
      expect(serializedWireBodies).not.toContain(plaintextMarker);
      expect(serializedWireBodies).not.toContain("DATABASE_URL");
      expect(ciphertext.toString("utf8")).not.toContain("postgres://secret");
    } finally {
      await close(server);
    }
  });
});

async function spawnInitForProjectDir(dir: string): Promise<void> {
  const result = spawnSync("pnpm", ["exec", "tsx", cliPath, "init", "--repo", "repo_01JY7X0WENVYAAA"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      WENVY_PROJECT_DIR: dir
    }
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "wenvy init failed");
  }
}

function runGit(args: readonly string[], cwd: string): void {
  const result = spawnSync("git", [...args], {
    cwd,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
  }
}

interface ReceivedRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: IncomingMessage["headers"];
  readonly body: Buffer;
}

async function handleCliPushRequest(
  request: IncomingMessage,
  response: ServerResponse,
  receivedRequests: ReceivedRequest[]
): Promise<void> {
  const body = await readRequestBody(request);
  receivedRequests.push({
    method: request.method ?? "UNKNOWN",
    url: request.url ?? "",
    headers: request.headers,
    body
  });

  if (request.method === "POST" && request.url === "/v1/repos/repo_01JY7X0WENVYAAA/branches/main/push/intent") {
    writeJson(response, {
      status: "accepted",
      commit: "commit_01JY7X0WENVYAAA",
      headCommit: null
    });
    return;
  }

  if (request.method === "PUT" && request.url === "/v1/blobs/commit_01JY7X0WENVYAAA") {
    writeJson(response, {
      objectKey: "snapshots/opaque-object-key",
      ciphertextSha256: request.headers["x-ciphertext-sha256"]
    });
    return;
  }

  if (request.method === "POST" && request.url === "/v1/repos/repo_01JY7X0WENVYAAA/branches/main/push/commit") {
    writeJson(response, {
      status: "committed",
      commit: "commit_01JY7X0WENVYAAA",
      headCommit: "commit_01JY7X0WENVYAAA"
    });
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not-found" }));
}

async function handleCliPullRequest(
  request: IncomingMessage,
  response: ServerResponse,
  receivedRequests: ReceivedRequest[],
  ciphertext: Buffer,
  ciphertextSha256: string
): Promise<void> {
  const body = await readRequestBody(request);
  receivedRequests.push({
    method: request.method ?? "UNKNOWN",
    url: request.url ?? "",
    headers: request.headers,
    body
  });

  if (request.method === "POST" && request.url === "/v1/repos/repo_01JY7X0WENVYAAA/branches/main/pull") {
    writeJson(response, {
      status: "snapshot",
      headCommit: "commit_01JY7X0WENVYAAA",
      snapshot: {
        commit: "commit_01JY7X0WENVYAAA",
        parentCommit: null,
        objectKey: "snapshots/server-owned-object-key",
        ciphertextSha256,
        ciphertextSize: ciphertext.byteLength,
        repoKeyVersion: 1,
        createdAt: "2026-06-13T12:00:00.000Z"
      }
    });
    return;
  }

  if (request.method === "GET" && request.url === "/v1/repos/repo_01JY7X0WENVYAAA/branches/main/blobs/commit_01JY7X0WENVYAAA") {
    response.writeHead(200, {
      "content-type": "application/octet-stream",
      "x-ciphertext-sha256": ciphertextSha256
    });
    response.end(ciphertext);
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not-found" }));
}

async function readRequestBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function writeJson(response: ServerResponse, body: unknown): void {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function listen(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

async function close(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

interface CliProcessResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

async function runCli(args: readonly string[], env: Record<string, string> = {}): Promise<CliProcessResult> {
  return await new Promise<CliProcessResult>((resolve, reject) => {
    const child = spawn("pnpm", args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...env
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}
