#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

interface CommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

interface WranglerConfig {
  readonly workers_dev?: boolean;
  readonly routes?: readonly WorkerRoute[];
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

interface WorkerRouteObject {
  readonly pattern: string;
  readonly zone_name?: string;
  readonly zone_id?: string;
  readonly custom_domain?: boolean;
}

type WorkerRoute = string | WorkerRouteObject;

interface PlannedCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly displayArgs?: readonly string[];
}

interface CfContextEntry {
  readonly value?: string | null;
  readonly name?: string | null;
}

interface CfContext {
  readonly accountId?: CfContextEntry;
  readonly zone?: CfContextEntry;
}

interface CfZone {
  readonly id: string;
  readonly name: string;
  readonly account?: {
    readonly id?: string;
    readonly name?: string;
  };
}

interface TargetZoneResult {
  readonly zone?: CfZone;
  readonly error?: string;
}

interface CloudflareEnvironment {
  readonly accountId?: string;
  readonly zoneId?: string;
}

interface ExistingCloudflareResources {
  readonly r2Buckets: ReadonlySet<string>;
  readonly queues: ReadonlySet<string>;
  readonly kvNamespaces: ReadonlySet<string>;
  readonly hyperdrives: ReadonlySet<string>;
  readonly warnings: readonly string[];
}

loadLocalEnvFile();

const configPath = process.env.WENVY_WRANGLER_CONFIG ?? "wrangler.jsonc";
const expectedZoneName = process.env.WENVY_CLOUDFLARE_ZONE_NAME ?? "wenvy.dev";
const expectedApiHostname = process.env.WENVY_API_HOSTNAME ?? `api.${expectedZoneName}`;
const apply = process.argv.includes("--apply");
const preflight = process.argv.includes("--preflight");

