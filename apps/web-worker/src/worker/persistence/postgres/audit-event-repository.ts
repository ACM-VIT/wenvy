import { Client } from "pg";
import type { AuditEventMessage, WorkerEnv } from "../../worker-env.js";

export type StoredAuditActorType = "user" | "service_account" | "github_app" | "system";

export interface AuditEventRecord {
  readonly id: string;
  readonly organizationId: string | null;
  readonly actorUserId: string | null;
  readonly actorServiceAccountId: string | null;
  readonly actorType: StoredAuditActorType;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly result: "success" | "denied" | "failed";
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface AuditEventRepository {
  appendMany(events: readonly AuditEventRecord[]): Promise<void>;
}

export class PostgresAuditEventRepository implements AuditEventRepository {
  constructor(private readonly connectionString: string) {}

  async appendMany(events: readonly AuditEventRecord[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    const client = new Client({ connectionString: this.connectionString });
    await client.connect();
    try {
      await client.query("BEGIN");
      for (const event of events) {
        await client.query(insertAuditEventSql, auditEventValues(event));
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      await client.end();
    }
  }
}

export function createAuditEventRepository(env: WorkerEnv): AuditEventRepository {
  return new PostgresAuditEventRepository(env.WENVY_DB.connectionString);
}

export function auditEventRecordFromMessage(message: AuditEventMessage): AuditEventRecord {
  return {
    id: crypto.randomUUID(),
    organizationId: message.organizationId ?? null,
    actorUserId: message.actorUserId ?? null,
    actorServiceAccountId: message.actorServiceAccountId ?? null,
    actorType: normalizeActorType(message.actorType),
    action: message.action,
    targetType: message.targetType,
    targetId: message.targetId,
    result: message.result,
    ipAddress: message.ipAddress ?? null,
    userAgent: message.userAgent ?? null,
    metadata: message.metadata ?? {},
    createdAt: message.occurredAt
  };
}

export function isAuditEventMessage(value: unknown): value is AuditEventMessage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<AuditEventMessage>;
  return (
    typeof candidate.action === "string" &&
    isAuditResult(candidate.result) &&
    isActorType(candidate.actorType) &&
    typeof candidate.targetType === "string" &&
    typeof candidate.targetId === "string" &&
    typeof candidate.occurredAt === "string"
  );
}

export function normalizeActorType(actorType: AuditEventMessage["actorType"]): StoredAuditActorType {
  switch (actorType) {
    case "service-account":
      return "service_account";
    case "github-app":
      return "github_app";
    case "system":
    case "user":
      return actorType;
  }
}

const insertAuditEventSql = `
INSERT INTO audit_events (
  id,
  organization_id,
  actor_user_id,
  actor_service_account_id,
  actor_type,
  action,
  target_type,
  target_id,
  result,
  ip_address,
  user_agent,
  metadata,
  created_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13
)
ON CONFLICT (id) DO NOTHING
`;

function auditEventValues(event: AuditEventRecord): unknown[] {
  return [
    event.id,
    event.organizationId,
    event.actorUserId,
    event.actorServiceAccountId,
    event.actorType,
    event.action,
    event.targetType,
    event.targetId,
    event.result,
    event.ipAddress,
    event.userAgent,
    JSON.stringify(event.metadata),
    event.createdAt
  ];
}

function isAuditResult(value: unknown): value is AuditEventMessage["result"] {
  return value === "success" || value === "denied" || value === "failed";
}

function isActorType(value: unknown): value is AuditEventMessage["actorType"] {
  return value === "user" || value === "service-account" || value === "github-app" || value === "system";
}
