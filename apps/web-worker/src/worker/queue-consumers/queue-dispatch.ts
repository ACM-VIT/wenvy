import type { WorkerEnv } from "../worker-env.js";

export async function dispatchQueue(
  batch: MessageBatch<unknown>,
  env: WorkerEnv,
  _ctx: ExecutionContext
): Promise<void> {
  switch (batch.queue) {
    case "wenvy-github-sync-dev":
      await acknowledgeBatch(batch);
      return;
    case "wenvy-audit-dev":
      await acknowledgeBatch(batch);
      return;
    case "wenvy-envelope-check-dev":
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
