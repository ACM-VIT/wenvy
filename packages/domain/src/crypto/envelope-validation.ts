export interface EnvelopeValidationResult {
  readonly valid: boolean;
  readonly reasons: readonly string[];
}

const forbiddenPlaintextKeys = [
  "plaintext",
  "plainText",
  "secret",
  "secretValue",
  "secret_value",
  "rawKey",
  "teamKey",
  "repoKey",
  "privateKey",
  "value",
  "env",
  "environment"
] as const;

const requiredCiphertextKeys = ["encryptedTeamKey", "encryptedRepoKey", "ciphertext"] as const;

export function validateEnvelopePayload(payload: unknown): EnvelopeValidationResult {
  const reasons: string[] = [];

  if (!isRecord(payload)) {
    return { valid: false, reasons: ["payload-not-object"] };
  }

  collectForbiddenKeys(payload, [], reasons);

  const hasCiphertextMaterial = requiredCiphertextKeys.some(
    (key) => typeof payload[key] === "string" && payload[key].length > 0
  );
  if (!hasCiphertextMaterial) {
    reasons.push("missing-ciphertext-material");
  }

  return { valid: reasons.length === 0, reasons };
}

function collectForbiddenKeys(
  value: unknown,
  path: readonly string[],
  reasons: string[]
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectForbiddenKeys(item, [...path, String(index)], reasons));
    return;
  }

  if (!isRecord(value)) return;

  for (const [key, child] of Object.entries(value)) {
    if ((forbiddenPlaintextKeys as readonly string[]).includes(key)) {
      if (!reasons.includes("plaintext-not-allowed")) {
        reasons.push("plaintext-not-allowed");
      }
      reasons.push(`forbidden-plaintext-key:${[...path, key].join(".")}`);
    }
    collectForbiddenKeys(child, [...path, key], reasons);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
