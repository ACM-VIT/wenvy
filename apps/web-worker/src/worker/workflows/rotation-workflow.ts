import type { RotationWorkflowParams, WorkerEnv } from "../worker-env.js";

export class RotationWorkflow extends WorkflowEntrypoint<WorkerEnv, RotationWorkflowParams> {
  override async run(
    event: WorkflowEvent<RotationWorkflowParams>,
    step: WorkflowStep
  ): Promise<{ status: "completed"; rotationId: string }> {
    await step.do("record-rotation-start", async () => {
      await this.env.AUDIT_QUEUE.send({
        action: "rotation.started",
        actorType: "system",
        result: "success",
        targetType: event.payload.scopeType,
        targetId: event.payload.scopeId,
        occurredAt: new Date().toISOString()
      });
    });

    await step.do("checkpoint-envelopes", async () => undefined);
    await step.do("checkpoint-repo-keys", async () => undefined);
    await step.do("checkpoint-old-key-retired", async () => undefined);

    return { status: "completed", rotationId: event.payload.rotationId };
  }
}
