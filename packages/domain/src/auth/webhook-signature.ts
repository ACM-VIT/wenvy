export async function verifyGithubWebhookSignature(input: {
  readonly secret: string;
  readonly rawBody: string;
  readonly signatureHeader: string | null;
}): Promise<boolean> {
  if (!input.signatureHeader?.startsWith("sha256=")) return false;
  const expectedHex = input.signatureHeader.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/u.test(expectedHex)) return false;

  const actualHex = await hmacSha256Hex(input.secret, input.rawBody);
  return timingSafeEqualHex(actualHex, expectedHex);
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return bytesToHex(new Uint8Array(signature));
}

export function timingSafeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
