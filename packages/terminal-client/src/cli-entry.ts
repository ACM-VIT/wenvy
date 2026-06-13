#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { Command } from "commander";
import type { PullRequest, PushCommitRequest, PushIntentRequest } from "@wenvy/contracts";
import {
  assertDataRole,
  canonicalizeEnvSnapshot,
  evaluateBranchAccess,
  type BranchOperation,
  type BranchPolicy
} from "@wenvy/domain";

const cliVersion = "0.1.3";
const defaultRemoteUrl = "https://api.wenvy.dev";
const dashboardUrl = "https://dash.wenvy.dev";
const landingUrl = "https://wenvy.dev";
const defaultBranch = "main";
const configDirectoryName = ".wenvy";
const configFileName = "config.json";
const envFileNames = [".env.local", ".env"] as const;

interface WenvyProjectConfig {
  readonly remoteUrl: string;
  readonly repo: string;
  readonly branch: string;
}

interface ConnectionOptions {
  readonly remoteUrl?: string;
  readonly repo?: string;
  readonly branch?: string;
  readonly token?: string;
}

const program = new Command()
  .name("wenvy")
  .description("TypeScript terminal client for Wenvy encrypted environment state")
  .version(cliVersion)
  .addHelpText(
    "after",
    `
Examples:
  $ wenvy init --repo repo_demo_01JY7X0WENVY
  $ wenvy doctor
  $ wenvy snapshot .env
  $ wenvy push snapshot.enc
  $ wenvy pull --output-file pulled.enc

Run "wenvy demo" for a step-by-step demo script.
`
  );

program
  .command("init")
  .description("Create a local .wenvy config for this project")
  .option("--remote-url <url>", "Worker API URL", defaultRemoteUrl)
  .option("--repo <repo>", "Wenvy repo ID")
  .option("--branch <branch>", "Default branch")
  .option("--force", "Overwrite an existing .wenvy/config.json")
  .action(
    async (options: {
      readonly remoteUrl: string;
      readonly repo?: string;
      readonly branch?: string;
      readonly force?: boolean;
    }) => {
      const detected = detectGitProjectDefaults();
      const config: WenvyProjectConfig = {
        remoteUrl: normalizeRemoteUrl(options.remoteUrl),
        repo: options.repo ?? detected.repo ?? "repo_demo_replace_me",
        branch: options.branch ?? detected.branch ?? defaultBranch
      };
      await writeProjectConfig(config, options.force === true);
      process.stdout.write(formatInitOutput(config, detected));
    }
  );

program
  .command("doctor")
  .description("Check local config, token, and Worker API reachability")
  .option("--remote-url <url>", "Worker API URL override")
  .option("--repo <repo>", "Repo ID override")
  .option("--branch <branch>", "Branch override")
  .option("--token <token>", "Bearer token override")
  .option("--skip-network", "Skip remote API health check")
  .action(async (options: ConnectionOptions & { readonly skipNetwork?: boolean }) => {
    const result = await runDoctor(options);
    process.stdout.write(result.output);
    if (!result.ok) {
      process.exitCode = 1;
    }
  });

program
  .command("demo")
  .description("Print a step-by-step Wenvy demo script")
  .action(async () => {
    process.stdout.write(await formatDemoOutput());
  });

