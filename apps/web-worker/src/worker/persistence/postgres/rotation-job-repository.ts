import { Client } from "pg";
import type { RotationWorkflowParams, WorkerEnv } from "../../worker-env.js";

export type RotationJobStatus = "queued" | "running" | "completed" | "failed";
export type StoredRotationCheckpoint =
  | "queued"
  | "key_generated"
  | "envelopes_wrapped"
  | "repo_keys_rewrapped"
  | "old_key_retired"
  | "completed";

export interface QueuedRotationJobRecord {
  readonly rotationId: string;
  readonly scopeType: "team" | "repo";
  readonly scopeId: string;
  readonly queueMessageId: string;
  readonly queuedAt: string;
}

export interface StartedRotationWorkflowRecord {
  readonly rotationId: string;
  readonly workflowInstanceId: string;
  readonly startedAt: string;
}

export interface FailedRotationJobRecord {
  readonly rotationId: string;
  readonly errorSummary: string;
  readonly failedAt: string;
}

export interface RotationCheckpointRecord {
  readonly rotationId: string;
  readonly checkpoint: StoredRotationCheckpoint;
  readonly advancedAt: string;
}

export interface CompletedRotationJobRecord {
  readonly rotationId: string;
  readonly completedAt: string;
}

export type RotationEnqueueDecision =
  | {
      readonly status: "queued";
    }
  | {
      readonly status: "already-running" | "already-completed";
    }
  | {
      readonly status: "conflict";
      readonly currentStatus: RotationJobStatus;
    };

export interface RotationJobRepository {
  enqueue(record: QueuedRotationJobRecord): Promise<RotationEnqueueDecision>;
  markWorkflowStarted(record: StartedRotationWorkflowRecord): Promise<void>;
  advanceCheckpoint(record: RotationCheckpointRecord): Promise<void>;
  markCompleted(record: CompletedRotationJobRecord): Promise<void>;
  markFailed(record: FailedRotationJobRecord): Promise<void>;
}

export class PostgresRotationJobRepository implements RotationJobRepository {
  constructor(private readonly connectionString: string) {}

  async enqueue(record: QueuedRotationJobRecord): Promise<RotationEnqueueDecision> {
    const client = new Client({ connectionString: this.connectionString });
    await client.connect();
    try {
      const result = await client.query<{ status: RotationJobStatus }>(enqueueRotationJobSql, [
        record.rotationId,
        record.scopeType,
        record.scopeId,
        record.queueMessageId,
        record.queuedAt,
        record.queuedAt
      ]);
      const currentStatus = result.rows[0]?.status;
      if (currentStatus === "queued") {
        return { status: "queued" };
      }
      if (currentStatus === "running") {
        return { status: "already-running" };
      }
      if (currentStatus === "completed") {
        return { status: "already-completed" };
      }
      return { status: "conflict", currentStatus: currentStatus ?? "failed" };
    } finally {
      await client.end();
    }
  }

  async markWorkflowStarted(record: StartedRotationWorkflowRecord): Promise<void> {
    const client = new Client({ connectionString: this.connectionString });
    await client.connect();
    try {
      const result = await client.query(markWorkflowStartedSql, [
        record.rotationId,
        record.workflowInstanceId,
        record.startedAt
      ]);
      if (result.rowCount !== 1) {
        throw new Error(`rotation job ${record.rotationId} was not ready to start`);
      }
    } finally {
      await client.end();
    }
  }

  async advanceCheckpoint(record: RotationCheckpointRecord): Promise<void> {
    const client = new Client({ connectionString: this.connectionString });
    await client.connect();
    try {
      const result = await client.query(advanceCheckpointSql, [
        record.rotationId,
        record.checkpoint,
        record.advancedAt
      ]);
      if (result.rowCount !== 1) {
        throw new Error(`rotation job ${record.rotationId} checkpoint was not advanced`);
      }
    } finally {
      await client.end();
    }
  }

  async markCompleted(record: CompletedRotationJobRecord): Promise<void> {
    const client = new Client({ connectionString: this.connectionString });
    await client.connect();
    try {
      const result = await client.query(markCompletedSql, [
        record.rotationId,
        record.completedAt
      ]);
      if (result.rowCount !== 1) {
        throw new Error(`rotation job ${record.rotationId} was not completed`);
      }
    } finally {
      await client.end();
    }
  }

