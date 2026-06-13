import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertOpaqueSnapshotObjectKey,
  consumeSingleUseToken,
  createSnapshotObjectKey,
  hmacSha256Hex,
  verifyGithubWebhookSignature,
  advanceRotationCheckpoint,
  markRepoKeyRewrapped
} from "@wenvy/domain";

describe("security primitive regression", () => {
  it("consumes one-time tokens once and rejects browser or IP mismatch", () => {
    const token = {
      tokenHash: "hash",
      expiresAt: "2026-06-13T00:10:00.000Z",
      browserFingerprintHash: "browser",
      issuedIp: "203.0.113.10"
    };
    const now = new Date("2026-06-13T00:00:00.000Z");

    expect(
      consumeSingleUseToken({
        token,
        now,
        browserFingerprintHash: "browser",
        ipAddress: "203.0.113.10"
      }).status
    ).toBe("consumed");
    expect(
      consumeSingleUseToken({
        token,
        now,
        browserFingerprintHash: "other",
        ipAddress: "203.0.113.10"
      }).status
    ).toBe("browser-mismatch");
    expect(
      consumeSingleUseToken({
        token,
        now,
        browserFingerprintHash: "browser",
        ipAddress: "203.0.113.11"
      }).status
    ).toBe("ip-mismatch");
  });

  it("uses opaque R2 object keys without org repo branch or secret names", () => {
    const key = createSnapshotObjectKey({
      commitId: "commit_01JY7X0WENVYTESTID",
      ciphertextSha256: "a".repeat(64)
    });

    assertOpaqueSnapshotObjectKey(key);
    expect(key).not.toContain("acm-vit");
    expect(key).not.toContain("production");
    expect(key).not.toContain("DATABASE_URL");
  });

  it("verifies GitHub webhook signatures over the raw body", async () => {
    const secret = "webhook-secret";
    const rawBody = '{"zen":"Keep it logically awesome."}';
    const signature = createHmac("sha256", secret).update(rawBody).digest("hex");

    await expect(hmacSha256Hex(secret, rawBody)).resolves.toBe(signature);
    await expect(
      verifyGithubWebhookSignature({
        secret,
        rawBody,
        signatureHeader: `sha256=${signature}`
      })
    ).resolves.toBe(true);
    await expect(
      verifyGithubWebhookSignature({
        secret,
        rawBody: JSON.stringify(JSON.parse(rawBody), null, 2),
        signatureHeader: `sha256=${signature}`
      })
    ).resolves.toBe(false);
  });

  it("advances rotation checkpoints idempotently", () => {
    const state = {
      id: "rotation_01JY7X0WENVYTEST",
      scopeType: "team" as const,
      scopeId: "team_01JY7X0WENVYTEST",
      checkpoint: "key-generated" as const,
      completedRepoKeyIds: ["repo-key-1"]
    };

    expect(advanceRotationCheckpoint(state, "queued")).toBe(state);
    expect(advanceRotationCheckpoint(state, "envelopes-wrapped").checkpoint).toBe(
      "envelopes-wrapped"
    );
    expect(markRepoKeyRewrapped(state, "repo-key-1")).toBe(state);
    expect(markRepoKeyRewrapped(state, "repo-key-2").completedRepoKeyIds).toEqual([
      "repo-key-1",
      "repo-key-2"
    ]);
  });
});
