import { describe, expect, it } from "vitest";
import {
  applyPushCommit,
  applyPushIntent,
  emptyBranchPushState,
  pullBranch
} from "@wenvy/domain";

const commitA = "commit_01JY7X0WENVYAAA";
const commitB = "commit_01JY7X0WENVYBBB";
const idemA = "idem_01JY7X0WENVYAAA";
const idemB = "idem_01JY7X0WENVYBBB";
const hashA = "a".repeat(64);
const hashB = "b".repeat(64);

describe("push idempotency regression", () => {
  it("reserves an intent without moving branch head before blob finalization", () => {
    const first = applyPushIntent(emptyBranchPushState, {
      expectedHead: null,
      nextCommit: commitA,
      idempotencyKey: idemA,
      payloadFingerprint: hashA
    });

    expect(first.status).toBe("accepted");
    expect(first.headCommit).toBeNull();
    expect(first.state.headCommit).toBeNull();
    expect(first.state.pendingPushes[idemA]?.commit).toBe(commitA);
    expect(first.state.idempotencyResults[idemA]).toBeUndefined();
  });

  it("returns duplicate intent result without moving branch head", () => {
    const first = applyPushIntent(emptyBranchPushState, {
      expectedHead: null,
      nextCommit: commitA,
      idempotencyKey: idemA,
      payloadFingerprint: hashA
    });
    expect(first.status).toBe("accepted");

    const retry = applyPushIntent(first.state, {
      expectedHead: null,
      nextCommit: commitA,
      idempotencyKey: idemA,
      payloadFingerprint: hashA
    });

    expect(retry.status).toBe("duplicate");
    expect(retry.commit).toBe(commitA);
    expect(retry.headCommit).toBeNull();
    expect(Object.keys(retry.state.pendingPushes)).toHaveLength(1);
  });

  it("finalizes an encrypted snapshot and advances branch head exactly once", () => {
    const first = applyPushIntent(emptyBranchPushState, {
      expectedHead: null,
      nextCommit: commitA,
      idempotencyKey: idemA,
      payloadFingerprint: hashA
    });
    expect(first.status).toBe("accepted");

    const committed = applyPushCommit(first.state, {
      expectedHead: null,
      commit: commitA,
      parentCommit: null,
      idempotencyKey: idemA,
      payloadFingerprint: hashA,
      objectKey: "snapshots/opaque-object-key",
      ciphertextSha256: hashA,
      ciphertextSize: 256,
      repoKeyVersion: 3,
      createdAt: "2026-06-13T12:00:00.000Z"
    });

    expect(committed.status).toBe("committed");
    expect(committed.headCommit).toBe(commitA);
    expect(committed.state.headCommit).toBe(commitA);
    expect(committed.state.pendingPushes[idemA]).toBeUndefined();
    expect(committed.state.idempotencyResults[idemA]?.commit).toBe(commitA);
    expect(committed.snapshot.ciphertextSha256).toBe(hashA);

    const duplicate = applyPushCommit(committed.state, {
      expectedHead: null,
      commit: commitA,
      parentCommit: null,
      idempotencyKey: idemA,
      payloadFingerprint: hashA,
      objectKey: "snapshots/opaque-object-key",
      ciphertextSha256: hashA,
      ciphertextSize: 256,
      repoKeyVersion: 3,
      createdAt: "2026-06-13T12:00:00.000Z"
    });

    expect(duplicate.status).toBe("duplicate");
    expect(duplicate.state).toBe(committed.state);
  });

  it("rejects reused idempotency key with a different push payload", () => {
    const first = applyPushIntent(emptyBranchPushState, {
      expectedHead: null,
      nextCommit: commitA,
      idempotencyKey: idemA,
      payloadFingerprint: hashA
    });
    expect(first.status).toBe("accepted");

    const conflict = applyPushIntent(first.state, {
      expectedHead: null,
      nextCommit: commitB,
      idempotencyKey: idemA,
      payloadFingerprint: hashB
    });

    expect(conflict.status).toBe("idempotency-conflict");
    expect(conflict.headCommit).toBeNull();
    expect(conflict.state).toBe(first.state);
  });

  it("rejects stale expected head before creating pending or finalized metadata", () => {
    const first = applyPushIntent(emptyBranchPushState, {
      expectedHead: null,
      nextCommit: commitA,
      idempotencyKey: idemA,
      payloadFingerprint: hashA
    });
    expect(first.status).toBe("accepted");
    const committed = applyPushCommit(first.state, {
      expectedHead: null,
      commit: commitA,
      parentCommit: null,
      idempotencyKey: idemA,
      payloadFingerprint: hashA,
      objectKey: "snapshots/opaque-object-key",
      ciphertextSha256: hashA,
      ciphertextSize: 256,
      repoKeyVersion: 3,
      createdAt: "2026-06-13T12:00:00.000Z"
    });
    expect(committed.status).toBe("committed");

    const stale = applyPushIntent(committed.state, {
      expectedHead: null,
      nextCommit: commitB,
      idempotencyKey: idemB,
      payloadFingerprint: hashB
    });

    expect(stale.status).toBe("conflict");
    expect(stale.headCommit).toBe(commitA);
    expect(stale.state.pendingPushes[idemB]).toBeUndefined();
  });

  it("returns snapshot metadata only when a pull caller is behind", () => {
    const intent = applyPushIntent(emptyBranchPushState, {
      expectedHead: null,
      nextCommit: commitA,
      idempotencyKey: idemA,
      payloadFingerprint: hashA
    });
    expect(intent.status).toBe("accepted");
    const committed = applyPushCommit(intent.state, {
      expectedHead: null,
      commit: commitA,
      parentCommit: null,
      idempotencyKey: idemA,
      payloadFingerprint: hashA,
      objectKey: "snapshots/opaque-object-key",
      ciphertextSha256: hashA,
      ciphertextSize: 256,
      repoKeyVersion: 3,
      createdAt: "2026-06-13T12:00:00.000Z"
    });
    expect(committed.status).toBe("committed");

    const fresh = pullBranch(committed.state, { knownHead: commitA });
    expect(fresh.status).toBe("up-to-date");
    expect(fresh.snapshot).toBeNull();

    const behind = pullBranch(committed.state, { knownHead: null });
    expect(behind.status).toBe("snapshot");
    expect(behind.snapshot?.objectKey).toBe("snapshots/opaque-object-key");
  });
});
