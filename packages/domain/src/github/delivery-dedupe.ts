export interface GithubDeliveryReceipt {
  readonly deliveryId: string;
  readonly event: string;
  readonly receivedAt: string;
  readonly payloadSha256: string;
  readonly status: "accepted" | "duplicate" | "delivery-replay" | "invalid-signature";
}

export interface DeliveryDedupeState {
  readonly receipts: Readonly<Record<string, GithubDeliveryReceipt>>;
}

export function recordGithubDelivery(
  state: DeliveryDedupeState,
  input: Omit<GithubDeliveryReceipt, "status"> & { readonly signatureValid: boolean }
): { readonly state: DeliveryDedupeState; readonly receipt: GithubDeliveryReceipt } {
  const existing = state.receipts[input.deliveryId];
  if (existing) {
    const receipt: GithubDeliveryReceipt = {
      ...existing,
      status: existing.payloadSha256 === input.payloadSha256 ? "duplicate" : "delivery-replay"
    };
    return { state, receipt };
  }

  const receipt: GithubDeliveryReceipt = {
    deliveryId: input.deliveryId,
    event: input.event,
    receivedAt: input.receivedAt,
    payloadSha256: input.payloadSha256,
    status: input.signatureValid ? "accepted" : "invalid-signature"
  };

  return {
    state: {
      receipts: {
        ...state.receipts,
        [input.deliveryId]: receipt
      }
    },
    receipt
  };
}
