import type { WorkerEnv } from "../worker-env.js";
import {
  auditEventRecordFromMessage,
  createAuditEventRepository,
  isAuditEventMessage,
  type AuditEventRepository
} from "../persistence/postgres/audit-event-repository.js";
import {
  createRotationJobRepository,
  isRotationWorkflowParams,
  type RotationJobRepository
} from "../persistence/postgres/rotation-job-repository.js";

interface QueueDispatchOptions {
  readonly auditEventRepository?: AuditEventRepository;
  readonly rotationJobRepository?: RotationJobRepository;
}

export async function dispatchQueue(
  batch: MessageBatch<unknown>,
  env: WorkerEnv,
  _ctx: ExecutionContext,
  options: QueueDispatchOptions = {}
): Promise<void> {
  switch (batch.queue) {
    case "wenvy-github-sync-dev":
      await acknowledgeBatch(batch);
      return;
    case "wenvy-audit-dev":
      await persistAuditBatch(batch, options.auditEventRepository ?? createAuditEventRepository(env));
      return;
    case "wenvy-envelope-check-dev":
      await acknowledgeBatch(batch);
      return;
    case "wenvy-email-dev":
      await acknowledgeBatch(batch);
      return;
    case "wenvy-rotation-dev":
      await processRotationBatch(batch, env, options.rotationJobRepository ?? createRotationJobRepository(env));
      return;
    default:
      await env.AUDIT_QUEUE.send({
        action: "queue.unknown",
        actorType: "system",
        result: "failed",
        targetType: "queue",
        targetId: batch.queue,
        occurredAt: new Date().toISOString()
      });
      await acknowledgeBatch(batch);
  }
}

async function processRotationBatch(
  batch: MessageBatch<unknown>,
  env: WorkerEnv,
  repository: RotationJobRepository
): Promise<void> {
  for (const message of batch.messages) {
    if (!isRotationWorkflowParams(message.body)) {
      message.retry({ delaySeconds: 60 });
      continue;
    }

    try {
      const now = new Date().toISOString();
      const enqueueDecision = await repository.enqueue({
        rotationId: message.body.rotationId,
        scopeType: message.body.scopeType,
        scopeId: message.body.scopeId,
        queueMessageId: message.id,
        queuedAt: message.body.requestedAt ?? now
      });
      if (enqueueDecision.status === "already-running" || enqueueDecision.status === "already-completed") {
        message.ack();
        continue;
      }
      if (enqueueDecision.status === "conflict") {
        message.retry({ delaySeconds: 60 });
        continue;
      }
      const instance = await env.KEY_ROTATION_WORKFLOW.create({
        id: message.body.rotationId,
        params: message.body
      });
      await repository.markWorkflowStarted({
        rotationId: message.body.rotationId,
        workflowInstanceId: instance.id,
        startedAt: now
      });
      message.ack();
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "unknown rotation queue failure";
      message.retry({ delaySeconds: 30 });
      try {
        await repository.markFailed({
          rotationId: message.body.rotationId,
          errorSummary: messageText.slice(0, 500),
          failedAt: new Date().toISOString()
        });
      } catch {
        // Keep the original queue failure as the thrown error. The explicit retry above is what prevents loss.
      }
      throw error;
    }
  }
}

async function acknowledgeBatch(batch: MessageBatch<unknown>): Promise<void> {
  for (const message of batch.messages) {
    message.ack();
  }
}

async function persistAuditBatch(
  batch: MessageBatch<unknown>,
  repository: AuditEventRepository
): Promise<void> {
  const records = [];
  for (const message of batch.messages) {
    if (!isAuditEventMessage(message.body)) {
      message.retry({ delaySeconds: 60 });
      continue;
    }
    records.push(auditEventRecordFromMessage(message.body));
  }

  if (records.length === 0) {
    return;
  }

  try {
    await repository.appendMany(records);
  } catch (error) {
    batch.retryAll({ delaySeconds: 30 });
    throw error;
  }

  for (const message of batch.messages) {
    if (isAuditEventMessage(message.body)) {
      message.ack();
    }
  }
}
