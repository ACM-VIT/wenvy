import { applyPushIntent, emptyBranchPushState, type BranchPushState } from "@wenvy/domain";

interface WriteIntentInput {
  readonly expectedHead: string | null;
  readonly nextCommit: string;
  readonly idempotencyKey: string;
  readonly payloadFingerprint?: string;
}

export class RepoBranchCoordinator implements DurableObject {
  private readonly ctx: DurableObjectState;

  constructor(ctx: DurableObjectState, env: unknown) {
    void env;
    this.ctx = ctx;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/write-intent") {
      return Response.json({ error: "not-found" }, { status: 404 });
    }

    const input = (await request.json()) as WriteIntentInput;
    const state = await this.getBranchState();
    const decision = applyPushIntent(state, input);
    await this.ctx.storage.put("branch-state", decision.state);

    return Response.json(decision, {
      status:
        decision.status === "conflict" || decision.status === "idempotency-conflict" ? 409 : 200
    });
  }

  private async getBranchState(): Promise<BranchPushState> {
    return (await this.ctx.storage.get<BranchPushState>("branch-state")) ?? emptyBranchPushState;
  }
}