  async markFailed(record: FailedRotationJobRecord): Promise<void> {
    const client = new Client({ connectionString: this.connectionString });
    await client.connect();
    try {
      await client.query(markFailedSql, [
        record.rotationId,
        record.errorSummary,
        record.failedAt
      ]);
    } finally {
      await client.end();
    }
  }
}

export function createRotationJobRepository(env: WorkerEnv): RotationJobRepository {
  return new PostgresRotationJobRepository(env.WENVY_DB.connectionString);
}

export function isRotationWorkflowParams(value: unknown): value is RotationWorkflowParams {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<RotationWorkflowParams>;
  return (
    typeof candidate.rotationId === "string" &&
    (candidate.scopeType === "team" || candidate.scopeType === "repo") &&
    typeof candidate.scopeId === "string" &&
    (candidate.requestedAt === undefined || typeof candidate.requestedAt === "string")
  );
}

export function toStoredRotationCheckpoint(checkpoint: string): StoredRotationCheckpoint {
  switch (checkpoint) {
    case "queued":
      return "queued";
    case "key-generated":
      return "key_generated";
    case "envelopes-wrapped":
      return "envelopes_wrapped";
    case "repo-keys-rewrapped":
      return "repo_keys_rewrapped";
    case "old-key-retired":
      return "old_key_retired";
    case "completed":
      return "completed";
    default:
      throw new Error(`unknown rotation checkpoint: ${checkpoint}`);
  }
}

const enqueueRotationJobSql = `
WITH upserted AS (
INSERT INTO rotation_jobs (
  id,
  scope_type,
  scope_id,
  status,
  checkpoint,
  progress_detail,
  queue_message_id,
  retry_count,
  max_retries,
  created_at,
  updated_at
) VALUES (
  $1, $2, $3, 'queued', 'queued', '{}'::jsonb, $4, 0, 3, $5, $6
)
ON CONFLICT (id) DO UPDATE SET
  status = 'queued',
  checkpoint = 'queued',
  queue_message_id = EXCLUDED.queue_message_id,
  error_summary = NULL,
  updated_at = EXCLUDED.updated_at
WHERE rotation_jobs.status IN ('queued', 'failed')
RETURNING status
)
SELECT status FROM upserted
UNION ALL
SELECT status FROM rotation_jobs
WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM upserted)
LIMIT 1
`;

const markWorkflowStartedSql = `
UPDATE rotation_jobs
SET
  status = 'running',
  workflow_instance_id = $2,
  started_at = COALESCE(started_at, $3),
  updated_at = $3,
  error_summary = NULL
WHERE id = $1 AND status IN ('queued', 'failed')
`;

const advanceCheckpointSql = `
UPDATE rotation_jobs
SET
  checkpoint = $2,
  updated_at = $3
WHERE id = $1
  AND status = 'running'
  AND CASE checkpoint
    WHEN 'queued' THEN 0
    WHEN 'key_generated' THEN 1
    WHEN 'envelopes_wrapped' THEN 2
    WHEN 'repo_keys_rewrapped' THEN 3
    WHEN 'old_key_retired' THEN 4
    WHEN 'completed' THEN 5
  END <= CASE $2
    WHEN 'queued' THEN 0
    WHEN 'key_generated' THEN 1
    WHEN 'envelopes_wrapped' THEN 2
    WHEN 'repo_keys_rewrapped' THEN 3
    WHEN 'old_key_retired' THEN 4
    WHEN 'completed' THEN 5
  END
`;

const markCompletedSql = `
UPDATE rotation_jobs
SET
  status = 'completed',
  checkpoint = 'completed',
  finished_at = COALESCE(finished_at, $2),
  updated_at = $2
WHERE id = $1 AND status = 'running'
`;

const markFailedSql = `
UPDATE rotation_jobs
SET
  status = 'failed',
  error_summary = $2,
  retry_count = retry_count + 1,
  updated_at = $3
WHERE id = $1
`;
