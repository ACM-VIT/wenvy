export interface BranchPushState {
  readonly headCommit: string | null;
  readonly idempotencyResults: Readonly<Record<string, IdempotencyResult>>;
}

export interface IdempotencyResult {
  readonly commit: string;
  readonly payloadFingerprint: string;
}

export interface PushIntent {
  readonly expectedHead: string | null;
  readonly nextCommit: string;
  readonly idempotencyKey: string;
  readonly payloadFingerprint?: string;
}

export type PushIntentDecision =
  | {
      readonly status: "accepted";
      readonly state: BranchPushState;
      readonly commit: string;
      readonly headCommit: string;
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

export const emptyBranchPushState: BranchPushState = {
  headCommit: null,
  idempotencyResults: {}
};

export function applyPushIntent(
  state: BranchPushState,
  intent: PushIntent
): PushIntentDecision {
  const duplicate = state.idempotencyResults[intent.idempotencyKey];
  const payloadFingerprint = intent.payloadFingerprint ?? intent.nextCommit;
  if (duplicate) {
    if (duplicate.payloadFingerprint !== payloadFingerprint) {
      return {
        status: "idempotency-conflict",
        state,
        commit: duplicate.commit,
        headCommit: state.headCommit
      };
    }

    return {
      status: "duplicate",
      state,
      commit: duplicate.commit,
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
    headCommit: intent.nextCommit,
    idempotencyResults: {
      ...state.idempotencyResults,
      [intent.idempotencyKey]: {
        commit: intent.nextCommit,
        payloadFingerprint
      }
    }
  };

  return {
    status: "accepted",
    state: nextState,
    commit: intent.nextCommit,
    headCommit: intent.nextCommit
  };
}
