import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createSnapshotObjectKey } from "@wenvy/domain";
import { createHonoApp } from "../../apps/web-worker/src/worker/hono-app.js";
import type {
  ServiceAccountTokenRecord,
  ServiceAccountTokenRepository
} from "../../apps/web-worker/src/worker/persistence/postgres/service-account-token-repository.js";
import type { WorkerEnv } from "../../apps/web-worker/src/worker/worker-env.js";

const serviceAccountId = "service_account_01JY7X0WENVYAAA";
const bearerToken = "test-service-account-token";
const repoId = "repo_01JY7X0WENVYAAA";
const commitId = "commit_01JY7X0WENVYAAA";
const ciphertextSha256 = "a".repeat(64);
const snapshotObjectKey = createSnapshotObjectKey({ commitId, ciphertextSha256 });

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

  it("allows the dashboard origin to read API health from the browser", async () => {
    const response = await createHonoApp().fetch(
      new Request("https://wenvy.test/health", {
        headers: {
          origin: "https://dash.wenvy.dev"
        }
      }),
      fakeEnv(),
      fakeExecutionContext()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://dash.wenvy.dev");
  });

  it("answers dashboard CORS preflight for authenticated data-plane routes", async () => {
    const response = await createHonoApp().fetch(
      new Request("https://wenvy.test/v1/repos/repo_01JY7X0WENVYAAA/branches/main/pull", {
        method: "OPTIONS",
        headers: {
          origin: "https://dash.wenvy.dev",
          "access-control-request-method": "POST",
          "access-control-request-headers": "authorization,content-type"
        }
      }),
      fakeEnv(),
      fakeExecutionContext()
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://dash.wenvy.dev");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    expect(response.headers.get("access-control-allow-headers")).toContain("authorization");
  });

  it("does not grant browser CORS to unrelated origins", async () => {
    const response = await createHonoApp().fetch(
      new Request("https://wenvy.test/health", {
        headers: {
          origin: "https://example.invalid"
        }
      }),
      fakeEnv(),
      fakeExecutionContext()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
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
    const response = await createHonoApp({
      serviceAccountTokenRepository: fakeServiceAccountTokenRepository()
    }).fetch(
      new Request("https://wenvy.test/v1/blobs/commit_01JY7X0WENVYAAA", {
        method: "PUT",
        headers: {
          authorization: `Bearer ${bearerToken}`,
          "x-wenvy-repo-id": "repo_01JY7X0WENVYAAA",
          "x-wenvy-branch": "main",
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
    const repository = fakeServiceAccountTokenRepository();
    const response = await createHonoApp({
      serviceAccountTokenRepository: repository
    }).fetch(
      new Request("https://wenvy.test/v1/blobs/commit_01JY7X0WENVYAAA", {
        method: "PUT",
        headers: {
          authorization: `Bearer ${bearerToken}`,
          "x-wenvy-repo-id": "repo_01JY7X0WENVYAAA",
          "x-wenvy-branch": "main",
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
    expect(env.WENVY_BLOBS.put).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(ArrayBuffer),
      expect.objectContaining({
        customMetadata: expect.objectContaining({
          ciphertextSha256: digest,
          commitId,
          repoId,
          branch: "main",
          ciphertextSize: String(bytes.length)
        })
      })
    );
    expect(repository.markLastUsed).toHaveBeenCalledOnce();
  });

  it("requires bearer auth before forwarding push intents", async () => {
    const forwardedRequests: Request[] = [];
    const repository = fakeServiceAccountTokenRepository();
    const env = fakeEnv({
      repoBranchFetch: async (request) => {
        forwardedRequests.push(request.clone());
        return Response.json({ status: "accepted", commit: "commit_01JY7X0WENVYAAA", headCommit: null });
      }
    });

    const response = await createHonoApp({
      serviceAccountTokenRepository: repository
    }).fetch(
      new Request("https://wenvy.test/v1/repos/repo_01JY7X0WENVYAAA/branches/main/push/intent", {
        method: "POST",
        body: JSON.stringify({
          expectedHead: null,
          nextCommit: "commit_01JY7X0WENVYAAA",
          idempotencyKey: "idem_01JY7X0WENVYAAA",
          payloadFingerprint: "a".repeat(64)
        })
      }),
      env,
      fakeExecutionContext()
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "unauthorized" });
    expect(forwardedRequests).toHaveLength(0);
    expect(repository.findByTokenHash).not.toHaveBeenCalled();
  });

  it("forwards push intents with repo and branch scope", async () => {
    const forwardedRequests: Request[] = [];
    const repository = fakeServiceAccountTokenRepository();
    const env = fakeEnv({
      repoBranchFetch: async (request) => {
        forwardedRequests.push(request.clone());
        return Response.json({ status: "accepted", commit: "commit_01JY7X0WENVYAAA", headCommit: null });
      }
    });

    const response = await createHonoApp({
      serviceAccountTokenRepository: repository
    }).fetch(
      new Request("https://wenvy.test/v1/repos/repo_01JY7X0WENVYAAA/branches/main/push/intent", {
        method: "POST",
        headers: {
          authorization: `Bearer ${bearerToken}`
        },
        body: JSON.stringify({
          expectedHead: null,
          nextCommit: "commit_01JY7X0WENVYAAA",
          idempotencyKey: "idem_01JY7X0WENVYAAA",
          payloadFingerprint: "a".repeat(64)
        })
      }),
      env,
      fakeExecutionContext()
    );

    expect(response.status).toBe(200);
    expect(forwardedRequests).toHaveLength(1);
    expect(new URL(forwardedRequests[0]!.url).pathname).toBe("/write-intent");
    await expect(forwardedRequests[0]!.json()).resolves.toMatchObject({
      repoId: "repo_01JY7X0WENVYAAA",
      branch: "main",
      nextCommit: "commit_01JY7X0WENVYAAA"
    });
    expect(repository.markLastUsed).toHaveBeenCalledOnce();
  });

  it("denies push attempts from pull-only service account tokens before forwarding", async () => {
    const forwardedRequests: Request[] = [];
    const env = fakeEnv({
      repoBranchFetch: async (request) => {
        forwardedRequests.push(request.clone());
        return Response.json({ status: "accepted", commit: "commit_01JY7X0WENVYAAA", headCommit: null });
      }
    });
    const repository = fakeServiceAccountTokenRepository({ capabilities: "pull-only" });

    const response = await createHonoApp({
      serviceAccountTokenRepository: repository
    }).fetch(
      new Request("https://wenvy.test/v1/repos/repo_01JY7X0WENVYAAA/branches/main/push/intent", {
        method: "POST",
        headers: {
          authorization: `Bearer ${bearerToken}`
        },
        body: JSON.stringify({
          expectedHead: null,
          nextCommit: "commit_01JY7X0WENVYAAA",
          idempotencyKey: "idem_01JY7X0WENVYAAA",
          payloadFingerprint: "a".repeat(64)
        })
      }),
      env,
      fakeExecutionContext()
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "forbidden", message: "capability-denied" });
    expect(forwardedRequests).toHaveLength(0);
    expect(repository.markLastUsed).not.toHaveBeenCalled();
    expect(env.AUDIT_QUEUE.send).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "branch.push.intent",
        actorType: "service-account",
        actorServiceAccountId: serviceAccountId,
        result: "denied",
        targetId: "repo_01JY7X0WENVYAAA:main",
        metadata: expect.objectContaining({ reason: "capability-denied" })
      })
    );
  });

  it("forwards validated push finalization to the branch coordinator", async () => {
    const forwardedRequests: Request[] = [];
    const repository = fakeServiceAccountTokenRepository();
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

    const response = await createHonoApp({
      serviceAccountTokenRepository: repository
    }).fetch(
      new Request("https://wenvy.test/v1/repos/repo_01JY7X0WENVYAAA/branches/main/push/commit", {
        method: "POST",
        headers: {
          authorization: `Bearer ${bearerToken}`
        },
        body: JSON.stringify({
          expectedHead: null,
          commitId,
          parentCommitId: null,
          idempotencyKey: "idem_01JY7X0WENVYAAA",
          payloadFingerprint: ciphertextSha256,
          objectKey: snapshotObjectKey,
          ciphertextSha256,
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
    expect(env.WENVY_BLOBS.head).toHaveBeenCalledWith(snapshotObjectKey);
    await expect(forwardedRequests[0]!.json()).resolves.toMatchObject({
      repoId: "repo_01JY7X0WENVYAAA",
      branch: "main",
      expectedHead: null,
      commit: commitId,
      parentCommit: null,
      objectKey: snapshotObjectKey
    });
    expect(env.AUDIT_QUEUE.send).toHaveBeenCalledOnce();
    expect(env.AUDIT_QUEUE.send).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "branch.push.committed",
        actorType: "service-account",
        actorServiceAccountId: serviceAccountId,
        result: "success",
        targetType: "repo-branch",
        targetId: "repo_01JY7X0WENVYAAA:main",
        metadata: expect.objectContaining({
          repoId: "repo_01JY7X0WENVYAAA",
          branch: "main",
          commit: commitId,
          ciphertextSha256,
          repoKeyVersion: 1
        })
      })
    );
    expect(repository.markLastUsed).toHaveBeenCalledOnce();
  });

  it("rejects push finalization when the object key is not server-derived", async () => {
    const forwardedRequests: Request[] = [];
    const repository = fakeServiceAccountTokenRepository();
    const env = fakeEnv({
      repoBranchFetch: async (request) => {
        forwardedRequests.push(request.clone());
        return Response.json({
          status: "committed",
          commit: commitId,
          headCommit: commitId
        });
      }
    });

    const response = await createHonoApp({
      serviceAccountTokenRepository: repository
    }).fetch(
      new Request("https://wenvy.test/v1/repos/repo_01JY7X0WENVYAAA/branches/main/push/commit", {
        method: "POST",
        headers: {
          authorization: `Bearer ${bearerToken}`
        },
        body: JSON.stringify({
          expectedHead: null,
          commitId,
          parentCommitId: null,
          idempotencyKey: "idem_01JY7X0WENVYAAA",
          payloadFingerprint: ciphertextSha256,
          objectKey: createSnapshotObjectKey({ commitId, ciphertextSha256: "b".repeat(64) }),
          ciphertextSha256,
          ciphertextSize: 16,
          repoKeyVersion: 1
        })
      }),
      env,
      fakeExecutionContext()
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "blob-metadata-mismatch" });
    expect(env.WENVY_BLOBS.head).not.toHaveBeenCalled();
    expect(forwardedRequests).toHaveLength(0);
  });

  it("rejects push finalization when R2 metadata is not bound to the repo branch", async () => {
    const forwardedRequests: Request[] = [];
    const repository = fakeServiceAccountTokenRepository();
    const env = fakeEnv({
      blobHead: {
        size: 16,
        customMetadata: {
          ciphertextSha256,
          commitId,
          repoId,
          branch: "production",
          ciphertextSize: "16"
        }
      },
      repoBranchFetch: async (request) => {
        forwardedRequests.push(request.clone());
        return Response.json({
          status: "committed",
          commit: commitId,
          headCommit: commitId
        });
      }
    });

    const response = await createHonoApp({
      serviceAccountTokenRepository: repository
    }).fetch(
      new Request("https://wenvy.test/v1/repos/repo_01JY7X0WENVYAAA/branches/main/push/commit", {
        method: "POST",
        headers: {
          authorization: `Bearer ${bearerToken}`
        },
        body: JSON.stringify({
          expectedHead: null,
          commitId,
          parentCommitId: null,
          idempotencyKey: "idem_01JY7X0WENVYAAA",
          payloadFingerprint: ciphertextSha256,
          objectKey: snapshotObjectKey,
          ciphertextSha256,
          ciphertextSize: 16,
          repoKeyVersion: 1
        })
      }),
      env,
      fakeExecutionContext()
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "blob-metadata-mismatch" });
    expect(forwardedRequests).toHaveLength(0);
  });

  it("rejects push finalization when the uploaded R2 blob is missing", async () => {
    const forwardedRequests: Request[] = [];
    const repository = fakeServiceAccountTokenRepository();
    const env = fakeEnv({
      blobHead: null,
      repoBranchFetch: async (request) => {
        forwardedRequests.push(request.clone());
        return Response.json({
          status: "committed",
          commit: commitId,
          headCommit: commitId
        });
      }
    });

    const response = await createHonoApp({
      serviceAccountTokenRepository: repository
    }).fetch(
      new Request("https://wenvy.test/v1/repos/repo_01JY7X0WENVYAAA/branches/main/push/commit", {
        method: "POST",
        headers: {
          authorization: `Bearer ${bearerToken}`
        },
        body: JSON.stringify({
          expectedHead: null,
          commitId,
          parentCommitId: null,
          idempotencyKey: "idem_01JY7X0WENVYAAA",
          payloadFingerprint: ciphertextSha256,
          objectKey: snapshotObjectKey,
          ciphertextSha256,
          ciphertextSize: 16,
          repoKeyVersion: 1
        })
      }),
      env,
      fakeExecutionContext()
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "missing-blob" });
    expect(forwardedRequests).toHaveLength(0);
    expect(repository.markLastUsed).toHaveBeenCalledOnce();
  });

  it("forwards pull requests to the branch coordinator", async () => {
    const forwardedRequests: Request[] = [];
    const repository = fakeServiceAccountTokenRepository();
    const env = fakeEnv({
      repoBranchFetch: async (request) => {
        forwardedRequests.push(request.clone());
        return Response.json({ status: "up-to-date", headCommit: "commit_01JY7X0WENVYAAA", snapshot: null });
      }
    });

    const response = await createHonoApp({
      serviceAccountTokenRepository: repository
    }).fetch(
      new Request("https://wenvy.test/v1/repos/repo_01JY7X0WENVYAAA/branches/main/pull", {
        method: "POST",
        headers: {
          authorization: `Bearer ${bearerToken}`
        },
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
      repoId: "repo_01JY7X0WENVYAAA",
      branch: "main",
      knownHead: "commit_01JY7X0WENVYAAA"
    });
    expect(repository.markLastUsed).toHaveBeenCalledOnce();
    expect(env.AUDIT_QUEUE.send).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "branch.pull",
        actorType: "service-account",
        actorServiceAccountId: serviceAccountId,
        result: "success",
        targetId: "repo_01JY7X0WENVYAAA:main"
      })
    );
  });

  it("downloads encrypted snapshot bytes through branch-scoped authorization", async () => {
    const forwardedRequests: Request[] = [];
    const bytes = new TextEncoder().encode("sealed-ciphertext-bytes");
    const digest = createHash("sha256").update(bytes).digest("hex");
    const objectKey = createSnapshotObjectKey({ commitId, ciphertextSha256: digest });
    const repository = fakeServiceAccountTokenRepository();
    const env = fakeEnv({
      blobBytes: bytes,
      repoBranchFetch: async (request) => {
        forwardedRequests.push(request.clone());
        return Response.json({
          status: "snapshot",
          headCommit: commitId,
          snapshot: {
            commit: commitId,
            parentCommit: null,
            objectKey,
            ciphertextSha256: digest,
            ciphertextSize: bytes.byteLength,
            repoKeyVersion: 1,
            createdAt: "2026-06-13T12:00:00.000Z"
          }
        });
      }
    });

    const response = await createHonoApp({
      serviceAccountTokenRepository: repository
    }).fetch(
      new Request("https://wenvy.test/v1/repos/repo_01JY7X0WENVYAAA/branches/main/blobs/commit_01JY7X0WENVYAAA", {
        method: "GET",
        headers: {
          authorization: `Bearer ${bearerToken}`
        }
      }),
      env,
      fakeExecutionContext()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("x-ciphertext-sha256")).toBe(digest);
    expect(response.headers.get("x-wenvy-commit-id")).toBe(commitId);
    expect(response.headers.get("x-ciphertext-size")).toBe(String(bytes.byteLength));
    expect(response.headers.get("x-repo-key-version")).toBe("1");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(forwardedRequests).toHaveLength(1);
    await expect(forwardedRequests[0]!.json()).resolves.toEqual({
      repoId,
      branch: "main",
      knownHead: null
    });
    expect(env.WENVY_BLOBS.get).toHaveBeenCalledWith(objectKey);
    expect(repository.markLastUsed).toHaveBeenCalledOnce();
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
  readonly blobHead?: FakeR2ObjectHead | null;
  readonly blobBytes?: Uint8Array | null;
}

interface FakeR2ObjectHead {
  readonly size: number;
  readonly customMetadata?: Record<string, string>;
}

function fakeServiceAccountTokenRepository(
  policyOverrides: Partial<ServiceAccountTokenRecord["policy"]> = {}
): ServiceAccountTokenRepository {
  return {
    findByTokenHash: vi.fn(async () => ({
      tokenId: "token_01JY7X0WENVYAAA",
      serviceAccountId,
      organizationId: "org_01JY7X0WENVYAAAA",
      policy: {
        status: "active",
        allowedBranches: ["main"],
        capabilities: "push-and-pull",
        ...policyOverrides
      }
    })),
    markLastUsed: vi.fn(async () => undefined)
  };
}

function fakeEnv(options: FakeEnvOptions = {}): WorkerEnv {
  const blobHead =
    options.blobHead === undefined
      ? {
          size: 16,
          customMetadata: {
            ciphertextSha256,
            commitId,
            repoId,
            branch: "main",
            ciphertextSize: "16"
          }
        }
      : options.blobHead;
  const blobBytes = options.blobBytes ?? new Uint8Array();
  return {
    WENVY_DB: {} as Hyperdrive,
    WENVY_BLOBS: {
      put: vi.fn(async () => undefined),
      head: vi.fn(async () => blobHead),
      get: vi.fn(async () =>
        blobBytes === null
          ? null
          : ({
              arrayBuffer: vi.fn(async () => toArrayBuffer(blobBytes))
            } as unknown as R2ObjectBody)
      )
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

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  return arrayBuffer;
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
