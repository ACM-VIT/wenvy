export interface BranchPushState {
  readonly headCommit: string | null;
  readonly pendingPushes: Readonly<Record<string, PendingPush>>;
  readonly idempotencyResults: Readonly<Record<string, IdempotencyResult>>;
  readonly commits: Readonly<Record<string, SnapshotCommitRecord>>;
}

export interface PendingPush {
  readonly expectedHead: string | null;
  readonly commit: string;
  readonly payloadFingerprint: string;
}

export interface IdempotencyResult {
  readonly commit: string;
  readonly payloadFingerprint: string;
}

export interface SnapshotCommitRecord {
  readonly commit: string;
  readonly parentCommit: string | null;
  readonly objectKey: string;
  readonly ciphertextSha256: string;
  readonly ciphertextSize: number;
  readonly repoKeyVersion: number;
  readonly createdAt: string;
}

export interface PushIntent {
  readonly expectedHead: string | null;
  readonly nextCommit: string;
  readonly idempotencyKey: string;
  readonly payloadFingerprint?: string;
}

export interface PushCommitInput {
  readonly expectedHead: string | null;
  readonly commit: string;
  readonly parentCommit: string | null;
  readonly idempotencyKey: string;
  readonly payloadFingerprint?: string;
  readonly objectKey: string;
  readonly ciphertextSha256: string;
  readonly ciphertextSize: number;
  readonly repoKeyVersion: number;
  readonly createdAt: string;
}

export interface PullRequest {
  readonly knownHead?: string | null;
}

export type PushIntentDecision =
  | {
      readonly status: "accepted";
      readonly state: BranchPushState;
      readonly commit: string;
      readonly headCommit: string | null;
    }
  | {
      readonly status: "duplicate";
      readonly state: BranchPushState;
      readonly commit: string;
      readonly headCommit: string | null;
    }
  | {
      readonly status: "conflict";
      readonly state: BranchPushState;
      readonly headCommit: string | null;
    }
  | {
      readonly status: "idempotency-conflict";
      readonly state: BranchPushState;
      readonly commit: string;
      readonly headCommit: string | null;
    };

export type PushCommitDecision =
  | {
      readonly status: "committed";
      readonly state: BranchPushState;
      readonly commit: string;
      readonly headCommit: string;
      readonly snapshot: SnapshotCommitRecord;
    }
  | {
      readonly status: "duplicate";
      readonly state: BranchPushState;
      readonly commit: string;
      readonly headCommit: string | null;
      readonly snapshot: SnapshotCommitRecord;
    }
  | {
      readonly status: "conflict";
      readonly state: BranchPushState;
      readonly headCommit: string | null;
    }
  | {
      readonly status: "idempotency-conflict";
      readonly state: BranchPushState;
      readonly commit: string;
      readonly headCommit: string | null;
    }
  | {
      readonly status: "missing-intent";
      readonly state: BranchPushState;
      readonly headCommit: string | null;
    }
  | {
      readonly status: "commit-conflict";
      readonly state: BranchPushState;
      readonly commit: string;
      readonly headCommit: string | null;
    };

export type PullBranchDecision =
  | {
      readonly status: "empty";
      readonly headCommit: null;
      readonly snapshot: null;
    }
  | {
      readonly status: "up-to-date";
      readonly headCommit: string;
      readonly snapshot: null;
    }
  | {
      readonly status: "snapshot";
      readonly headCommit: string;
      readonly snapshot: SnapshotCommitRecord;
    }
  | {
      readonly status: "missing-snapshot";
      readonly headCommit: string;
      readonly snapshot: null;
    };

export const emptyBranchPushState: BranchPushState = {
  headCommit: null,
  pendingPushes: {},
  idempotencyResults: {},
  commits: {}
};

export function normalizeBranchPushState(state: Partial<BranchPushState> | undefined): BranchPushState {
  return {
    headCommit: state?.headCommit ?? null,
    pendingPushes: state?.pendingPushes ?? {},
    idempotencyResults: state?.idempotencyResults ?? {},
    commits: state?.commits ?? {}
  };
}

