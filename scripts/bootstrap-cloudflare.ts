#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";

interface CommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

const apply = process.argv.includes("--apply");

const resources = {
  r2Buckets: ["wenvy-blobs-dev", "wenvy-logs-dev"],
  queues: ["wenvy-github-sync-dev", "wenvy-audit-dev", "wenvy-envelope-check-dev"],
  kvNamespaces: ["WENVY_CONFIG_CACHE"]
} as const;

function main(): void {
  const context = run("cf", ["context", "show"]);
  if (context.status !== 0) {
    process.stderr.write(context.stderr);
    process.exit(1);
  }

  process.stdout.write("Cloudflare context from cf CLI:\n");
  process.stdout.write(`${context.stdout.trim()}\n\n`);

  const wranglerWhoami = run("pnpm", ["exec", "wrangler", "whoami"]);
  if (wranglerWhoami.status !== 0) {
    process.stdout.write(
      "Wrangler is not authenticated yet. Run `pnpm exec wrangler login` or provide CLOUDFLARE_API_TOKEN before `pnpm cloudflare:init`.\n\n"
    );
  }

  const commands = [
    ...resources.r2Buckets.map((bucket) => ["pnpm", ["exec", "wrangler", "r2", "bucket", "create", bucket]] as const),
    ...resources.queues.map((queue) => ["pnpm", ["exec", "wrangler", "queues", "create", queue]] as const),
    ...resources.kvNamespaces.map(
      (namespace) => ["pnpm", ["exec", "wrangler", "kv", "namespace", "create", namespace]] as const
    ),
    ["pnpm", ["exec", "wrangler", "deploy", "--dry-run", "--config", "wrangler.jsonc"]] as const
  ];

  if (!apply) {
    process.stdout.write("Planned initialization commands:\n");
    for (const [command, args] of commands) {
      process.stdout.write(`- ${command} ${args.join(" ")}\n`);
    }
    process.stdout.write("\nRun `pnpm cloudflare:init` to apply after Wrangler auth is configured.\n");
    return;
  }

  if (wranglerWhoami.status !== 0) {
    process.exit(1);
  }

  for (const [command, args] of commands) {
    const result = run(command, args);
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
}

function run(command: string, args: readonly string[]): CommandResult {
  const result = spawnSync(command, [...args], {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

main();
