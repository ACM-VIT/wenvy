import { consumeSingleUseToken, type SingleUseTokenState } from "@wenvy/domain";

export class AuthTokenCoordinator implements DurableObject {
  private readonly ctx: DurableObjectState;

  constructor(ctx: DurableObjectState, env: unknown) {
    void env;
    this.ctx = ctx;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/register") {
      return this.register(request);
    }
    if (request.method === "POST" && url.pathname === "/consume") {
      return this.consume(request);
    }
    return Response.json({ error: "not-found" }, { status: 404 });
  }

  private async register(request: Request): Promise<Response> {
    const input = (await request.json()) as SingleUseTokenState;
    await this.ctx.storage.put<SingleUseTokenState>("token", input);
    return Response.json({ registered: true });
  }

  private async consume(request: Request): Promise<Response> {
    const input = (await request.json()) as {
      readonly browserFingerprintHash?: string;
      readonly ipAddress?: string;
    };
    const token = await this.ctx.storage.get<SingleUseTokenState>("token");
    if (!token) {
      return Response.json({ status: "missing" }, { status: 404 });
    }

    const result = consumeSingleUseToken({
      token,
      now: new Date(),
      ...(input.browserFingerprintHash ? { browserFingerprintHash: input.browserFingerprintHash } : {}),
      ...(input.ipAddress ? { ipAddress: input.ipAddress } : {})
    });

    if (result.status === "consumed") {
      await this.ctx.storage.put<SingleUseTokenState>("token", {
        ...token,
        usedAt: result.consumedAt
      });
    }

    return Response.json(result, { status: result.status === "consumed" ? 200 : 409 });
  }
}