program
  .command("snapshot")
  .argument("<env-file>")
  .description("Show canonical snapshot text and hash for a local env file")
  .action(async (envFile: string) => {
    const input = await readFile(envFile, "utf8");
    const snapshot = await canonicalizeEnvSnapshot(input);
    process.stdout.write("Wenvy snapshot\n\n");
    process.stdout.write("Canonical env:\n");
    process.stdout.write(snapshot.canonicalText);
    process.stdout.write("\n");
    process.stdout.write(`SHA-256: ${snapshot.sha256Hex}\n`);
    process.stdout.write("\nNext:\n");
    process.stdout.write("  Encrypt this canonical payload with your team key, then run:\n");
    process.stdout.write("  wenvy push snapshot.enc\n");
  });

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
  .option("--remote-url <url>")
  .option("--repo <repo>")
  .option("--branch <branch>")
  .option("--token <token>")
  .option("--known-head <id-or-null>")
  .option("--output-file <file>")
  .description("Pull latest encrypted snapshot metadata from the Worker data plane")
  .action(
    async (options: {
      readonly remoteUrl?: string;
      readonly repo?: string;
      readonly branch?: string;
      readonly token?: string;
      readonly knownHead?: string;
      readonly outputFile?: string;
    }) => {
      const connection = await resolveConnectionOptions(options);
      const body: PullRequest = {
        knownHead: parseOptionalNullableCliValue(options.knownHead)
      };
      const response = await postJson(
        dataPlaneUrl(connection.remoteUrl, "/v1/repos", connection.repo, "branches", connection.branch, "pull"),
        body,
        connection.token
      );
      if (options.outputFile) {
        const snapshot = readSnapshotFromPullResponse(response);
        if (snapshot) {
          const ciphertext = await getBytes(
            dataPlaneUrl(
              connection.remoteUrl,
              "/v1/repos",
              connection.repo,
              "branches",
              connection.branch,
              "blobs",
              snapshot.commit
            ),
            connection.token
          );
          const actualSha256 = sha256Hex(ciphertext);
          if (actualSha256 !== snapshot.ciphertextSha256 || ciphertext.byteLength !== snapshot.ciphertextSize) {
            throw new Error("downloaded ciphertext does not match pull metadata");
          }
          await writeFile(options.outputFile, ciphertext);
        }
      }
      process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
    }
  );

program
  .command("push")
  .argument("<ciphertext-file>")
  .description("Push an encrypted snapshot using .wenvy/config.json defaults")
  .option("--remote-url <url>")
  .option("--repo <repo>")
  .option("--branch <branch>")
  .option("--token <token>")
  .option("--expected-head <id-or-null>", "Expected branch head", "null")
  .option("--commit-id <id>", "Commit ID; generated when omitted")
  .option("--idempotency-key <id>", "Idempotency key; generated when omitted")
  .option("--parent-commit-id <id-or-null>")
  .option("--repo-key-version <number>", "Repo key version", "1")
  .option("--json", "Print raw JSON response")
  .action(
    async (
      ciphertextFile: string,
      options: ConnectionOptions & {
        readonly expectedHead: string;
        readonly commitId?: string;
        readonly idempotencyKey?: string;
        readonly parentCommitId?: string;
        readonly repoKeyVersion: string;
        readonly json?: boolean;
      }
    ) => {
      const connection = await resolveConnectionOptions(options);
      const commitId = options.commitId ?? generateOpaqueId("commit");
      const idempotencyKey = options.idempotencyKey ?? generateOpaqueId("idem");
      const response = await pushCiphertext({
        ...connection,
        ciphertextFile,
        expectedHead: options.expectedHead,
        commitId,
        idempotencyKey,
        repoKeyVersion: options.repoKeyVersion,
        ...(options.parentCommitId ? { parentCommitId: options.parentCommitId } : {})
      });

      if (options.json === true) {
        process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
        return;
      }

      const headCommit = readOptionalStringField(response, "headCommit") ?? commitId;
      process.stdout.write("Wenvy push complete\n\n");
      process.stdout.write(`Repo:   ${connection.repo}\n`);
      process.stdout.write(`Branch: ${connection.branch}\n`);
      process.stdout.write(`Commit: ${headCommit}\n`);
      process.stdout.write("\nNext:\n");
      process.stdout.write("  wenvy pull --output-file pulled.enc\n");
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
      const response = await pushCiphertext({
        remoteUrl: options.remoteUrl,
        repo: options.repo,
        branch: options.branch,
        token: readAuthToken(options.token),
        ciphertextFile: options.ciphertextFile,
        expectedHead: options.expectedHead,
        commitId: options.commitId,
        idempotencyKey: options.idempotencyKey,
        repoKeyVersion: options.repoKeyVersion,
        ...(options.parentCommitId ? { parentCommitId: options.parentCommitId } : {})
      });
      process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
    }
  );

