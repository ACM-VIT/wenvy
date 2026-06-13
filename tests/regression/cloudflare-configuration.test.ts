import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface PackageJson {
  readonly scripts?: Record<string, string>;
}

interface WranglerConfig {
  readonly workers_dev?: boolean;
  readonly routes?: readonly WorkerRoute[];
  readonly queues?: {
    readonly producers?: readonly {
      readonly queue: string;
    }[];
    readonly consumers?: readonly {
      readonly queue: string;
    }[];
  };
  readonly triggers?: {
    readonly crons?: readonly string[];
  };
}

type WorkerRoute =
  | string
  | {
      readonly pattern: string;
      readonly custom_domain?: boolean;
      readonly zone_name?: string;
      readonly zone_id?: string;
    };

describe("Cloudflare configuration regression", () => {
  it("uses --config when package scripts call wrangler from the Worker package", async () => {
    const packageJson = JSON.parse(
      await readFile("apps/web-worker/package.json", "utf8")
    ) as PackageJson;

    expect(packageJson.scripts?.dev).toBe("wrangler dev --config ../../wrangler.jsonc");
    expect(packageJson.scripts?.deploy).toBe("wrangler deploy --config ../../wrangler.jsonc");
    expect(packageJson.scripts?.deploy).not.toContain("deploy ../../wrangler.jsonc");
  });

  it("declares a cron trigger for the scheduled Worker handler", async () => {
    const config = JSON.parse(await readFile("wrangler.jsonc", "utf8")) as WranglerConfig;

    expect(config.triggers?.crons).toEqual(["0 */6 * * *"]);
  });

  it("publishes the system Worker only on the api.wenvy.dev custom domain", async () => {
    const config = JSON.parse(await readFile("wrangler.jsonc", "utf8")) as WranglerConfig;
    const routePatterns = (config.routes ?? []).map((route) => (typeof route === "string" ? route : route.pattern));

    expect(config.workers_dev).toBe(false);
    expect(config.routes).toContainEqual({
      pattern: "api.wenvy.dev",
      custom_domain: true
    });
    expect(routePatterns).not.toContain("wenvy.dev");
    expect(routePatterns).not.toContain("wenvy.dev/*");
    expect(routePatterns).not.toContain("www.wenvy.dev");
    expect(routePatterns).not.toContain("www.wenvy.dev/*");
  });

  it("keeps queue producers and consumers pointing at the same named queues", async () => {
    const config = JSON.parse(await readFile("wrangler.jsonc", "utf8")) as WranglerConfig;
    const producerQueues = new Set((config.queues?.producers ?? []).map((producer) => producer.queue));
    const consumerQueues = new Set((config.queues?.consumers ?? []).map((consumer) => consumer.queue));

    expect(consumerQueues).toEqual(producerQueues);
  });

  it("refuses apply before mutation commands when Wrangler placeholders are unresolved", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wenvy-cloudflare-"));
    const binDir = join(dir, "bin");
    const configPath = join(dir, "wrangler.json");
    await mkdir(binDir, { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify({
        r2_buckets: [{ binding: "WENVY_BLOBS", bucket_name: "wenvy-blobs-test" }],
        kv_namespaces: [{ binding: "WENVY_CONFIG_CACHE", id: "replace-with-test-kv-id" }],
        queues: {
          producers: [{ binding: "AUDIT_QUEUE", queue: "wenvy-audit-test" }],
          consumers: [{ queue: "wenvy-audit-test" }]
        },
        hyperdrive: [{ binding: "WENVY_DB", id: "replace-with-test-hyperdrive-id" }]
      }),
      "utf8"
    );
    await writeFile(
      join(binDir, "cf"),
      "#!/bin/sh\nif [ \"$1\" = \"context\" ] && [ \"$2\" = \"show\" ]; then printf '%s\\n' '{\"files\":{\"projectConfig\":null}}'; exit 0; fi\nif [ \"$1\" = \"zones\" ] && [ \"$2\" = \"list\" ]; then printf '%s\\n' '[{\"id\":\"zone-wenvy\",\"name\":\"wenvy.dev\",\"account\":{\"id\":\"account-1\"}}]'; exit 0; fi\nexit 66\n",
      "utf8"
    );
    await writeFile(
      join(binDir, "pnpm"),
      "#!/bin/sh\nif [ \"$1\" = \"exec\" ] && [ \"$2\" = \"wrangler\" ] && [ \"$3\" = \"whoami\" ]; then printf '%s\\n' 'logged in as stub@example.test'; exit 0; fi\nprintf 'MUTATION_OR_DEPLOY_COMMAND_ATTEMPTED: %s\\n' \"$*\" >&2\nexit 77\n",
      "utf8"
    );
    await chmod(join(binDir, "cf"), 0o755);
    await chmod(join(binDir, "pnpm"), 0o755);

    const result = spawnSync("node_modules/.bin/tsx", ["scripts/bootstrap-cloudflare.ts", "--apply"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
        WENVY_WRANGLER_CONFIG: configPath,
        WENVY_ENV_FILE: join(dir, "missing.env")
      }
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Refusing to apply until Wrangler placeholders are resolved.");
    expect(result.stderr).not.toContain("MUTATION_OR_DEPLOY_COMMAND_ATTEMPTED");
  });

  it("reports the wenvy.dev target zone and context mismatch in the bootstrap plan", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wenvy-cloudflare-"));
    const binDir = join(dir, "bin");
    const configPath = join(dir, "wrangler.json");
    await mkdir(binDir, { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify({
        workers_dev: false,
        routes: [{ pattern: "api.wenvy.dev", custom_domain: true }]
      }),
      "utf8"
    );
    await writeFile(
      join(binDir, "cf"),
      "#!/bin/sh\nif [ \"$1\" = \"context\" ] && [ \"$2\" = \"show\" ]; then printf '%s\\n' '{\"accountId\":{\"value\":\"account-1\",\"name\":\"Account\"},\"zone\":{\"value\":\"zone-acmvit\",\"name\":\"acmvit.in\"}}'; exit 0; fi\nif [ \"$1\" = \"zones\" ] && [ \"$2\" = \"list\" ]; then printf '%s\\n' '[{\"id\":\"zone-wenvy\",\"name\":\"wenvy.dev\",\"account\":{\"id\":\"account-1\"}}]'; exit 0; fi\nexit 66\n",
      "utf8"
    );
    await writeFile(
      join(binDir, "pnpm"),
      "#!/bin/sh\nif [ \"$1\" = \"exec\" ] && [ \"$2\" = \"wrangler\" ] && [ \"$3\" = \"whoami\" ]; then printf '%s\\n' 'logged in as stub@example.test'; exit 0; fi\nexit 0\n",
      "utf8"
    );
    await chmod(join(binDir, "cf"), 0o755);
    await chmod(join(binDir, "pnpm"), 0o755);

    const result = spawnSync("node_modules/.bin/tsx", ["scripts/bootstrap-cloudflare.ts"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
        WENVY_WRANGLER_CONFIG: configPath,
        WENVY_ENV_FILE: join(dir, "missing.env")
      }
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Cloudflare deployment target: wenvy.dev (zone-wenvy) in account account-1.");
    expect(result.stdout).toContain(
      "Current cf zone context is acmvit.in; run `cf context set zone wenvy.dev -p` to align project defaults."
    );
    expect(result.stdout).toContain("Worker custom domain: api.wenvy.dev");
    expect(result.stdout).toContain("CLOUDFLARE_ZONE_ID: zone-wenvy");
  });

  it("loads DATABASE_URL from .env for Hyperdrive creation without printing the secret", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wenvy-cloudflare-"));
    const binDir = join(dir, "bin");
    const configPath = join(dir, "wrangler.json");
    const envPath = join(dir, ".env");
    const databaseUrl = "postgres://user:super-secret-password@example.com:5432/wenvy";
    await mkdir(binDir, { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify({
        workers_dev: false,
        routes: [{ pattern: "api.wenvy.dev", custom_domain: true }],
        hyperdrive: [{ binding: "WENVY_DB", id: "replace-with-test-hyperdrive-id" }]
      }),
      "utf8"
    );
    await writeFile(envPath, `DATABASE_URL=${databaseUrl}\n`, "utf8");
    await writeFile(
      join(binDir, "cf"),
      "#!/bin/sh\nif [ \"$1\" = \"context\" ] && [ \"$2\" = \"show\" ]; then printf '%s\\n' '{\"accountId\":{\"value\":\"account-1\",\"name\":\"Account\"},\"zone\":{\"value\":\"zone-wenvy\",\"name\":\"wenvy.dev\"}}'; exit 0; fi\nif [ \"$1\" = \"zones\" ] && [ \"$2\" = \"list\" ]; then printf '%s\\n' '[{\"id\":\"zone-wenvy\",\"name\":\"wenvy.dev\",\"account\":{\"id\":\"account-1\"}}]'; exit 0; fi\nexit 66\n",
      "utf8"
    );
    await writeFile(
      join(binDir, "pnpm"),
      "#!/bin/sh\nif [ \"$1\" = \"exec\" ] && [ \"$2\" = \"wrangler\" ] && [ \"$3\" = \"whoami\" ]; then printf '%s\\n' 'logged in as stub@example.test'; exit 0; fi\nexit 0\n",
      "utf8"
    );
    await chmod(join(binDir, "cf"), 0o755);
    await chmod(join(binDir, "pnpm"), 0o755);
    const {
      DATABASE_URL: _databaseUrl,
      WENVY_POSTGRES_CONNECTION_STRING: _connectionString,
      ...baseEnv
    } = process.env;

    const result = spawnSync("node_modules/.bin/tsx", ["scripts/bootstrap-cloudflare.ts"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...baseEnv,
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
        WENVY_WRANGLER_CONFIG: configPath,
        WENVY_ENV_FILE: envPath
      }
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("pnpm exec wrangler hyperdrive create wenvy-db-dev");
    expect(result.stdout).toContain("--connection-string <redacted>");
    expect(result.stdout).not.toContain(databaseUrl);
    expect(result.stdout).not.toContain("super-secret-password");
  });
});
