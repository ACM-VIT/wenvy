import { Hono } from "hono";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";
import {
  consumeTokenRequestSchema,
  envelopeValidationRequestSchema,
  openApiDocument,
  pullRequestSchema,
  pushCommitRequestSchema,
  pushIntentRequestSchema,
  rotationRequestSchema,
  serviceAccountAuthorizeRequestSchema
} from "@wenvy/contracts";
import {
  authorizeServiceAccount,
  createSnapshotObjectKey,
  sha256Hex,
  type ServiceAccountOperation,
  validateEnvelopePayload,
  verifyGithubWebhookSignature
} from "@wenvy/domain";
import {
  createServiceAccountTokenRepository,
  type ServiceAccountTokenRecord,
  type ServiceAccountTokenRepository
} from "./persistence/postgres/service-account-token-repository.js";
import type { WorkerEnv } from "./worker-env.js";

type AppBindings = {
  Bindings: WorkerEnv;
};

type AppContext = Context<AppBindings>;

interface HonoAppOptions {
  readonly serviceAccountTokenRepository?: ServiceAccountTokenRepository;
}

interface AuthorizedServiceAccount {
  readonly tokenId: string;
  readonly serviceAccountId: string;
  readonly organizationId: string | null;
}

export function createHonoApp(options: HonoAppOptions = {}): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get("/health", (context) =>
    context.json({
      ok: true,
      service: "wenvy",
      runtime: "cloudflare-workers"
    })
  );

  app.get("/openapi.json", (context) => context.json(openApiDocument));

  app.post("/v1/auth/magic-link/consume", async (context) => {
    const input = consumeTokenRequestSchema.parse(await context.req.json());
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
    await requireServiceAccountAuthorization(context, options, {
      repoId,
      branch,
      operation: "push",
      action: "branch.push.intent"
    });
    const input = pushIntentRequestSchema.parse(await context.req.json());
    const id = context.env.REPO_BRANCH_COORDINATOR.idFromName(`${repoId}:${branch}`);
    const stub = context.env.REPO_BRANCH_COORDINATOR.get(id);

    return stub.fetch("https://repo-branch-coordinator/write-intent", {
      method: "POST",
      body: JSON.stringify({
        repoId,
        branch,
        ...input
      })
    });
  });

  app.post("/v1/repos/:repoId/branches/:branch/push/commit", async (context) => {
    const repoId = context.req.param("repoId");
    const branch = context.req.param("branch");
    const actor = await requireServiceAccountAuthorization(context, options, {
      repoId,
      branch,
      operation: "push",
      action: "branch.push.commit"
    });
    const input = pushCommitRequestSchema.parse(await context.req.json());
    const id = context.env.REPO_BRANCH_COORDINATOR.idFromName(`${repoId}:${branch}`);
    const stub = context.env.REPO_BRANCH_COORDINATOR.get(id);

    const response = await stub.fetch("https://repo-branch-coordinator/finalize-push", {
      method: "POST",
      body: JSON.stringify({
        repoId,
        branch,
        expectedHead: input.expectedHead,
        commit: input.commitId,
        parentCommit: input.parentCommitId,
        idempotencyKey: input.idempotencyKey,
        payloadFingerprint: input.payloadFingerprint,
        objectKey: input.objectKey,
        ciphertextSha256: input.ciphertextSha256,
        ciphertextSize: input.ciphertextSize,
        repoKeyVersion: input.repoKeyVersion,
        createdAt: input.createdAt ?? new Date().toISOString()
      })
    });

    if (response.ok) {
      const decision = (await response.clone().json()) as {
        readonly status?: string;
        readonly commit?: string;
        readonly headCommit?: string;
      };
      if (decision.status === "committed" && decision.commit) {
        await context.env.AUDIT_QUEUE.send({
          action: "branch.push.committed",
          actorType: "service-account",
          ...(actor.organizationId ? { organizationId: actor.organizationId } : {}),
          actorServiceAccountId: actor.serviceAccountId,
          result: "success",
          targetType: "repo-branch",
          targetId: `${repoId}:${branch}`,
          metadata: {
            repoId,
            branch,
            commit: decision.commit,
            headCommit: decision.headCommit ?? decision.commit,
            ciphertextSha256: input.ciphertextSha256,
            repoKeyVersion: input.repoKeyVersion
          },
          occurredAt: new Date().toISOString()
        });
      }
    }

    return response;
  });

  app.post("/v1/repos/:repoId/branches/:branch/pull", async (context) => {
    const repoId = context.req.param("repoId");
    const branch = context.req.param("branch");
    const actor = await requireServiceAccountAuthorization(context, options, {
      repoId,
      branch,
      operation: "pull",
      action: "branch.pull"
    });
    const input = pullRequestSchema.parse(await context.req.json());
    const id = context.env.REPO_BRANCH_COORDINATOR.idFromName(`${repoId}:${branch}`);
    const stub = context.env.REPO_BRANCH_COORDINATOR.get(id);

    const response = await stub.fetch("https://repo-branch-coordinator/pull", {
      method: "POST",
      body: JSON.stringify({
        repoId,
        branch,
        ...input
      })
    });
    if (response.ok) {
      await context.env.AUDIT_QUEUE.send({
        action: "branch.pull",
        actorType: "service-account",
        ...(actor.organizationId ? { organizationId: actor.organizationId } : {}),
        actorServiceAccountId: actor.serviceAccountId,
        result: "success",
        targetType: "repo-branch",
        targetId: `${repoId}:${branch}`,
        metadata: {
          repoId,
          branch
        },
        occurredAt: new Date().toISOString()
      });
    }

    return response;
  });

  app.post("/v1/service-accounts/authorize", async (context) => {
    const input = serviceAccountAuthorizeRequestSchema.parse(await context.req.json());
    const decision = authorizeServiceAccount({
      token: {
        status: input.status,
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
        ...(input.revokedAt ? { revokedAt: input.revokedAt } : {}),
        allowedBranches: input.allowedBranches,
        capabilities: input.capabilities
      },
      branchName: input.branchName,
      operation: input.operation,
      now: new Date(input.now)
    });

    return context.json(decision, { status: decision.allowed ? 200 : 403 });
  });

  app.post("/v1/envelopes/validate", async (context) => {
    const input = envelopeValidationRequestSchema.parse(await context.req.json());
    const result = validateEnvelopePayload(input.envelope);
    return context.json(result, { status: result.valid ? 200 : 400 });
  });

  app.put("/v1/blobs/:commitId", async (context) => {
    const commitId = context.req.param("commitId");
    const repoId = context.req.header("x-wenvy-repo-id");
    const branch = context.req.header("x-wenvy-branch");
    if (!repoId || !branch) {
      throw jsonHttpException(400, "invalid-request", "x-wenvy-repo-id and x-wenvy-branch are required");
    }
    await requireServiceAccountAuthorization(context, options, {
      repoId,
      branch,
      operation: "push",
      action: "blob.upload"
    });
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
    const input = rotationRequestSchema.parse(await context.req.json());
    await context.env.ROTATION_QUEUE.send({
      ...input,
      requestedAt: new Date().toISOString()
    });
    return context.json({ queued: true, rotationId: input.rotationId });
  });

  app.post("/webhooks/github", async (context) => {
    const rawBody = await context.req.text();
    const secret = context.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      throw new HTTPException(500, { message: "GitHub webhook secret is not configured" });
    }

    const payloadSha256 = await sha256TextHex(rawBody);
    const valid = await verifyGithubWebhookSignature({
      secret,
      rawBody,
      signatureHeader: context.req.header("X-Hub-Signature-256") ?? null
    });

    const deliveryId = context.req.header("X-GitHub-Delivery");
    const event = context.req.header("X-GitHub-Event");
    if (!deliveryId || !event) {
      throw new HTTPException(400, { message: "GitHub delivery and event headers are required" });
    }

    const deliveryStub = context.env.GITHUB_DELIVERY_COORDINATOR.get(
      context.env.GITHUB_DELIVERY_COORDINATOR.idFromName(deliveryId)
    );
    const receiptResponse = await deliveryStub.fetch("https://github-delivery-coordinator/record", {
      method: "POST",
      body: JSON.stringify({
        deliveryId,
        event,
        receivedAt: new Date().toISOString(),
        payloadSha256,
        signatureValid: valid
      })
    });

    if (!valid) {
      return receiptResponse;
    }

    const receipt = (await receiptResponse.json()) as { readonly status: string };
    if (receipt.status === "duplicate") {
      return context.json({ queued: false, duplicate: true, deliveryId });
    }
    if (receipt.status === "delivery-replay") {
      return context.json({ queued: false, reason: "delivery-replay", deliveryId }, 409);
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
    if (error instanceof ZodError) {
      return context.json(
        {
          error: "invalid-request",
          message: error.issues.map((issue) => issue.message).join("; ")
        },
        400
      );
    }

    if (error instanceof HTTPException) {
      return error.getResponse();
    }
    return context.json({ error: "internal-error" }, 500);
  });

  return app;
}

