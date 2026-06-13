interface RateLimitInput {
  readonly key: string;
  readonly limit: number;
  readonly windowSeconds: number;
  readonly nowEpochSeconds: number;
}

interface RateLimitBucket {
  readonly windowStart: number;
  readonly count: number;
}

export class RateLimitCoordinator implements DurableObject {
  private readonly ctx: DurableObjectState;

  constructor(ctx: DurableObjectState, env: unknown) {
    void env;
    this.ctx = ctx;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/consume") {
      return Response.json({ error: "not-found" }, { status: 404 });
    }

    const input = (await request.json()) as RateLimitInput;
    const bucketKey = `rate:${input.key}`;
    const current = await this.ctx.storage.get<RateLimitBucket>(bucketKey);
    const windowStart = Math.floor(input.nowEpochSeconds / input.windowSeconds) * input.windowSeconds;
    const next =
      current && current.windowStart === windowStart
        ? { windowStart, count: current.count + 1 }
        : { windowStart, count: 1 };

    await this.ctx.storage.put(bucketKey, next);

    return Response.json(
      {
        allowed: next.count <= input.limit,
        remaining: Math.max(input.limit - next.count, 0),
        resetAtEpochSeconds: windowStart + input.windowSeconds
      },
      { status: next.count <= input.limit ? 200 : 429 }
    );
  }
}
