export interface SnapshotObjectKeyInput {
  readonly commitId: string;
  readonly ciphertextSha256: string;
}

const opaqueIdPattern = /^[A-Za-z0-9_-]{16,128}$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;

export function createSnapshotObjectKey(input: SnapshotObjectKeyInput): string {
  if (!opaqueIdPattern.test(input.commitId)) {
    throw new Error("commitId must be an opaque identifier");
  }
  if (!sha256Pattern.test(input.ciphertextSha256)) {
    throw new Error("ciphertextSha256 must be a lowercase SHA-256 hex digest");
  }

  const shard = input.ciphertextSha256.slice(0, 2);
  return `snapshots/${shard}/${input.commitId}/${input.ciphertextSha256}.enc`;
}

export function assertOpaqueSnapshotObjectKey(key: string): void {
  if (!/^snapshots\/[a-f0-9]{2}\/[A-Za-z0-9_-]{16,128}\/[a-f0-9]{64}\.enc$/u.test(key)) {
    throw new Error("Invalid snapshot object key shape");
  }
}