async function requireServiceAccountAuthorization(
  context: AppContext,
  options: HonoAppOptions,
  input: {
    readonly repoId: string;
    readonly branch: string;
    readonly operation: Extract<ServiceAccountOperation, "pull" | "push">;
    readonly action: string;
  }
): Promise<AuthorizedServiceAccount> {
  const token = readBearerToken(context.req.header("Authorization"));
  if (!token) {
    throw jsonHttpException(401, "unauthorized", "bearer token is required");
  }

  const repository = options.serviceAccountTokenRepository ?? createServiceAccountTokenRepository(context.env);
  const record = await repository.findByTokenHash({
    tokenHash: await sha256Hex(token),
    repoId: input.repoId
  });
  if (!record) {
    throw jsonHttpException(401, "unauthorized", "bearer token is invalid");
  }

  const now = new Date();
  const decision = authorizeServiceAccount({
    token: record.policy,
    branchName: input.branch,
    operation: input.operation,
    now
  });
  if (!decision.allowed) {
    await auditDeniedServiceAccountAction(context, record, {
      repoId: input.repoId,
      branch: input.branch,
      action: input.action,
      reason: decision.reason
    });
    throw jsonHttpException(403, "forbidden", decision.reason);
  }

  await repository.markLastUsed({
    tokenId: record.tokenId,
    usedAt: now.toISOString()
  });

  return {
    tokenId: record.tokenId,
    serviceAccountId: record.serviceAccountId,
    organizationId: record.organizationId
  };
}

async function auditDeniedServiceAccountAction(
  context: AppContext,
  actor: ServiceAccountTokenRecord,
  input: {
    readonly repoId: string;
    readonly branch: string;
    readonly action: string;
    readonly reason: string;
  }
): Promise<void> {
  await context.env.AUDIT_QUEUE.send({
    action: input.action,
    actorType: "service-account",
    ...(actor.organizationId ? { organizationId: actor.organizationId } : {}),
    actorServiceAccountId: actor.serviceAccountId,
    result: "denied",
    targetType: "repo-branch",
    targetId: `${input.repoId}:${input.branch}`,
    metadata: {
      repoId: input.repoId,
      branch: input.branch,
      reason: input.reason
    },
    occurredAt: new Date().toISOString()
  });
}

function readBearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/iu.exec(header.trim());
  return match?.[1] ?? null;
}

function jsonHttpException(status: ContentfulStatusCode, error: string, message: string): HTTPException {
  return new HTTPException(status, {
    res: Response.json({ error, message }, { status })
  });
}

async function sha256TextHex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256BytesHex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
