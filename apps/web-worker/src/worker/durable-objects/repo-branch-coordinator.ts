import {
  applyPushCommit,
  applyPushIntent,
  emptyBranchPushState,
  normalizeBranchPushState,
  pullBranch,
  type BranchPushState
} from "@wenvy/domain";

interface WriteIntentInput {
  readonly expectedHead: string | null;
  readonly nextCommit: string;
  readonly idempotencyKey: string;
  readonly payloadFingerprint?: string;
}

interface FinalizePushInput {
  readonly expectedHead: string | null;
  readonly commit: string;
  readonly parentCommit: string | null;
  readonly idempotencyKey: string;
  readonly payloadFingerprint?: string;
  readonly objectKey: string;
  readonly ciphertextSha256: string;
  readonly ciphertextSize: number;
  readonly repoKeyVersion: number;
  readonly createdAt: string;
}

interface PullInput {
  readonly knownHead?: string | null;
}

export class RepoBranchCoordinator implements DurableObject {
  private readonly ctx: DurableObjectState;

  constructor(ctx: DurableObjectState, env: unknown) {
    void env;
    this.ctx = ctx;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST") {
      return Response.json({ error: "not-found" }, { status: 404 });
    }

    if (url.pathname === "/write-intent") {
      const input = (await request.json()) as WriteIntentInput;
      const state = await this.getBranchState();
      const decision = applyPushIntent(state, input);
      await this.ctx.storage.put("branch-state", decision.state);

      return Response.json(decision, {
        status:
          decision.status === "conflict" || decision.status === "idempotency-conflict" ? 409 : 200
      });
    }

    if (url.pathname === "/finalize-push") {
      const input = (await request.json()) as FinalizePushInput;
      const state = await this.getBranchState();
      const decision = applyPushCommit(state, input);
      await this.ctx.storage.put("branch-state", decision.state);

      return Response.json(decision, {
        status:
          decision.status === "committed" || decision.status === "duplicate" ? 200 : 409
      });
    }

    if (url.pathname === "/pull") {
      const input = (await request.json()) as PullInput;
      const state = await this.getBranchState();
      const decision = pullBranch(state, input);

      return Response.json(decision, {
        status: decision.status === "missing-snapshot" ? 409 : 200
      });
    }

    return Response.json({ error: "not-found" }, { status: 404 });
  }

  private async getBranchState(): Promise<BranchPushState> {
    const state = (await this.ctx.storage.get<Partial<BranchPushState>>("branch-state")) ?? emptyBranchPushState;
    return normalizeBranchPushState(state);
  }
}
