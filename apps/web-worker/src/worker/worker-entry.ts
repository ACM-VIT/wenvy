import { createHonoApp } from "./hono-app.js";
import { AuthTokenCoordinator } from "./durable-objects/auth-token-coordinator.js";
import { RepoBranchCoordinator } from "./durable-objects/repo-branch-coordinator.js";
import { dispatchQueue } from "./queue-consumers/queue-dispatch.js";
import { RotationWorkflow } from "./workflows/rotation-workflow.js";
import type { WorkerEnv } from "./worker-env.js";

const app = createHonoApp();

export { AuthTokenCoordinator, RepoBranchCoordinator, RotationWorkflow };

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },
  queue(batch: MessageBatch<unknown>, env: WorkerEnv, ctx: ExecutionContext): Promise<void> {
    return dispatchQueue(batch, env, ctx);
  },
  async scheduled(_event: ScheduledEvent, env: WorkerEnv): Promise<void> {
    await env.ENVELOPE_CHECK_QUEUE.send({
      scopeType: "team",
      scopeId: "scheduled-envelope-check",
      requestedAt: new Date().toISOString()
    });
  }
};
