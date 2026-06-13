import { describe, expect, it, vi } from "vitest";
import { dispatchQueue } from "../../apps/web-worker/src/worker/queue-consumers/queue-dispatch.js";
import type {
  AuditEventRecord,
  AuditEventRepository
} from "../../apps/web-worker/src/worker/persistence/postgres/audit-event-repository.js";
import type { WorkerEnv } from "../../apps/web-worker/src/worker/worker-env.js";

describe("queue dispatch regression", () => {
  it("persists audit queue messages before acking them", async () => {
    const appended: AuditEventRecord[] = [];
    const repository: AuditEventRepository = {
      appendMany: vi.fn(async (events) => {
        appended.push(...events);
      })
    };
    const message = fakeMessage({
      action: "branch.push.committed",
      actorType: "service-account",
      actorServiceAccountId: "00000000-0000-0000-0000-000000000123",
      result: "success",
      targetType: "repo-branch",
      targetId: "repo_01JY7X0WENVYAAA:main",
      metadata: { commit: "commit_01JY7X0WENVYAAA" },
      occurredAt: "2026-06-13T12:00:00.000Z"
    });

    await dispatchQueue(fakeBatch("wenvy-audit-dev", [message]), fakeEnv(), fakeExecutionContext(), {
      auditEventRepository: repository
    });

    expect(repository.appendMany).toHaveBeenCalledOnce();
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({
      actorType: "service_account",
      action: "branch.push.committed",
      targetType: "repo-branch",
      targetId: "repo_01JY7X0WENVYAAA:main",
      result: "success",
      metadata: { commit: "commit_01JY7X0WENVYAAA" },
      createdAt: "2026-06-13T12:00:00.000Z"
    });
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  });

  it("retries invalid audit messages without silently acknowledging them", async () => {
    const repository: AuditEventRepository = {
      appendMany: vi.fn(async () => undefined)
    };
    const message = fakeMessage({ action: "missing-fields" });

    await dispatchQueue(fakeBatch("wenvy-audit-dev", [message]), fakeEnv(), fakeExecutionContext(), {
      auditEventRepository: repository
    });

    expect(repository.appendMany).not.toHaveBeenCalled();
    expect(message.ack).not.toHaveBeenCalled();
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
  });

  it("retries the whole audit batch when persistence fails", async () => {
    const repository: AuditEventRepository = {
      appendMany: vi.fn(async () => {
        throw new Error("database unavailable");
      })
    };
    const message = fakeMessage({
      action: "rotation.started",
      actorType: "system",
      result: "success",
      targetType: "team",
      targetId: "team_01JY7X0WENVYAAA",
      occurredAt: "2026-06-13T12:00:00.000Z"
    });
    const batch = fakeBatch("wenvy-audit-dev", [message]);

    await expect(
      dispatchQueue(batch, fakeEnv(), fakeExecutionContext(), {
        auditEventRepository: repository
      })
    ).rejects.toThrow("database unavailable");

    expect(message.ack).not.toHaveBeenCalled();
    expect(batch.retryAll).toHaveBeenCalledWith({ delaySeconds: 30 });
  });
});

function fakeMessage(body: unknown): Message<unknown> {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date("2026-06-13T12:00:00.000Z"),
    body,
    attempts: 1,
    ack: vi.fn(),
    retry: vi.fn()
  };
}

function fakeBatch(queue: string, messages: readonly Message<unknown>[]): MessageBatch<unknown> {
  return {
    queue,
    messages,
    metadata: {
      retryCount: 0
    } as MessageBatchMetadata,
    ackAll: vi.fn(),
    retryAll: vi.fn()
  };
}

function fakeEnv(): WorkerEnv {
  return {
    WENVY_DB: { connectionString: "postgres://user:pass@example.com/db" } as Hyperdrive,
    WENVY_BLOBS: {} as R2Bucket,
    WENVY_LOGS: {} as R2Bucket,
    WENVY_CONFIG_CACHE: {} as KVNamespace,
    AUTH_TOKEN_COORDINATOR: {} as DurableObjectNamespace,
    REPO_BRANCH_COORDINATOR: {} as DurableObjectNamespace,
    RATE_LIMIT_COORDINATOR: {} as DurableObjectNamespace,
    GITHUB_DELIVERY_COORDINATOR: {} as DurableObjectNamespace,
    GITHUB_SYNC_QUEUE: fakeQueue(),
    AUDIT_QUEUE: fakeQueue(),
    ENVELOPE_CHECK_QUEUE: fakeQueue(),
    EMAIL_QUEUE: fakeQueue(),
    ROTATION_QUEUE: fakeQueue(),
    KEY_ROTATION_WORKFLOW: {
      create: vi.fn(async () => ({ id: "workflow-instance" }))
    }
  };
}

function fakeQueue<T>(): Queue<T> {
  return {
    send: vi.fn(async () => undefined)
  } as unknown as Queue<T>;
}

function fakeExecutionContext(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    props: {}
  };
}
