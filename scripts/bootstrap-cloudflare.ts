#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

interface CommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

interface WranglerConfig {
  readonly r2_buckets?: readonly {
    readonly binding: string;
    readonly bucket_name: string;
  }[];
  readonly kv_namespaces?: readonly {
    readonly binding: string;
    readonly id: string;
  }[];
  readonly queues?: {
    readonly producers?: readonly {
      readonly binding: string;
      readonly queue: string;
    }[];
    readonly consumers?: readonly {
      readonly queue: string;
    }[];
  };
  readonly hyperdrive?: readonly {
    readonly binding: string;
    readonly id: string;
  }[];
  readonly workflows?: readonly {
    readonly binding: string;
    readonly name: string;
  }[];
  readonly triggers?: {
    readonly crons?: readonly string[];
  };
}

type PlannedCommand = readonly [command: string, args: readonly string[]];

const configPath = process.env.WENVY_WRANGLER_CONFIG ?? "wrangler.jsonc";
const apply = process.argv.includes("--apply");
const preflight = process.argv.includes("--preflight");

function main(): void {
  const config = loadWranglerConfig();
  const unresolved = findUnresolvedPlaceholders(config);
  const commands = plannedInitializationCommands(config);

  const context = run("cf", ["context", "show"]);
  if (context.status !== 0) {
    process.stderr.write(context.stderr);
    process.exit(1);
  }

  process.stdout.write("Cloudflare context from cf CLI:\n");
  process.stdout.write(`${context.stdout.trim()}\n\n`);
  printResourceSummary(config);

  const wranglerWhoami = run("pnpm", ["exec", "wrangler", "whoami"]);
  const wranglerAuthenticated = isWranglerAuthenticated(wranglerWhoami);
  if (!wranglerAuthenticated) {
    process.stdout.write(
      "Wrangler is not authenticated yet. Run `pnpm exec wrangler login` or provide CLOUDFLARE_API_TOKEN before applying initialization.\n\n"
    );
  }

  if (unresolved.length > 0) {
    process.stdout.write("Unresolved Wrangler placeholders:\n");
    for (const placeholder of unresolved) {
      process.stdout.write(`- ${placeholder}\n`);
    }
    process.stdout.write("\n");
  }

  if (apply && unresolved.length > 0) {
    process.stdout.write("Refusing to apply until Wrangler placeholders are resolved.\n");
    process.exit(1);
  }

  if (!apply) {
    process.stdout.write("Planned initialization commands:\n");
    for (const [command, args] of commands) {
      process.stdout.write(`- ${command} ${args.join(" ")}\n`);
    }
    process.stdout.write("\nRun `pnpm cloudflare:init` to apply after Wrangler auth and placeholder IDs are configured.\n");
    if (preflight && (!wranglerAuthenticated || unresolved.length > 0)) {
      process.exit(1);
    }
    return;
  }

  if (!wranglerAuthenticated) {
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

function loadWranglerConfig(): WranglerConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as WranglerConfig;
}

function plannedInitializationCommands(config: WranglerConfig): readonly PlannedCommand[] {
  const r2Buckets = (config.r2_buckets ?? []).map((bucket) => bucket.bucket_name);
  const queues = Array.from(
    new Set([
      ...(config.queues?.producers ?? []).map((producer) => producer.queue),
      ...(config.queues?.consumers ?? []).map((consumer) => consumer.queue)
    ])
  );
  const kvBindings = (config.kv_namespaces ?? []).map((namespace) => namespace.binding);

  return [
    ...r2Buckets.map((bucket) => ["pnpm", ["exec", "wrangler", "r2", "bucket", "create", bucket]] as const),
    ...queues.map((queue) => ["pnpm", ["exec", "wrangler", "queues", "create", queue]] as const),
    ...kvBindings.map(
      (binding) => ["pnpm", ["exec", "wrangler", "kv", "namespace", "create", binding]] as const
    ),
    ["pnpm", ["exec", "wrangler", "deploy", "--dry-run", "--strict", "--config", configPath]] as const
  ];
}

function printResourceSummary(config: WranglerConfig): void {
  process.stdout.write("Wrangler resource inventory:\n");
  for (const bucket of config.r2_buckets ?? []) {
    process.stdout.write(`- R2 ${bucket.binding}: ${bucket.bucket_name}\n`);
  }
  for (const queue of config.queues?.producers ?? []) {
    process.stdout.write(`- Queue producer ${queue.binding}: ${queue.queue}\n`);
  }
  for (const queue of config.queues?.consumers ?? []) {
    process.stdout.write(`- Queue consumer: ${queue.queue}\n`);
  }
  for (const namespace of config.kv_namespaces ?? []) {
    process.stdout.write(`- KV ${namespace.binding}: ${namespace.id}\n`);
  }
  for (const hyperdrive of config.hyperdrive ?? []) {
    process.stdout.write(`- Hyperdrive ${hyperdrive.binding}: ${hyperdrive.id}\n`);
  }
  for (const workflow of config.workflows ?? []) {
    process.stdout.write(`- Workflow ${workflow.binding}: ${workflow.name}\n`);
  }
  for (const cron of config.triggers?.crons ?? []) {
    process.stdout.write(`- Cron trigger: ${cron}\n`);
  }
  process.stdout.write("\n");
}

function findUnresolvedPlaceholders(value: unknown, path: string = configPath): readonly string[] {
  if (typeof value === "string") {
    return value.startsWith("replace-with-") ? [`${path}: ${value}`] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findUnresolvedPlaceholders(item, `${path}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => findUnresolvedPlaceholders(child, `${path}.${key}`));
  }
  return [];
}

function isWranglerAuthenticated(result: CommandResult): boolean {
  const output = `${result.stdout}\n${result.stderr}`.toLowerCase();
  if (result.status !== 0) {
    return false;
  }
  return !output.includes("not authenticated") && !output.includes("not logged in");
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