export function applyPushIntent(
  state: BranchPushState,
  intent: PushIntent
): PushIntentDecision {
  const payloadFingerprint = intent.payloadFingerprint ?? intent.nextCommit;
  const finalizedDuplicate = state.idempotencyResults[intent.idempotencyKey];
  if (finalizedDuplicate) {
    if (finalizedDuplicate.payloadFingerprint !== payloadFingerprint || finalizedDuplicate.commit !== intent.nextCommit) {
      return {
        status: "idempotency-conflict",
        state,
        commit: finalizedDuplicate.commit,
        headCommit: state.headCommit
      };
    }

    return {
      status: "duplicate",
      state,
      commit: finalizedDuplicate.commit,
      headCommit: state.headCommit
    };
  }

  const pendingDuplicate = state.pendingPushes[intent.idempotencyKey];
  if (pendingDuplicate) {
    if (pendingDuplicate.payloadFingerprint !== payloadFingerprint || pendingDuplicate.commit !== intent.nextCommit) {
      return {
        status: "idempotency-conflict",
        state,
        commit: pendingDuplicate.commit,
        headCommit: state.headCommit
      };
    }

    return {
      status: "duplicate",
      state,
      commit: pendingDuplicate.commit,
      headCommit: state.headCommit
    };
  }

  if (state.headCommit !== intent.expectedHead) {
    return {
      status: "conflict",
      state,
      headCommit: state.headCommit
    };
  }

  const nextState: BranchPushState = {
    ...state,
    pendingPushes: {
      ...state.pendingPushes,
      [intent.idempotencyKey]: {
        expectedHead: intent.expectedHead,
        commit: intent.nextCommit,
        payloadFingerprint
      }
    }
  };

  return {
    status: "accepted",
    state: nextState,
    commit: intent.nextCommit,
    headCommit: state.headCommit
  };
}

export function applyPushCommit(
  state: BranchPushState,
  input: PushCommitInput
): PushCommitDecision {
  const payloadFingerprint = input.payloadFingerprint ?? input.commit;
  const finalizedDuplicate = state.idempotencyResults[input.idempotencyKey];
  if (finalizedDuplicate) {
    const snapshot = state.commits[finalizedDuplicate.commit];
    if (
      finalizedDuplicate.payloadFingerprint !== payloadFingerprint ||
      finalizedDuplicate.commit !== input.commit ||
      !snapshot ||
      !sameSnapshot(snapshot, input)
    ) {
      return {
        status: "idempotency-conflict",
        state,
        commit: finalizedDuplicate.commit,
        headCommit: state.headCommit
      };
    }

    return {
      status: "duplicate",
      state,
      commit: finalizedDuplicate.commit,
      headCommit: state.headCommit,
      snapshot
    };
  }

  const pending = state.pendingPushes[input.idempotencyKey];
  if (!pending || pending.commit !== input.commit || pending.payloadFingerprint !== payloadFingerprint) {
    return {
      status: "missing-intent",
      state,
      headCommit: state.headCommit
    };
  }

  if (pending.expectedHead !== input.expectedHead || state.headCommit !== input.expectedHead) {
    return {
      status: "conflict",
      state,
      headCommit: state.headCommit
    };
  }

  if (input.parentCommit !== input.expectedHead) {
    return {
      status: "conflict",
      state,
      headCommit: state.headCommit
    };
  }

  const existingCommit = state.commits[input.commit];
  if (existingCommit && !sameSnapshot(existingCommit, input)) {
    return {
      status: "commit-conflict",
      state,
      commit: input.commit,
      headCommit: state.headCommit
    };
  }

  const snapshot: SnapshotCommitRecord = {
    commit: input.commit,
    parentCommit: input.parentCommit,
    objectKey: input.objectKey,
    ciphertextSha256: input.ciphertextSha256,
    ciphertextSize: input.ciphertextSize,
    repoKeyVersion: input.repoKeyVersion,
    createdAt: input.createdAt
  };
  const { [input.idempotencyKey]: _consumed, ...remainingPending } = state.pendingPushes;
  void _consumed;

  const nextState: BranchPushState = {
    headCommit: input.commit,
    pendingPushes: remainingPending,
    idempotencyResults: {
      ...state.idempotencyResults,
      [input.idempotencyKey]: {
        commit: input.commit,
        payloadFingerprint
      }
    },
    commits: {
      ...state.commits,
      [input.commit]: snapshot
    }
  };

  return {
    status: "committed",
    state: nextState,
    commit: input.commit,
    headCommit: input.commit,
    snapshot
  };
}

export function pullBranch(state: BranchPushState, request: PullRequest = {}): PullBranchDecision {
  if (!state.headCommit) {
    return {
      status: "empty",
      headCommit: null,
      snapshot: null
    };
  }

  if (request.knownHead === state.headCommit) {
    return {
      status: "up-to-date",
      headCommit: state.headCommit,
      snapshot: null
    };
  }

  const snapshot = state.commits[state.headCommit];
  if (!snapshot) {
    return {
      status: "missing-snapshot",
      headCommit: state.headCommit,
      snapshot: null
    };
  }

  return {
    status: "snapshot",
    headCommit: state.headCommit,
    snapshot
  };
}

function sameSnapshot(snapshot: SnapshotCommitRecord, input: PushCommitInput): boolean {
  return (
    snapshot.commit === input.commit &&
    snapshot.parentCommit === input.parentCommit &&
    snapshot.objectKey === input.objectKey &&
    snapshot.ciphertextSha256 === input.ciphertextSha256 &&
    snapshot.ciphertextSize === input.ciphertextSize &&
    snapshot.repoKeyVersion === input.repoKeyVersion
  );
}
