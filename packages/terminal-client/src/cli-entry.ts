#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Command } from "commander";
import type { PullRequest, PushCommitRequest, PushIntentRequest } from "@wenvy/contracts";
import {
  assertDataRole,
  canonicalizeEnvSnapshot,
  evaluateBranchAccess,
  type BranchOperation,
  type BranchPolicy
} from "@wenvy/domain";

const program = new Command()
  .name("wenvy")
  .description("TypeScript terminal client for Wenvy encrypted environment state")
  .version("0.1.0");

program
  .command("snapshot:canonicalize")
  .argument("<env-file>")
  .description("Print canonical env snapshot bytes for regression/debugging")
  .action(async (envFile: string) => {
    const input = await readFile(envFile, "utf8");
    const snapshot = await canonicalizeEnvSnapshot(input);
    process.stdout.write(snapshot.canonicalText);
  });

program
  .command("snapshot:hash")
  .argument("<env-file>")
  .description("Print SHA-256 hash of canonical env snapshot bytes")
  .action(async (envFile: string) => {
    const input = await readFile(envFile, "utf8");
    const snapshot = await canonicalizeEnvSnapshot(input);
    process.stdout.write(`${snapshot.sha256Hex}\n`);
  });

program
  .command("policy:check")
  .requiredOption("--role <role>")
  .requiredOption("--branch <branch>")
  .requiredOption("--operation <operation>")
  .requiredOption("--policy-file <policy-file>")
  .description("Evaluate a branch policy decision from a JSON policy file")
  .action(
    async (options: {
      readonly role: string;
      readonly branch: string;
      readonly operation: BranchOperation;
      readonly policyFile: string;
    }) => {
      assertDataRole(options.role);
      const policyText = await readFile(options.policyFile, "utf8");
      const policies = JSON.parse(policyText) as BranchPolicy[];
      const decision = evaluateBranchAccess({
        role: options.role,
        branchName: options.branch,
        operation: options.operation,
        policies
      });
      process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
    }
  );

program
  .command("pull")
  .requiredOption("--remote-url <url>")
  .requiredOption("--repo <repo>")
  .requiredOption("--branch <branch>")
  .option("--token <token>")
  .option("--known-head <id-or-null>")
  .description("Pull latest encrypted snapshot metadata from the Worker data plane")
  .action(
    async (options: {
      readonly remoteUrl: string;
      readonly repo: string;
      readonly branch: string;
      readonly token?: string;
      readonly knownHead?: string;
    }) => {
      const token = readAuthToken(options.token);
      const body: PullRequest = {
        knownHead: parseOptionalNullableCliValue(options.knownHead)
      };
      const response = await postJson(
        dataPlaneUrl(options.remoteUrl, "/v1/repos", options.repo, "branches", options.branch, "pull"),
        body,
        token
      );
      process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
    }
  );

