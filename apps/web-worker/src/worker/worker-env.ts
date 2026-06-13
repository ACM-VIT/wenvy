export interface GithubSyncMessage {
  readonly deliveryId: string;
  readonly event: string;
  readonly receivedAt: string;
  readonly rawBody: string;
}

export interface AuditEventMessage {
  readonly action: string;
  readonly result: "success" | "denied" | "failed";
  readonly actorType: "user" | "service-account" | "github-app" | "system";
  readonly organizationId?: string;
  readonly actorUserId?: string;
  readonly actorServiceAccountId?: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly metadata?: Record<string, unknown>;
  readonly occurredAt: string;
}

export interface EnvelopeCheckMessage {
  readonly scopeType: "team" | "repo";
  readonly scopeId: string;
  readonly requestedAt: string;
}

export interface RotationWorkflowParams {
  readonly rotationId: string;
  readonly scopeType: "team" | "repo";
  readonly scopeId: string;
}

export interface WorkflowInstanceHandle {
  readonly id: string;
}

export interface WorkflowBinding<TParams> {
  create(options: { readonly id?: string; readonly params: TParams }): Promise<WorkflowInstanceHandle>;
}

export interface WorkerEnv {
  readonly WENVY_DB: Hyperdrive;
  readonly WENVY_BLOBS: R2Bucket;
  readonly WENVY_LOGS: R2Bucket;
  readonly WENVY_CONFIG_CACHE: KVNamespace;
  readonly AUTH_TOKEN_COORDINATOR: DurableObjectNamespace;
  readonly REPO_BRANCH_COORDINATOR: DurableObjectNamespace;
  readonly RATE_LIMIT_COORDINATOR: DurableObjectNamespace;
  readonly GITHUB_DELIVERY_COORDINATOR: DurableObjectNamespace;
  readonly GITHUB_SYNC_QUEUE: Queue<GithubSyncMessage>;
  readonly AUDIT_QUEUE: Queue<AuditEventMessage>;
  readonly ENVELOPE_CHECK_QUEUE: Queue<EnvelopeCheckMessage>;
  readonly EMAIL_QUEUE: Queue<unknown>;
  readonly ROTATION_QUEUE: Queue<RotationWorkflowParams>;
  readonly KEY_ROTATION_WORKFLOW: WorkflowBinding<RotationWorkflowParams>;
  readonly GITHUB_WEBHOOK_SECRET?: string;
}
