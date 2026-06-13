import type { WorkerEnv } from "../worker-env.js";
import {
  auditEventRecordFromMessage,
  createAuditEventRepository,
  isAuditEventMessage,
  type AuditEventRepository
} from "../persistence/postgres/audit-event-repository.js";

interface QueueDispatchOptions {
  readonly auditEventRepository?: AuditEventRepository;
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
      await acknowledgeBatch(batch);
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
