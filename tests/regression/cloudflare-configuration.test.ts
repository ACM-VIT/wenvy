import { readFile } from "node:fs/promises";
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
});
