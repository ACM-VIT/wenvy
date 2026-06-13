import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createHonoApp } from "../../apps/web-worker/src/worker/hono-app.js";
import type { WorkerEnv } from "../../apps/web-worker/src/worker/worker-env.js";

describe("Hono route regression", () => {
  it("serves OpenAPI document", async () => {
    const response = await createHonoApp().fetch(
      new Request("https://wenvy.test/openapi.json"),
      fakeEnv(),
      fakeExecutionContext()
    );
    const body = (await response.json()) as { readonly openapi: string };

    expect(response.status).toBe(200);
    expect(body.openapi).toBe("3.1.0");
  });

  it("returns 400 for invalid contract payloads instead of internal-error", async () => {
    const response = await createHonoApp().fetch(
      new Request("https://wenvy.test/v1/service-accounts/authorize", {
        method: "POST",
        body: JSON.stringify({ status: "active" })
      }),
      fakeEnv(),
      fakeExecutionContext()
    );
    const body = (await response.json()) as { readonly error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid-request");
  });

  it("authorizes service account decisions through the route", async () => {
    const response = await createHonoApp().fetch(
      new Request("https://wenvy.test/v1/service-accounts/authorize", {
        method: "POST",
        body: JSON.stringify({
          status: "active",
          allowedBranches: ["production"],
          capabilities: "pull-only",
          branchName: "production",
          operation: "pull",
          now: "2026-06-13T12:00:00.000Z"
        })
      }),
      fakeEnv(),
      fakeExecutionContext()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ allowed: true, reason: "allowed" });
  });

  it("rejects plaintext envelope payloads through the route", async () => {
    const response = await createHonoApp().fetch(
      new Request("https://wenvy.test/v1/envelopes/validate", {
        method: "POST",
        body: JSON.stringify({
          envelope: {
            encryptedTeamKey: "ciphertext",
            teamKey: "plaintext"
          }
        })
      }),
      fakeEnv(),
      fakeExecutionContext()
    );
    const body = (await response.json()) as { readonly reasons: readonly string[] };

    expect(response.status).toBe(400);
    expect(body.reasons).toContain("plaintext-not-allowed");
  });

  it("rejects snapshot blob uploads whose declared hash does not match ciphertext bytes", async () => {
    const env = fakeEnv();
    const response = await createHonoApp().fetch(
      new Request("https://wenvy.test/v1/blobs/commit_01JY7X0WENVYAAA", {
        method: "PUT",
        headers: {
          "x-ciphertext-sha256": "a".repeat(64)
        },
        body: "ciphertext"
      }),
      env,
      fakeExecutionContext()
    );

    expect(response.status).toBe(400);
    expect(env.WENVY_BLOBS.put).not.toHaveBeenCalled();
  });

  it("accepts matching encrypted blob uploads and writes to opaque R2 key", async () => {
    const env = fakeEnv();
    const bytes = "ciphertext";
    const digest = createHash("sha256").update(bytes).digest("hex");
    const response = await createHonoApp().fetch(
      new Request("https://wenvy.test/v1/blobs/commit_01JY7X0WENVYAAA", {
        method: "PUT",
        headers: {
          "x-ciphertext-sha256": digest
        },
        body: bytes
      }),
      env,
      fakeExecutionContext()
    );
    const body = (await response.json()) as { readonly objectKey: string };

    expect(response.status).toBe(200);
    expect(body.objectKey).toMatch(/^snapshots\//u);
    expect(env.WENVY_BLOBS.put).toHaveBeenCalledOnce();
  });

  it("forwards validated push finalization to the branch coordinator", async () => {
    const forwardedRequests: Request[] = [];
    const env = fakeEnv({
      repoBranchFetch: async (request) => {
        forwardedRequests.push(request.clone());
        return Response.json({
          status: "committed",
          commit: "commit_01JY7X0WENVYAAA",
          headCommit: "commit_01JY7X0WENVYAAA"
        });
      }
    });

    const response = await createHonoApp().fetch(
      new Request("https://wenvy.test/v1/repos/repo_01JY7X0WENVYAAA/branches/main/push/commit", {
        method: "POST",
        body: JSON.stringify({
          expectedHead: null,
          commitId: "commit_01JY7X0WENVYAAA",
          parentCommitId: null,
          idempotencyKey: "idem_01JY7X0WENVYAAA",
          payloadFingerprint: "a".repeat(64),
          objectKey: "snapshots/opaque-object-key",
          ciphertextSha256: "a".repeat(64),
          ciphertextSize: 16,
          repoKeyVersion: 1,
          createdAt: "2026-06-13T12:00:00.000Z"
        })
      }),
      env,
      fakeExecutionContext()
    );

    expect(response.status).toBe(200);
    expect(forwardedRequests).toHaveLength(1);
    expect(new URL(forwardedRequests[0]!.url).pathname).toBe("/finalize-push");
    await expect(forwardedRequests[0]!.json()).resolves.toMatchObject({
      expectedHead: null,
      commit: "commit_01JY7X0WENVYAAA",
      parentCommit: null,
      objectKey: "snapshots/opaque-object-key"
    });
    expect(env.AUDIT_QUEUE.send).toHaveBeenCalledOnce();
    expect(env.AUDIT_QUEUE.send).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "branch.push.committed",
        actorType: "system",
        result: "success",
        targetType: "repo-branch",
        targetId: "repo_01JY7X0WENVYAAA:main",
        metadata: expect.objectContaining({
          repoId: "repo_01JY7X0WENVYAAA",
          branch: "main",
          commit: "commit_01JY7X0WENVYAAA",
          ciphertextSha256: "a".repeat(64),
          repoKeyVersion: 1
        })
      })
    );
  });

  it("forwards pull requests to the branch coordinator", async () => {
    const forwardedRequests: Request[] = [];
    const env = fakeEnv({
      repoBranchFetch: async (request) => {
        forwardedRequests.push(request.clone());
        return Response.json({ status: "up-to-date", headCommit: "commit_01JY7X0WENVYAAA", snapshot: null });
      }
    });

    const response = await createHonoApp().fetch(
      new Request("https://wenvy.test/v1/repos/repo_01JY7X0WENVYAAA/branches/main/pull", {
        method: "POST",
        body: JSON.stringify({
          knownHead: "commit_01JY7X0WENVYAAA"
        })
      }),
      env,
      fakeExecutionContext()
    );

    expect(response.status).toBe(200);
    expect(forwardedRequests).toHaveLength(1);
    expect(new URL(forwardedRequests[0]!.url).pathname).toBe("/pull");
    await expect(forwardedRequests[0]!.json()).resolves.toEqual({
      knownHead: "commit_01JY7X0WENVYAAA"
    });
  });

  it("queues rotation requests instead of starting workflows inline", async () => {
    const env = fakeEnv();
    const response = await createHonoApp().fetch(
      new Request("https://wenvy.test/v1/rotations", {
        method: "POST",
        body: JSON.stringify({
          rotationId: "rotation_01JY7X0WENVYAAA",
          scopeType: "team",
          scopeId: "team_01JY7X0WENVYAAA"
        })
      }),
      env,
      fakeExecutionContext()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      queued: true,
      rotationId: "rotation_01JY7X0WENVYAAA"
    });
    expect(env.ROTATION_QUEUE.send).toHaveBeenCalledOnce();
    expect(env.ROTATION_QUEUE.send).toHaveBeenCalledWith(
      expect.objectContaining({
        rotationId: "rotation_01JY7X0WENVYAAA",
        scopeType: "team",
        scopeId: "team_01JY7X0WENVYAAA",
        requestedAt: expect.any(String)
      })
    );
    expect(env.KEY_ROTATION_WORKFLOW.create).not.toHaveBeenCalled();
  });
});

