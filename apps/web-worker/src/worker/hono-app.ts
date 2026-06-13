import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  createSnapshotObjectKey,
  sha256Hex,
  verifyGithubWebhookSignature
} from "@wenvy/domain";
import type { WorkerEnv } from "./worker-env.js";

type AppBindings = {
  Bindings: WorkerEnv;
};

const consumeTokenSchema = z.object({
  token: z.string().min(16),
  browserFingerprintHash: z.string().min(16).optional(),
  ipAddress: z.string().optional()
});

const pushIntentSchema = z.object({
  expectedHead: z.string().min(1).nullable(),
  nextCommit: z.string().min(16),
  idempotencyKey: z.string().min(16)
});

const rotationSchema = z.object({
  rotationId: z.string().min(16),
  scopeType: z.enum(["team", "repo"]),
  scopeId: z.string().min(16)
});

export function createHonoApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get("/health", (context) =>
    context.json({
      ok: true,
      service: "wenvy",
      runtime: "cloudflare-workers"
    })
  );

  app.post("/v1/auth/magic-link/consume", async (context) => {
    const input = consumeTokenSchema.parse(await context.req.json());
    const tokenHash = await sha256Hex(input.token);
    const id = context.env.AUTH_TOKEN_COORDINATOR.idFromName(tokenHash);
    const stub = context.env.AUTH_TOKEN_COORDINATOR.get(id);

    const response = await stub.fetch("https://auth-token-coordinator/consume", {
      method: "POST",
      body: JSON.stringify({
        tokenHash,
        browserFingerprintHash: input.browserFingerprintHash,
        ipAddress: input.ipAddress ?? context.req.header("CF-Connecting-IP")
      })
    });

    return response;
  });

  app.post("/v1/repos/:repoId/branches/:branch/push/intent", async (context) => {
    const repoId = context.req.param("repoId");
    const branch = context.req.param("branch");
    const input = pushIntentSchema.parse(await context.req.json());
    const id = context.env.REPO_BRANCH_COORDINATOR.idFromName(`${repoId}:${branch}`);
    const stub = context.env.REPO_BRANCH_COORDINATOR.get(id);

    return stub.fetch("https://repo-branch-coordinator/write-intent", {
      method: "POST",
      body: JSON.stringify(input)
    });
  });

  app.put("/v1/blobs/:commitId", async (context) => {
    const commitId = context.req.param("commitId");
    const ciphertextSha256 = context.req.header("x-ciphertext-sha256");
    if (!ciphertextSha256) {
      throw new HTTPException(400, { message: "x-ciphertext-sha256 is required" });
    }

    const body = await context.req.arrayBuffer();
    const actualSha256 = await sha256BytesHex(body);
    if (actualSha256 !== ciphertextSha256) {
      throw new HTTPException(400, { message: "ciphertext SHA-256 mismatch" });
    }

    const objectKey = createSnapshotObjectKey({ commitId, ciphertextSha256 });
    await context.env.WENVY_BLOBS.put(objectKey, body, {
      httpMetadata: { contentType: "application/octet-stream" },
      customMetadata: {
        ciphertextSha256,
        commitId
      }
    });

    return context.json({ objectKey, ciphertextSha256 });
  });

  app.post("/v1/rotations", async (context) => {
    const input = rotationSchema.parse(await context.req.json());
    const instance = await context.env.KEY_ROTATION_WORKFLOW.create({
      id: input.rotationId,
      params: input
    });
    return context.json({ workflowInstanceId: instance.id });
  });

  app.post("/webhooks/github", async (context) => {
    const rawBody = await context.req.text();
    const secret = context.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      throw new HTTPException(500, { message: "GitHub webhook secret is not configured" });
    }

    const valid = await verifyGithubWebhookSignature({
      secret,
      rawBody,
      signatureHeader: context.req.header("X-Hub-Signature-256") ?? null
    });

    if (!valid) {
      throw new HTTPException(401, { message: "Invalid GitHub webhook signature" });
    }

    const deliveryId = context.req.header("X-GitHub-Delivery");
    const event = context.req.header("X-GitHub-Event");
    if (!deliveryId || !event) {
      throw new HTTPException(400, { message: "GitHub delivery and event headers are required" });
    }

    await context.env.GITHUB_SYNC_QUEUE.send({
      deliveryId,
      event,
      receivedAt: new Date().toISOString(),
      rawBody
    });

    return context.json({ queued: true, deliveryId });
  });

  app.notFound((context) => context.json({ error: "not-found" }, 404));

  app.onError((error, context) => {
    if (error instanceof HTTPException) {
      return error.getResponse();
    }
    return context.json({ error: "internal-error" }, 500);
  });

  return app;
}

async function sha256BytesHex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
