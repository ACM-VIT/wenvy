import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface PackageJson {
  readonly scripts?: Record<string, string>;
}

interface WranglerConfig {
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
      "#!/bin/sh\nif [ \"$1\" = \"context\" ] && [ \"$2\" = \"show\" ]; then printf '%s\\n' '{\"files\":{\"projectConfig\":null}}'; exit 0; fi\nexit 66\n",
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
        WENVY_WRANGLER_CONFIG: configPath
      }
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Refusing to apply until Wrangler placeholders are resolved.");
    expect(result.stderr).not.toContain("MUTATION_OR_DEPLOY_COMMAND_ATTEMPTED");
  });
});
