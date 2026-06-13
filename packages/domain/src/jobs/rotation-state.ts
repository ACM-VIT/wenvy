export const rotationCheckpoints = [
  "queued",
  "key-generated",
  "envelopes-wrapped",
  "repo-keys-rewrapped",
  "old-key-retired",
  "completed"
] as const;

export type RotationCheckpoint = (typeof rotationCheckpoints)[number];

export interface RotationJobState {
  readonly id: string;
  readonly scopeType: "team" | "repo";
  readonly scopeId: string;
  readonly checkpoint: RotationCheckpoint;
  readonly completedRepoKeyIds: readonly string[];
}

const checkpointRank = new Map<RotationCheckpoint, number>(
  rotationCheckpoints.map((checkpoint, index) => [checkpoint, index])
);

export function canAdvanceRotation(
  current: RotationCheckpoint,
  next: RotationCheckpoint
): boolean {
  return checkpointRank.get(next)! >= checkpointRank.get(current)!;
}

export function advanceRotationCheckpoint(
  state: RotationJobState,
  next: RotationCheckpoint
): RotationJobState {
  if (!canAdvanceRotation(state.checkpoint, next)) {
    return state;
  }
  return { ...state, checkpoint: next };
}

export function markRepoKeyRewrapped(
  state: RotationJobState,
  repoKeyId: string
): RotationJobState {
  if (state.completedRepoKeyIds.includes(repoKeyId)) {
    return state;
  }
  return {
    ...state,
    completedRepoKeyIds: [...state.completedRepoKeyIds, repoKeyId]
  };
}
