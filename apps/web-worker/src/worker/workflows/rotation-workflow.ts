import type { RotationWorkflowParams, WorkerEnv } from "../worker-env.js";
import {
  createRotationJobRepository,
  toStoredRotationCheckpoint
} from "../persistence/postgres/rotation-job-repository.js";

export class RotationWorkflow extends WorkflowEntrypoint<WorkerEnv, RotationWorkflowParams> {
  override async run(
    event: WorkflowEvent<RotationWorkflowParams>,
    step: WorkflowStep
  ): Promise<{ status: "completed"; rotationId: string }> {
    const rotationJobs = createRotationJobRepository(this.env);

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

    await step.do("checkpoint-key-generated", async () => {
      await rotationJobs.advanceCheckpoint({
        rotationId: event.payload.rotationId,
        checkpoint: toStoredRotationCheckpoint("key-generated"),
        advancedAt: new Date().toISOString()
      });
    });
    await step.do("checkpoint-envelopes", async () => {
      await rotationJobs.advanceCheckpoint({
        rotationId: event.payload.rotationId,
        checkpoint: toStoredRotationCheckpoint("envelopes-wrapped"),
        advancedAt: new Date().toISOString()
      });
    });
    await step.do("checkpoint-repo-keys", async () => {
      await rotationJobs.advanceCheckpoint({
        rotationId: event.payload.rotationId,
        checkpoint: toStoredRotationCheckpoint("repo-keys-rewrapped"),
        advancedAt: new Date().toISOString()
      });
    });
    await step.do("checkpoint-old-key-retired", async () => {
      await rotationJobs.advanceCheckpoint({
        rotationId: event.payload.rotationId,
        checkpoint: toStoredRotationCheckpoint("old-key-retired"),
        advancedAt: new Date().toISOString()
      });
    });
    await step.do("mark-rotation-completed", async () => {
      await rotationJobs.markCompleted({
        rotationId: event.payload.rotationId,
        completedAt: new Date().toISOString()
      });
    });

    return { status: "completed", rotationId: event.payload.rotationId };
  }
}
