interface WriteIntentInput {
  readonly expectedHead: string | null;
  readonly nextCommit: string;
  readonly idempotencyKey: string;
}

interface BranchState {
  readonly headCommit: string | null;
  readonly idempotencyResults: Record<string, string>;
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

    const duplicateCommit = state.idempotencyResults[input.idempotencyKey];
    if (duplicateCommit) {
      return Response.json({
        status: "duplicate",
        headCommit: state.headCommit,
        commit: duplicateCommit
      });
    }

    if (state.headCommit !== input.expectedHead) {
      return Response.json(
        {
          status: "conflict",
          headCommit: state.headCommit
        },
        { status: 409 }
      );
    }

    const nextState: BranchState = {
      headCommit: input.nextCommit,
      idempotencyResults: {
        ...state.idempotencyResults,
        [input.idempotencyKey]: input.nextCommit
      }
    };
    await this.ctx.storage.put("branch-state", nextState);

    return Response.json({
      status: "accepted",
      headCommit: nextState.headCommit,
      commit: input.nextCommit
    });
  }

  private async getBranchState(): Promise<BranchState> {
    return (
      (await this.ctx.storage.get<BranchState>("branch-state")) ?? {
        headCommit: null,
        idempotencyResults: {}
      }
    );
  }
}