program
  .command("push:ciphertext")
  .requiredOption("--remote-url <url>")
  .requiredOption("--repo <repo>")
  .requiredOption("--branch <branch>")
  .requiredOption("--ciphertext-file <file>")
  .requiredOption("--expected-head <id-or-null>")
  .requiredOption("--commit-id <id>")
  .requiredOption("--idempotency-key <id>")
  .requiredOption("--repo-key-version <number>")
  .option("--token <token>")
  .option("--parent-commit-id <id-or-null>")
  .description("Push encrypted snapshot bytes through Worker HTTPS routes")
  .action(
    async (options: {
      readonly remoteUrl: string;
      readonly repo: string;
      readonly branch: string;
      readonly ciphertextFile: string;
      readonly expectedHead: string;
      readonly commitId: string;
      readonly idempotencyKey: string;
      readonly repoKeyVersion: string;
      readonly token?: string;
      readonly parentCommitId?: string;
    }) => {
      const token = readAuthToken(options.token);
      const ciphertext = await readFile(options.ciphertextFile);
      const ciphertextSha256 = sha256Hex(ciphertext);
      const expectedHead = parseRequiredNullableCliValue(options.expectedHead);
      const parentCommitId = parseOptionalNullableCliValue(options.parentCommitId) ?? expectedHead;
      const repoKeyVersion = parsePositiveInteger(options.repoKeyVersion, "repo-key-version");

      const intent: PushIntentRequest = {
        expectedHead,
        nextCommit: options.commitId,
        idempotencyKey: options.idempotencyKey,
        payloadFingerprint: ciphertextSha256
      };
      await postJson(
        dataPlaneUrl(options.remoteUrl, "/v1/repos", options.repo, "branches", options.branch, "push", "intent"),
        intent,
        token
      );

      const blobResponse = await putBytes(
        dataPlaneUrl(options.remoteUrl, "/v1/blobs", options.commitId),
        ciphertext,
        {
          "content-type": "application/octet-stream",
          "x-ciphertext-sha256": ciphertextSha256,
          "x-wenvy-repo-id": options.repo,
          "x-wenvy-branch": options.branch
        },
        token
      );
      const objectKey = readStringField(blobResponse, "objectKey");

      const commit: PushCommitRequest = {
        expectedHead,
        commitId: options.commitId,
        parentCommitId,
        idempotencyKey: options.idempotencyKey,
        payloadFingerprint: ciphertextSha256,
        objectKey,
        ciphertextSha256,
        ciphertextSize: ciphertext.byteLength,
        repoKeyVersion
      };
      const response = await postJson(
        dataPlaneUrl(options.remoteUrl, "/v1/repos", options.repo, "branches", options.branch, "push", "commit"),
        commit,
        token
      );

      process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
    }
  );

try {
  await program.parseAsync();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown error";
  process.stderr.write(`error: ${redactCliError(message)}\n`);
  process.exitCode = 1;
}

function redactCliError(message: string): string {
  return message.replace(/=.*/gu, "=<redacted>");
}

function normalizeRemoteUrl(remoteUrl: string): string {
  const parsed = new URL(remoteUrl);
  parsed.pathname = parsed.pathname.replace(/\/+$/u, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/u, "");
}

function dataPlaneUrl(remoteUrl: string, ...parts: readonly string[]): string {
  const base = normalizeRemoteUrl(remoteUrl);
  const path = parts
    .map((part) => {
      if (part.startsWith("/")) {
        return part
          .split("/")
          .filter(Boolean)
          .map((segment) => encodeURIComponent(segment))
          .join("/");
      }
      return encodeURIComponent(part);
    })
    .join("/");
  return `${base}/${path}`;
}

function parseRequiredNullableCliValue(value: string): string | null {
  return value === "null" ? null : value;
}

function parseOptionalNullableCliValue(value: string | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  return parseRequiredNullableCliValue(value);
}

function parsePositiveInteger(value: string, optionName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${optionName} must be a positive integer`);
  }
  return parsed;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function readAuthToken(cliToken: string | undefined): string {
  const token = cliToken ?? process.env.WENVY_TOKEN;
  if (!token) {
    throw new Error("token is required; pass --token or set WENVY_TOKEN");
  }
  return token;
}

function authHeaders(token: string, headers: Record<string, string>): Record<string, string> {
  return {
    ...headers,
    authorization: `Bearer ${token}`
  };
}

async function postJson(url: string, body: unknown, token: string): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: authHeaders(token, {
      "content-type": "application/json"
    }),
    body: JSON.stringify(body)
  });
  return readJsonResponse(response);
}

async function putBytes(
  url: string,
  body: Uint8Array,
  headers: Record<string, string>,
  token: string
): Promise<unknown> {
  const response = await fetch(url, {
    method: "PUT",
    headers: authHeaders(token, headers),
    body: toArrayBuffer(body)
  });
  return readJsonResponse(response);
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  const payload = text.length > 0 ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : response.statusText;
    throw new Error(`request failed with ${response.status}: ${message}`);
  }
  return payload;
}

function readStringField(payload: unknown, field: string): string {
  if (!payload || typeof payload !== "object" || !(field in payload)) {
    throw new Error(`response is missing ${field}`);
  }
  const value = payload[field as keyof typeof payload];
  if (typeof value !== "string") {
    throw new Error(`response field ${field} must be a string`);
  }
  return value;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  return arrayBuffer;
}