try {
  if (process.argv.length <= 2) {
    process.stdout.write(formatBanner());
  } else {
    await program.parseAsync();
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown error";
  process.stderr.write(`error: ${redactCliError(message)}\n`);
  process.exitCode = 1;
}

function formatBanner(): string {
  return [
    "",
    "wenvy",
    "TypeScript encrypted environment state on Cloudflare.",
    "",
    "  $ wenvy init --repo <repo-id>      Create .wenvy/config.json",
    "  $ wenvy doctor                     Check config, token, and API health",
    "  $ wenvy snapshot .env              Canonicalize and hash a local env file",
    "  $ wenvy push snapshot.enc          Push encrypted snapshot bytes",
    "  $ wenvy pull --output-file out.enc Pull encrypted snapshot bytes",
    "",
    `Dashboard: ${dashboardUrl}`,
    "Try: wenvy demo",
    ""
  ].join("\n");
}

interface DetectedGitProjectDefaults {
  readonly repo?: string;
  readonly branch?: string;
  readonly remote?: string;
}

function formatInitOutput(config: WenvyProjectConfig, detected: DetectedGitProjectDefaults = {}): string {
  const repoLine =
    config.repo === "repo_demo_replace_me"
      ? "  1. Edit .wenvy/config.json and replace repo_demo_replace_me"
      : "  1. Add your demo token to .env";
  const tokenLine =
    config.repo === "repo_demo_replace_me"
      ? "  2. Add your demo token to .env: WENVY_TOKEN=<token>"
      : "     WENVY_TOKEN=<token>";
  const doctorLine = config.repo === "repo_demo_replace_me" ? "  3. Run: wenvy doctor" : "  2. Run: wenvy doctor";
  const demoLine = config.repo === "repo_demo_replace_me" ? "  4. Run: wenvy demo" : "  3. Run: wenvy demo";

  const lines = [
    "Initialized Wenvy project",
    "",
    "Created:",
    "  .wenvy/config.json",
    "  .wenvy/.gitignore",
    "",
    "Config:",
    `  remoteUrl: ${config.remoteUrl}`,
    `  repo:      ${config.repo}`,
    `  branch:    ${config.branch}`,
    ""
  ];

  if (detected.repo || detected.branch || detected.remote) {
    lines.push("Detected:");
    if (detected.remote) {
      lines.push(`  git remote: ${detected.remote}`);
    }
    if (detected.repo) {
      lines.push(`  repo id:    ${detected.repo}`);
    }
    if (detected.branch) {
      lines.push(`  branch:     ${detected.branch}`);
    }
    lines.push("");
  }

  lines.push(
    "Next steps:",
    repoLine,
    tokenLine,
    doctorLine,
    demoLine,
    ""
  );
  return lines.join("\n");
}

function detectGitProjectDefaults(): DetectedGitProjectDefaults {
  const root = runGit(["rev-parse", "--show-toplevel"]);
  if (!root) {
    return {};
  }
  const remote = runGit(["remote", "get-url", "origin"]);
  const branch = runGit(["branch", "--show-current"]);
  return {
    repo: deriveRepoIdFromRemote(remote) ?? deriveRepoIdFromDirectory(root),
    ...(branch ? { branch } : {}),
    ...(remote ? { remote } : {})
  };
}

function runGit(args: readonly string[]): string | undefined {
  const result = spawnSync("git", [...args], {
    cwd: projectRoot(),
    encoding: "utf8"
  });
  if (result.status !== 0) {
    return undefined;
  }
  const output = result.stdout.trim();
  return output.length > 0 ? output : undefined;
}

function deriveRepoIdFromRemote(remote: string | undefined): string | undefined {
  if (!remote) {
    return undefined;
  }

  const cleaned = remote.replace(/\.git$/u, "");
  const sshMatch = cleaned.match(/^[^@]+@[^:]+:(?<owner>[^/]+)\/(?<repo>[^/]+)$/u);
  if (sshMatch?.groups) {
    const owner = sshMatch.groups.owner;
    const repo = sshMatch.groups.repo;
    if (owner && repo) {
      return formatGitRepoId(owner, repo);
    }
  }

  try {
    const parsed = new URL(cleaned);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const repo = segments.at(-1);
    const owner = segments.at(-2);
    if (owner && repo) {
      return formatGitRepoId(owner, repo);
    }
  } catch {
    const segments = cleaned.split("/").filter(Boolean);
    const repo = segments.at(-1);
    const owner = segments.at(-2);
    if (owner && repo) {
      return formatGitRepoId(owner, repo);
    }
  }

  return undefined;
}

function deriveRepoIdFromDirectory(root: string): string {
  return `git_${sanitizeRepoIdSegment(basename(root))}`;
}

function formatGitRepoId(owner: string, repo: string): string {
  return `git_${sanitizeRepoIdSegment(owner)}_${sanitizeRepoIdSegment(repo)}`;
}

function sanitizeRepoIdSegment(value: string): string {
  const sanitized = value
    .trim()
    .replace(/\.git$/u, "")
    .replace(/[^A-Za-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return sanitized || "repo";
}

async function formatDemoOutput(): Promise<string> {
  const config = await readProjectConfig();
  const repo = config?.repo && config.repo !== "repo_demo_replace_me" ? config.repo : "<repo-id>";
  const branch = config?.branch ?? defaultBranch;
  const remoteUrl = config?.remoteUrl ?? defaultRemoteUrl;
  return [
    "Wenvy demo path",
    "",
    "1. Install the CLI",
    "   npm install -g wenvy",
    "",
    "2. Initialize project defaults",
    `   wenvy init --repo ${repo} --branch ${branch}`,
    "",
    "3. Add your demo token to the project .env",
    "   WENVY_TOKEN=<token>",
    "",
    "4. Verify local config and the live Worker",
    "   wenvy doctor",
    "",
    "5. Show local env canonicalization",
    "   printf 'B=two\\nA=one\\n' > demo.env",
    "   wenvy snapshot demo.env",
    "",
    "6. Push encrypted snapshot bytes",
    "   printf 'sealed-demo-bytes' > snapshot.enc",
    "   wenvy push snapshot.enc",
    "",
    "7. Pull the latest encrypted snapshot",
    "   wenvy pull --output-file pulled.enc",
    "",
    "Live endpoints:",
    `   ${remoteUrl}/health`,
    `   ${remoteUrl}/openapi.json`,
    `   ${dashboardUrl}`,
    `   ${landingUrl}`,
    ""
  ].join("\n");
}

async function writeProjectConfig(config: WenvyProjectConfig, force: boolean): Promise<void> {
  const directory = configDirectoryPath();
  const path = projectConfigPath();
  if (!force && (await fileExists(path))) {
    throw new Error(".wenvy/config.json already exists; rerun with --force to overwrite it");
  }
  await mkdir(directory, { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await writeFile(join(directory, ".gitignore"), ["cache/", "snapshots/", "*.local.json", "*.token", ""].join("\n"), "utf8");
}

async function runDoctor(options: ConnectionOptions & { readonly skipNetwork?: boolean }): Promise<{
  readonly ok: boolean;
  readonly output: string;
}> {
  const lines = ["Wenvy doctor", ""];
  let ok = true;
  const config = await readProjectConfig();
  const detected = detectGitProjectDefaults();
  const token = readOptionalAuthToken(options.token);

  if (config) {
    lines.push(`[ok] config found: ${projectConfigPath()}`);
  } else {
    ok = false;
    lines.push("[fail] config missing: run wenvy init --repo <repo-id>");
  }

  const remoteUrl = normalizeRemoteUrl(options.remoteUrl ?? config?.remoteUrl ?? defaultRemoteUrl);
  const repo = resolveRepoOption(options.repo, config, detected);
  const branch = options.branch ?? config?.branch ?? detected.branch ?? defaultBranch;

  if (repo && repo !== "repo_demo_replace_me") {
    const source = config?.repo === "repo_demo_replace_me" && detected.repo === repo ? "detected from git" : "configured";
    lines.push(`[ok] repo: ${repo} (${source})`);
  } else {
    ok = false;
    lines.push("[fail] repo missing: run this inside a git repo, or pass --repo <repo-id>");
  }
  lines.push(`[ok] branch: ${branch}`);

  if (token) {
    lines.push("[ok] token: found");
  } else {
    ok = false;
    lines.push("[fail] token missing: add WENVY_TOKEN=<token> to .env");
  }

  if (options.skipNetwork === true) {
    lines.push("[skip] remote health: skipped by --skip-network");
  } else {
    const health = await fetchHealth(remoteUrl);
    if (health.ok) {
      lines.push(`[ok] remote health: ${remoteUrl}/health`);
    } else {
      ok = false;
      lines.push(`[fail] remote health: ${health.reason}`);
    }
  }

  lines.push("");
  lines.push(ok ? "Ready." : "Not ready yet. Fix the failed checks above, then rerun wenvy doctor.");
  lines.push("");
  return { ok, output: lines.join("\n") };
}

async function fetchHealth(remoteUrl: string): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> {
  try {
    const response = await fetch(`${remoteUrl}/health`);
    if (!response.ok) {
      return { ok: false, reason: `${remoteUrl}/health returned HTTP ${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "unknown network error" };
  }
}

async function resolveConnectionOptions(options: ConnectionOptions): Promise<{
  readonly remoteUrl: string;
  readonly repo: string;
  readonly branch: string;
  readonly token: string;
}> {
  const config = await readProjectConfig();
  const detected = detectGitProjectDefaults();
  const remoteUrl = normalizeRemoteUrl(options.remoteUrl ?? config?.remoteUrl ?? defaultRemoteUrl);
  const repo = resolveRepoOption(options.repo, config, detected);
  const branch = options.branch ?? config?.branch ?? detected.branch ?? defaultBranch;

  if (!repo || repo === "repo_demo_replace_me") {
    throw new Error("repo is required; run wenvy init --repo <repo-id> or pass --repo");
  }

  return {
    remoteUrl,
    repo,
    branch,
    token: readAuthToken(options.token)
  };
}

function resolveRepoOption(
  repoOverride: string | undefined,
  config: WenvyProjectConfig | undefined,
  detected: DetectedGitProjectDefaults
): string | undefined {
  if (repoOverride) {
    return repoOverride;
  }
  if (config?.repo && config.repo !== "repo_demo_replace_me") {
    return config.repo;
  }
  return detected.repo;
}

async function readProjectConfig(): Promise<WenvyProjectConfig | undefined> {
  const path = projectConfigPath();
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }

  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error(".wenvy/config.json must contain an object");
  }
  const record = parsed as Record<string, unknown>;
  const remoteUrl = record.remoteUrl;
  const repo = record.repo;
  const branch = record.branch;
  if (typeof remoteUrl !== "string" || typeof repo !== "string" || typeof branch !== "string") {
    throw new Error(".wenvy/config.json must include remoteUrl, repo, and branch strings");
  }
  return { remoteUrl, repo, branch };
}

function projectRoot(): string {
  return process.env.WENVY_PROJECT_DIR ?? process.cwd();
}

function configDirectoryPath(): string {
  return join(projectRoot(), configDirectoryName);
}

function projectConfigPath(): string {
  return join(configDirectoryPath(), configFileName);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function generateOpaqueId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

interface PushCiphertextInput {
  readonly remoteUrl: string;
  readonly repo: string;
  readonly branch: string;
  readonly ciphertextFile: string;
  readonly expectedHead: string;
  readonly commitId: string;
  readonly idempotencyKey: string;
  readonly repoKeyVersion: string;
  readonly token: string;
  readonly parentCommitId?: string;
}

async function pushCiphertext(input: PushCiphertextInput): Promise<unknown> {
  const ciphertext = await readFile(input.ciphertextFile);
  const ciphertextSha256 = sha256Hex(ciphertext);
  const expectedHead = parseRequiredNullableCliValue(input.expectedHead);
  const parentCommitId = parseOptionalNullableCliValue(input.parentCommitId) ?? expectedHead;
  const repoKeyVersion = parsePositiveInteger(input.repoKeyVersion, "repo-key-version");

  const intent: PushIntentRequest = {
    expectedHead,
    nextCommit: input.commitId,
    idempotencyKey: input.idempotencyKey,
    payloadFingerprint: ciphertextSha256
  };
  await postJson(
    dataPlaneUrl(input.remoteUrl, "/v1/repos", input.repo, "branches", input.branch, "push", "intent"),
    intent,
    input.token
  );

  const blobResponse = await putBytes(
    dataPlaneUrl(input.remoteUrl, "/v1/blobs", input.commitId),
    ciphertext,
    {
      "content-type": "application/octet-stream",
      "x-ciphertext-sha256": ciphertextSha256,
      "x-wenvy-repo-id": input.repo,
      "x-wenvy-branch": input.branch
    },
    input.token
  );
  const objectKey = readStringField(blobResponse, "objectKey");

  const commit: PushCommitRequest = {
    expectedHead,
    commitId: input.commitId,
    parentCommitId,
    idempotencyKey: input.idempotencyKey,
    payloadFingerprint: ciphertextSha256,
    objectKey,
    ciphertextSha256,
    ciphertextSize: ciphertext.byteLength,
    repoKeyVersion
  };
  return await postJson(
    dataPlaneUrl(input.remoteUrl, "/v1/repos", input.repo, "branches", input.branch, "push", "commit"),
    commit,
    input.token
  );
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
  const token = readOptionalAuthToken(cliToken);
  if (!token) {
    throw new Error("token is required; pass --token, set WENVY_TOKEN, or add WENVY_TOKEN=<token> to .env");
  }
  return token;
}

function readOptionalAuthToken(cliToken: string | undefined): string | undefined {
  return firstNonEmpty(cliToken, process.env.WENVY_TOKEN, readProjectEnvValue("WENVY_TOKEN"));
}

function firstNonEmpty(...values: readonly (string | undefined)[]): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return undefined;
}

function readProjectEnvValue(name: string): string | undefined {
  for (const fileName of envFileNames) {
    const value = readEnvValue(join(projectRoot(), fileName), name);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function readEnvValue(path: string, name: string): string | undefined {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }

  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const normalized = line.startsWith("export ") ? line.slice("export ".length).trimStart() : line;
    const equalsIndex = normalized.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }
    const key = normalized.slice(0, equalsIndex).trim();
    if (key !== name) {
      continue;
    }
    return parseEnvValue(normalized.slice(equalsIndex + 1).trim());
  }
  return undefined;
}

function parseEnvValue(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  const commentIndex = value.search(/\s#/u);
  return (commentIndex >= 0 ? value.slice(0, commentIndex) : value).trim();
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

function readOptionalStringField(payload: unknown, field: string): string | undefined {
  if (!payload || typeof payload !== "object" || !(field in payload)) {
    return undefined;
  }
  const value = payload[field as keyof typeof payload];
  return typeof value === "string" ? value : undefined;
}

interface PullSnapshot {
  readonly commit: string;
  readonly ciphertextSha256: string;
  readonly ciphertextSize: number;
}

function readSnapshotFromPullResponse(payload: unknown): PullSnapshot | null {
  if (!payload || typeof payload !== "object" || !("snapshot" in payload)) {
    throw new Error("pull response is missing snapshot");
  }
  const snapshot = payload.snapshot;
  if (snapshot === null) {
    return null;
  }
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("pull response snapshot must be an object or null");
  }
  const commit = snapshot["commit" as keyof typeof snapshot];
  const ciphertextSha256 = snapshot["ciphertextSha256" as keyof typeof snapshot];
  const ciphertextSize = snapshot["ciphertextSize" as keyof typeof snapshot];
  if (typeof commit !== "string" || typeof ciphertextSha256 !== "string" || typeof ciphertextSize !== "number") {
    throw new Error("pull response snapshot is missing download metadata");
  }
  return {
    commit,
    ciphertextSha256,
    ciphertextSize
  };
}

async function getBytes(url: string, token: string): Promise<Uint8Array> {
  const response = await fetch(url, {
    method: "GET",
    headers: authHeaders(token, {})
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`request failed with ${response.status}: ${redactCliError(text || response.statusText)}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  return arrayBuffer;
}
