import { describe, expect, it } from "vitest";
import { recordGithubDelivery } from "@wenvy/domain";

describe("GitHub delivery dedupe regression", () => {
  it("persists accepted delivery and deduplicates repeated delivery id", () => {
    const first = recordGithubDelivery(
      { receipts: {} },
      {
        deliveryId: "delivery-1",
        event: "membership",
        receivedAt: "2026-06-13T12:00:00.000Z",
        payloadSha256: "a".repeat(64),
        signatureValid: true
      }
    );
    const duplicate = recordGithubDelivery(first.state, {
      deliveryId: "delivery-1",
      event: "membership",
      receivedAt: "2026-06-13T12:00:01.000Z",
      payloadSha256: "a".repeat(64),
      signatureValid: true
    });

    expect(first.receipt.status).toBe("accepted");
    expect(duplicate.receipt.status).toBe("duplicate");
    expect(Object.keys(duplicate.state.receipts)).toHaveLength(1);
  });

  it("rejects replayed delivery id with a different payload hash", () => {
    const first = recordGithubDelivery(
      { receipts: {} },
      {
        deliveryId: "delivery-1",
        event: "membership",
        receivedAt: "2026-06-13T12:00:00.000Z",
        payloadSha256: "a".repeat(64),
        signatureValid: true
      }
    );
    const replay = recordGithubDelivery(first.state, {
      deliveryId: "delivery-1",
      event: "membership",
      receivedAt: "2026-06-13T12:00:01.000Z",
      payloadSha256: "b".repeat(64),
      signatureValid: true
    });

    expect(replay.receipt.status).toBe("delivery-replay");
    expect(replay.state).toBe(first.state);
  });

  it("persists invalid signature receipt without accepting it", () => {
    const result = recordGithubDelivery(
      { receipts: {} },
      {
        deliveryId: "delivery-invalid",
        event: "membership",
        receivedAt: "2026-06-13T12:00:00.000Z",
        payloadSha256: "c".repeat(64),
        signatureValid: false
      }
    );

    expect(result.receipt.status).toBe("invalid-signature");
    expect(result.state.receipts["delivery-invalid"]?.payloadSha256).toBe("c".repeat(64));
  });
});
