import {
  recordGithubDelivery,
  type DeliveryDedupeState,
  type GithubDeliveryReceipt
} from "@wenvy/domain";

export class GithubDeliveryCoordinator implements DurableObject {
  private readonly ctx: DurableObjectState;

  constructor(ctx: DurableObjectState, env: unknown) {
    void env;
    this.ctx = ctx;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/record") {
      return Response.json({ error: "not-found" }, { status: 404 });
    }

    const input = (await request.json()) as {
      readonly deliveryId: string;
      readonly event: string;
      readonly receivedAt: string;
      readonly payloadSha256: string;
      readonly signatureValid: boolean;
    };
    const currentState =
      (await this.ctx.storage.get<DeliveryDedupeState>("delivery-state")) ?? {
        receipts: {}
      };
    const result = recordGithubDelivery(currentState, input);
    await this.ctx.storage.put("delivery-state", result.state);

    return Response.json(result.receipt, {
      status: statusForReceipt(result.receipt)
    });
  }
}

function statusForReceipt(receipt: GithubDeliveryReceipt): number {
  switch (receipt.status) {
    case "accepted":
      return 202;
    case "duplicate":
      return 200;
    case "delivery-replay":
      return 409;
    case "invalid-signature":
      return 401;
  }
}
