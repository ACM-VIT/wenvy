export interface CanonicalSnapshot {
  readonly canonicalText: string;
  readonly sha256Hex: string;
}

export type SnapshotInput = string | Readonly<Record<string, string>>;

export async function canonicalizeEnvSnapshot(input: SnapshotInput): Promise<CanonicalSnapshot> {
  const entries = typeof input === "string" ? parseEnvText(input) : Object.entries(input);
  const normalizedEntries = entries
    .map(([key, value]) => [normalizeKey(key), encodeValue(value)] as const)
    .sort(([leftKey], [rightKey]) => compareUtf8(leftKey, rightKey));

  const canonicalText = `${normalizedEntries
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")}\n`;

  return {
    canonicalText,
    sha256Hex: await sha256Hex(canonicalText)
  };
}

export function parseEnvText(input: string): Array<[string, string]> {
  return input
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "" && !line.trimStart().startsWith("#"))
    .map((line) => {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) {
        throw new Error("Invalid env line without '=' separator");
      }
      return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
    });
}

export function encodeValue(value: string): string {
  if (!requiresBase64(value)) return value;
  return `b64:${bytesToBase64(new TextEncoder().encode(value))}`;
}

export function requiresBase64(value: string): boolean {
  return /[\n=\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(value);
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return bytesToHex(new Uint8Array(digest));
}

function normalizeKey(key: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) {
    throw new Error(`Invalid env key: ${key}`);
  }
  return key;
}

function compareUtf8(left: string, right: string): number {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    const diff = leftBytes[index]! - rightBytes[index]!;
    if (diff !== 0) return diff;
  }
  return leftBytes.length - rightBytes.length;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
