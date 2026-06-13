import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
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
          "7"
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
      expect(receivedRequests[1]!.headers["x-ciphertext-sha256"]).toBe(ciphertextSha256);
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
});

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

async function runCli(args: readonly string[]): Promise<CliProcessResult> {
  return await new Promise<CliProcessResult>((resolve, reject) => {
    const child = spawn("pnpm", args, {
      cwd: process.cwd(),
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
