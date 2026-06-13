import { describe, expect, it } from "vitest";
import { validateEnvelopePayload } from "@wenvy/domain";

describe("envelope boundary regression", () => {
  it("rejects envelope payloads containing plaintext secret fields", () => {
    const result = validateEnvelopePayload({
      encryptedTeamKey: "ciphertext",
      nested: {
        secretValue: "DATABASE_URL=postgres://secret"
      }
    });

    expect(result.valid).toBe(false);
    expect(result.reasons).toContain("plaintext-not-allowed");
    expect(result.reasons).toContain("forbidden-plaintext-key:nested.secretValue");
  });

  it("accepts encrypted envelope metadata without retaining plaintext", () => {
    const result = validateEnvelopePayload({
      encryptedTeamKey: "age1ciphertext",
      algorithm: "age-x25519",
      keyVersion: 1,
      recipientFingerprint: "SHA256:abc"
    });

    expect(result).toEqual({ valid: true, reasons: [] });
  });

  it("rejects payloads without ciphertext material", () => {
    const result = validateEnvelopePayload({
      algorithm: "age-x25519",
      keyVersion: 1
    });

    expect(result.valid).toBe(false);
    expect(result.reasons).toContain("missing-ciphertext-material");
  });
});