function main(): void {
  const config = loadWranglerConfig();
  const unresolved = findUnresolvedPlaceholders(config);
  const domainProblems = findDomainProblems(config);

  const context = run("cf", ["context", "show"]);
  if (context.status !== 0) {
    process.stderr.write(context.stderr);
    process.exit(1);
  }

  process.stdout.write("Cloudflare context from cf CLI:\n");
  process.stdout.write(`${context.stdout.trim()}\n\n`);
  const parsedContext = parseCloudflareContext(context.stdout);
  const targetZone = resolveTargetZone(expectedZoneName);
  printTargetZoneSummary(parsedContext, targetZone);
  const cloudflareEnvironment = buildCloudflareEnvironment(parsedContext, targetZone.zone);
  printCloudflareEnvironmentSummary(cloudflareEnvironment);
  printResourceSummary(config);

  const wranglerWhoami = run("pnpm", ["exec", "wrangler", "whoami"], cloudflareEnvironment);
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

  if (domainProblems.length > 0) {
    process.stdout.write("Domain binding issues:\n");
    for (const problem of domainProblems) {
      process.stdout.write(`- ${problem}\n`);
    }
    process.stdout.write("\n");
  }

  if (apply && unresolved.length > 0) {
    process.stdout.write("Refusing to apply until Wrangler placeholders are resolved.\n");
    process.exit(1);
  }

  if ((apply || preflight) && domainProblems.length > 0) {
    process.stdout.write("Refusing to continue until domain bindings are safe for wenvy.dev.\n");
    process.exit(1);
  }

  if ((apply || preflight) && !targetZone.zone) {
    process.stdout.write(`Refusing to continue until cf CLI can resolve the ${expectedZoneName} zone.\n`);
    process.exit(1);
  }

  const discoverExistingResources =
    (apply || preflight) &&
    wranglerAuthenticated &&
    unresolved.length === 0 &&
    domainProblems.length === 0 &&
    targetZone.zone !== undefined;
  const existingResources = discoverExistingResources
    ? discoverExistingCloudflareResources(config, cloudflareEnvironment)
    : undefined;

  if (existingResources && existingResources.warnings.length > 0) {
    process.stdout.write("Cloudflare resource discovery issues:\n");
    for (const warning of existingResources.warnings) {
      process.stdout.write(`- ${warning}\n`);
    }
    process.stdout.write("\n");
    if (apply || preflight) {
      process.stdout.write("Refusing to continue until existing resource discovery succeeds.\n");
      process.exit(1);
    }
  }

  const commands = plannedInitializationCommands(config, existingResources);

  if (!apply) {
    process.stdout.write("Planned initialization commands:\n");
    for (const command of commands) {
      process.stdout.write(`- ${command.command} ${(command.displayArgs ?? command.args).join(" ")}\n`);
    }
    process.stdout.write(
      "\nRun `pnpm cloudflare:init` to create missing Cloudflare resources and deploy after Wrangler auth and placeholder IDs are configured.\n"
    );
    if (preflight && (!wranglerAuthenticated || unresolved.length > 0)) {
      process.exit(1);
    }
    return;
  }

  if (!wranglerAuthenticated) {
    process.exit(1);
  }

  for (const command of commands) {
    const result = run(command.command, command.args, cloudflareEnvironment);
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

function plannedInitializationCommands(
  config: WranglerConfig,
  existingResources?: ExistingCloudflareResources
): readonly PlannedCommand[] {
  const r2Buckets = (config.r2_buckets ?? [])
    .map((bucket) => bucket.bucket_name)
    .filter((bucket) => !existingResources?.r2Buckets.has(bucket));
  const queues = Array.from(
    new Set([
      ...(config.queues?.producers ?? []).map((producer) => producer.queue),
      ...(config.queues?.consumers ?? []).map((consumer) => consumer.queue)
    ])
  ).filter((queue) => !existingResources?.queues.has(queue));
  const kvBindings = (config.kv_namespaces ?? [])
    .filter((namespace) => namespace.id.startsWith("replace-with-"))
    .filter((namespace) => !existingResources?.kvNamespaces.has(namespace.binding))
    .map((namespace) => namespace.binding);

  return [
    ...r2Buckets.map((bucket) =>
      plannedCommand("pnpm", ["exec", "wrangler", "r2", "bucket", "create", bucket])
    ),
    ...queues.map((queue) => plannedCommand("pnpm", ["exec", "wrangler", "queues", "create", queue])),
    ...kvBindings.map(
      (binding) => plannedCommand("pnpm", ["exec", "wrangler", "kv", "namespace", "create", binding])
    ),
    ...plannedHyperdriveCommands(config),
    plannedCommand("pnpm", ["exec", "wrangler", "deploy", "--dry-run", "--strict", "--config", configPath]),
    plannedCommand("pnpm", ["exec", "wrangler", "deploy", "--strict", "--config", configPath])
  ];
}

function discoverExistingCloudflareResources(
  config: WranglerConfig,
  cloudflareEnvironment: CloudflareEnvironment
): ExistingCloudflareResources {
  const warnings: string[] = [];
  const r2Buckets = discoverMatchingResources({
    label: "R2 buckets",
    command: ["exec", "wrangler", "r2", "bucket", "list"],
    expectedNames: (config.r2_buckets ?? []).map((bucket) => bucket.bucket_name),
    cloudflareEnvironment,
    warnings
  });
  const queues = discoverMatchingResources({
    label: "Queues",
    command: ["exec", "wrangler", "queues", "list"],
    expectedNames: Array.from(
      new Set([
        ...(config.queues?.producers ?? []).map((producer) => producer.queue),
        ...(config.queues?.consumers ?? []).map((consumer) => consumer.queue)
      ])
    ),
    cloudflareEnvironment,
    warnings
  });
  const kvNamespaces = discoverMatchingResources({
    label: "KV namespaces",
    command: ["exec", "wrangler", "kv", "namespace", "list"],
    expectedNames: (config.kv_namespaces ?? []).map((namespace) => namespace.binding),
    cloudflareEnvironment,
    warnings
  });
  const hyperdrives = discoverMatchingResources({
    label: "Hyperdrive configs",
    command: ["exec", "wrangler", "hyperdrive", "list"],
    expectedNames: Array.from(
      new Set(
        (config.hyperdrive ?? []).flatMap((hyperdrive) => [
          hyperdrive.id,
          hyperdriveName()
        ])
      )
    ),
    cloudflareEnvironment,
    warnings
  });

  return {
    r2Buckets,
    queues,
    kvNamespaces,
    hyperdrives,
    warnings
  };
}

function discoverMatchingResources(options: {
  readonly label: string;
  readonly command: readonly string[];
  readonly expectedNames: readonly string[];
  readonly cloudflareEnvironment: CloudflareEnvironment;
  readonly warnings: string[];
}): ReadonlySet<string> {
  if (options.expectedNames.length === 0) {
    return new Set<string>();
  }

  const result = run("pnpm", options.command, options.cloudflareEnvironment);
  if (result.status !== 0) {
    options.warnings.push(
      `${options.label} list failed: ${result.stderr.trim() || result.stdout.trim() || "unknown error"}`
    );
    return new Set<string>();
  }

  return new Set(options.expectedNames.filter((name) => outputContainsResourceName(result.stdout, name)));
}

function outputContainsResourceName(output: string, name: string): boolean {
  const escaped = escapeRegExp(name);
  return new RegExp(`(^|[^A-Za-z0-9_-])${escaped}([^A-Za-z0-9_-]|$)`, "u").test(output);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function printResourceSummary(config: WranglerConfig): void {
  process.stdout.write("Wrangler resource inventory:\n");
  if (config.workers_dev !== undefined) {
    process.stdout.write(`- workers.dev route: ${config.workers_dev ? "enabled" : "disabled"}\n`);
  }
  for (const route of config.routes ?? []) {
    if (typeof route === "string") {
      process.stdout.write(`- Worker route: ${route}\n`);
      continue;
    }
    const routeType = route.custom_domain ? "Worker custom domain" : "Worker route";
    process.stdout.write(`- ${routeType}: ${route.pattern}\n`);
  }
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

function findDomainProblems(config: WranglerConfig): readonly string[] {
  const routes = config.routes ?? [];
  const patterns = routes.map((route) => (typeof route === "string" ? route : route.pattern));
  const apiCustomDomain = routes.some(
    (route) => typeof route !== "string" && route.pattern === expectedApiHostname && route.custom_domain === true
  );
  const reservedLandingPatterns = new Set([
    expectedZoneName,
    `${expectedZoneName}/*`,
    `www.${expectedZoneName}`,
    `www.${expectedZoneName}/*`
  ]);
  const landingClaims = patterns.filter((pattern) => reservedLandingPatterns.has(pattern));
  const problems: string[] = [];

  if (config.workers_dev !== false) {
    problems.push("Set workers_dev to false so the production Worker is only published on its explicit domain.");
  }
  if (!apiCustomDomain) {
    problems.push(`Declare a Worker Custom Domain for ${expectedApiHostname}.`);
  }
  for (const pattern of landingClaims) {
    problems.push(`Do not bind the system Worker to ${pattern}; keep that hostname for the landing deployment.`);
  }

  return problems;
}

function parseCloudflareContext(stdout: string): CfContext | undefined {
  try {
    return JSON.parse(stdout) as CfContext;
  } catch {
    return undefined;
  }
}

function resolveTargetZone(zoneName: string): TargetZoneResult {
  const result = run("cf", ["zones", "list"]);
  if (result.status !== 0) {
    return { error: result.stderr.trim() || result.stdout.trim() || "cf zones list failed" };
  }

  try {
    const zones = JSON.parse(result.stdout) as readonly CfZone[];
    return { zone: zones.find((zone) => zone.name === zoneName) };
  } catch {
    return { error: "cf zones list returned non-JSON output" };
  }
}

function printTargetZoneSummary(context: CfContext | undefined, targetZone: TargetZoneResult): void {
  if (targetZone.zone) {
    process.stdout.write(
      `Cloudflare deployment target: ${targetZone.zone.name} (${targetZone.zone.id}) in account ${targetZone.zone.account?.id ?? "unknown"}.\n`
    );
  } else {
    process.stdout.write(
      `Cloudflare deployment target: ${expectedZoneName} was not found by cf zones list${targetZone.error ? ` (${targetZone.error})` : ""}.\n`
    );
  }

  const activeZoneName = context?.zone?.name;
  if (activeZoneName && activeZoneName !== expectedZoneName) {
    process.stdout.write(
      `Current cf zone context is ${activeZoneName}; run \`cf context set zone ${expectedZoneName} -p\` to align project defaults.\n`
    );
  }
  process.stdout.write("\n");
}

function buildCloudflareEnvironment(
  context: CfContext | undefined,
  targetZone: CfZone | undefined
): CloudflareEnvironment {
  return {
    accountId: targetZone?.account?.id ?? context?.accountId?.value ?? undefined,
    zoneId: targetZone?.id ?? (context?.zone?.name === expectedZoneName ? context.zone.value ?? undefined : undefined)
  };
}

function printCloudflareEnvironmentSummary(environment: CloudflareEnvironment): void {
  process.stdout.write("Wrangler deployment environment:\n");
  process.stdout.write(`- CLOUDFLARE_ACCOUNT_ID: ${environment.accountId ?? "not resolved"}\n`);
  process.stdout.write(`- CLOUDFLARE_ZONE_ID: ${environment.zoneId ?? "not resolved"}\n\n`);
}

function plannedHyperdriveCommands(config: WranglerConfig): readonly PlannedCommand[] {
  const connectionString = process.env.WENVY_POSTGRES_CONNECTION_STRING ?? process.env.DATABASE_URL;
  if (!connectionString) {
    return [];
  }

  return (config.hyperdrive ?? []).flatMap((hyperdrive) => {
    if (!hyperdrive.id.startsWith("replace-with-")) {
      return [];
    }

    const name = hyperdriveName();
    const args = [
      "exec",
      "wrangler",
      "hyperdrive",
      "create",
      name,
      "--binding",
      hyperdrive.binding,
      "--connection-string",
      connectionString,
      "--config",
      configPath
    ];
    const displayArgs = args.map((arg, index) => (args[index - 1] === "--connection-string" ? "<redacted>" : arg));
    return [plannedCommand("pnpm", args, displayArgs)];
  });
}

function hyperdriveName(): string {
  return process.env.WENVY_HYPERDRIVE_NAME ?? "wenvy-db-dev";
}

function plannedCommand(
  command: string,
  args: readonly string[],
  displayArgs: readonly string[] = args
): PlannedCommand {
  return { command, args, displayArgs };
}

function loadLocalEnvFile(): void {
  const envPath = process.env.WENVY_ENV_FILE ?? ".env";
  let contents: string;
  try {
    contents = readFileSync(envPath, "utf8");
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  for (const line of contents.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key) || process.env[key] !== undefined) {
      continue;
    }
    process.env[key] = parseEnvValue(trimmed.slice(separator + 1).trim());
  }
}

function parseEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  const commentStart = value.search(/\s#/u);
  return commentStart === -1 ? value : value.slice(0, commentStart).trimEnd();
}

function isWranglerAuthenticated(result: CommandResult): boolean {
  const output = `${result.stdout}\n${result.stderr}`.toLowerCase();
  if (result.status !== 0) {
    return false;
  }
  return !output.includes("not authenticated") && !output.includes("not logged in");
}

function run(command: string, args: readonly string[], cloudflareEnvironment?: CloudflareEnvironment): CommandResult {
  const result = spawnSync(command, [...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...(cloudflareEnvironment?.accountId ? { CLOUDFLARE_ACCOUNT_ID: cloudflareEnvironment.accountId } : {}),
      ...(cloudflareEnvironment?.zoneId ? { CLOUDFLARE_ZONE_ID: cloudflareEnvironment.zoneId } : {})
    },
    encoding: "utf8"
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

main();
