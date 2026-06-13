import { describe, expect, it } from "vitest";
import { applyPushIntent, emptyBranchPushState } from "@wenvy/domain";

describe("push idempotency regression", () => {
  it("returns duplicate result without moving branch head", () => {
    const first = applyPushIntent(emptyBranchPushState, {
      expectedHead: null,
      nextCommit: "commit_01JY7X0WENVYAAA",
      idempotencyKey: "idem_01JY7X0WENVYAAA",
      payloadFingerprint: "a".repeat(64)
    });
    expect(first.status).toBe("accepted");

    const retry = applyPushIntent(first.state, {
      expectedHead: null,
      nextCommit: "commit_01JY7X0WENVYAAA",
      idempotencyKey: "idem_01JY7X0WENVYAAA",
      payloadFingerprint: "a".repeat(64)
    });

    expect(retry.status).toBe("duplicate");
    expect(retry.commit).toBe("commit_01JY7X0WENVYAAA");
    expect(retry.headCommit).toBe("commit_01JY7X0WENVYAAA");
    expect(Object.keys(retry.state.idempotencyResults)).toHaveLength(1);
  });

  it("rejects reused idempotency key with a different push payload", () => {
    const first = applyPushIntent(emptyBranchPushState, {
      expectedHead: null,
      nextCommit: "commit_01JY7X0WENVYAAA",
      idempotencyKey: "idem_01JY7X0WENVYAAA",
      payloadFingerprint: "a".repeat(64)
    });
    expect(first.status).toBe("accepted");

    const conflict = applyPushIntent(first.state, {
      expectedHead: "commit_01JY7X0WENVYAAA",
      nextCommit: "commit_01JY7X0WENVYBBB",
      idempotencyKey: "idem_01JY7X0WENVYAAA",
      payloadFingerprint: "b".repeat(64)
    });

    expect(conflict.status).toBe("idempotency-conflict");
    expect(conflict.headCommit).toBe("commit_01JY7X0WENVYAAA");
    expect(conflict.state).toBe(first.state);
  });

  it("rejects stale expected head after an accepted push", () => {
    const first = applyPushIntent(emptyBranchPushState, {
      expectedHead: null,
      nextCommit: "commit_01JY7X0WENVYAAA",
      idempotencyKey: "idem_01JY7X0WENVYAAA"
    });
    expect(first.status).toBe("accepted");

    const stale = applyPushIntent(first.state, {
      expectedHead: null,
      nextCommit: "commit_01JY7X0WENVYBBB",
      idempotencyKey: "idem_01JY7X0WENVYBBB"
    });

    expect(stale.status).toBe("conflict");
    expect(stale.headCommit).toBe("commit_01JY7X0WENVYAAA");
    expect(stale.state.idempotencyResults.idem_01JY7X0WENVYBBB).toBeUndefined();
  });
});