interface FakeEnvOptions {
  readonly repoBranchFetch?: (request: Request) => Promise<Response>;
}

function fakeEnv(options: FakeEnvOptions = {}): WorkerEnv {
  return {
    WENVY_DB: {} as Hyperdrive,
    WENVY_BLOBS: {
      put: vi.fn(async () => undefined)
    } as unknown as R2Bucket,
    WENVY_LOGS: {} as R2Bucket,
    WENVY_CONFIG_CACHE: {} as KVNamespace,
    AUTH_TOKEN_COORDINATOR: fakeDurableObjectNamespace(),
    REPO_BRANCH_COORDINATOR: fakeDurableObjectNamespace(options.repoBranchFetch),
    RATE_LIMIT_COORDINATOR: fakeDurableObjectNamespace(),
    GITHUB_DELIVERY_COORDINATOR: fakeDurableObjectNamespace(),
    GITHUB_SYNC_QUEUE: fakeQueue(),
    AUDIT_QUEUE: fakeQueue(),
    ENVELOPE_CHECK_QUEUE: fakeQueue(),
    EMAIL_QUEUE: fakeQueue(),
    ROTATION_QUEUE: fakeQueue(),
    KEY_ROTATION_WORKFLOW: {
      create: vi.fn(async () => ({ id: "workflow-instance" }))
    },
    GITHUB_WEBHOOK_SECRET: "secret"
  };
}

function fakeQueue<T>(): Queue<T> {
  return {
    send: vi.fn(async () => undefined)
  } as unknown as Queue<T>;
}

function fakeDurableObjectNamespace(fetchHandler?: (request: Request) => Promise<Response>): DurableObjectNamespace {
  return {
    idFromName: vi.fn(() => ({})),
    get: vi.fn(() => ({
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return fetchHandler ? fetchHandler(request) : Response.json({ status: "consumed" });
      })
    }))
  } as unknown as DurableObjectNamespace;
}

function fakeExecutionContext(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    props: {}
  };
}
