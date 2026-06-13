import {
  createRepoMetadataRepository,
  type BranchRef,
  type RepoMetadataRepository
} from "../persistence/postgres/repo-metadata-repository.js";
import type { WorkerEnv } from "../worker-env.js";

interface BranchScopedInput {
  readonly repoId: string;
  readonly branch: string;
}

interface WriteIntentInput extends BranchScopedInput {
  readonly expectedHead: string | null;
  readonly nextCommit: string;
  readonly idempotencyKey: string;
  readonly payloadFingerprint?: string;
}

interface FinalizePushInput extends BranchScopedInput {
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

interface PullInput extends BranchScopedInput {
  readonly knownHead?: string | null;
}

export class RepoBranchCoordinator implements DurableObject {
  private readonly repository: RepoMetadataRepository;

  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    void ctx;
    this.repository = createRepoMetadataRepository(env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST") {
      return Response.json({ error: "not-found" }, { status: 404 });
    }

    if (url.pathname === "/write-intent") {
      const input = (await request.json()) as WriteIntentInput;
      const decision = await this.repository.createPushIntent(branchRef(input), input);

      return Response.json(decision, {
        status:
          decision.status === "conflict" || decision.status === "idempotency-conflict" ? 409 : 200
      });
    }

    if (url.pathname === "/finalize-push") {
      const input = (await request.json()) as FinalizePushInput;
      const decision = await this.repository.finalizePush(branchRef(input), input);

      return Response.json(decision, {
        status:
          decision.status === "committed" || decision.status === "duplicate" ? 200 : 409
      });
    }

    if (url.pathname === "/pull") {
      const input = (await request.json()) as PullInput;
      const decision = await this.repository.pullBranch(branchRef(input), input);

      return Response.json(decision, {
        status: decision.status === "missing-snapshot" ? 409 : 200
      });
    }

    return Response.json({ error: "not-found" }, { status: 404 });
  }
}

function branchRef(input: BranchScopedInput): BranchRef {
  return {
    repoId: input.repoId,
    branch: input.branch
  };
}
