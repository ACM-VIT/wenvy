import { Client } from "pg";
import {
  applyPushCommit,
  applyPushIntent,
  emptyBranchPushState,
  pullBranch,
  type BranchPushState,
  type IdempotencyResult,
  type PendingPush,
  type PullBranchDecision,
  type PullRequest,
  type PushCommitDecision,
  type PushCommitInput,
  type PushIntent,
  type PushIntentDecision,
  type SnapshotCommitRecord
} from "@wenvy/domain";
import type { WorkerEnv } from "../../worker-env.js";

export interface BranchRef {
  readonly repoId: string;
  readonly branch: string;
}

export interface RepoMetadataRepository {
  createPushIntent(ref: BranchRef, input: PushIntent): Promise<PushIntentDecision>;
  finalizePush(ref: BranchRef, input: PushCommitInput): Promise<PushCommitDecision>;
  pullBranch(ref: BranchRef, input: PullRequest): Promise<PullBranchDecision>;
}

interface PushIdempotencyRow {
  readonly idempotency_key: string;
  readonly status: "pending" | "finalized";
  readonly expected_head: string | null;
  readonly commit_id: string;
  readonly payload_fingerprint: string;
}

interface SnapshotRow {
  readonly commit_id: string;
  readonly parent_commit_id: string | null;
  readonly storage_key: string;
  readonly ciphertext_sha256: string;
  readonly size_bytes: number;
  readonly repo_key_version: number;
  readonly created_at: string | Date;
}

interface HeadRow {
  readonly head_commit_id: string | null;
}

interface SqlQueryResult<T> {
  readonly rows: T[];
  readonly rowCount: number | null;
}

export interface RepoMetadataSqlClient {
  connect(): Promise<unknown>;
  end(): Promise<void>;
  query<T = unknown>(sql: string, values?: unknown[]): Promise<SqlQueryResult<T>>;
}

export type RepoMetadataSqlClientFactory = () => RepoMetadataSqlClient;

export class PostgresRepoMetadataRepository implements RepoMetadataRepository {
  private readonly clientFactory: RepoMetadataSqlClientFactory;

  constructor(connectionString: string, clientFactory?: RepoMetadataSqlClientFactory) {
    this.clientFactory = clientFactory ?? (() => new Client({ connectionString }));
  }

  async createPushIntent(ref: BranchRef, input: PushIntent): Promise<PushIntentDecision> {
    const client = this.clientFactory();
    await client.connect();
    try {
      await client.query("BEGIN");
      const state = await loadBranchState(client, ref, { createIfMissing: true, forUpdate: true });
      const decision = applyPushIntent(state, input);
      if (decision.status === "accepted") {
        const pending = decision.state.pendingPushes[input.idempotencyKey];
        if (!pending) {
          throw new Error("accepted push intent did not produce pending state");
        }
        await upsertPendingIntent(client, ref, input.idempotencyKey, pending, new Date().toISOString());
      }
      await client.query("COMMIT");
      return decision;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      await client.end();
    }
  }

  async finalizePush(ref: BranchRef, input: PushCommitInput): Promise<PushCommitDecision> {
    const client = this.clientFactory();
    await client.connect();
    try {
      await client.query("BEGIN");
      const state = await loadBranchState(client, ref, { createIfMissing: true, forUpdate: true });
      const decision = applyPushCommit(state, input);
      if (decision.status === "committed") {
        await persistCommittedSnapshot(client, ref, input, decision.snapshot);
      }
      await client.query("COMMIT");
      return decision;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      await client.end();
    }
  }

  async pullBranch(ref: BranchRef, input: PullRequest): Promise<PullBranchDecision> {
    const client = this.clientFactory();
    await client.connect();
    try {
      const state = await loadBranchState(client, ref, { createIfMissing: false, forUpdate: false });
      return pullBranch(state, input);
    } finally {
      await client.end();
    }
  }
}

export function createRepoMetadataRepository(env: WorkerEnv): RepoMetadataRepository {
  return new PostgresRepoMetadataRepository(env.WENVY_DB.connectionString);
}

async function loadBranchState(
  client: RepoMetadataSqlClient,
  ref: BranchRef,
  options: { readonly createIfMissing: boolean; readonly forUpdate: boolean }
): Promise<BranchPushState> {
  if (options.createIfMissing) {
    await ensureBranch(client, ref);
  }
  const headResult = await client.query<HeadRow>(
    `SELECT head_commit_id FROM branches WHERE repo_id = $1 AND name = $2${options.forUpdate ? " FOR UPDATE" : ""}`,
    [ref.repoId, ref.branch]
  );
  if (!headResult.rows[0] && !options.createIfMissing) {
    return emptyBranchPushState;
  }
  const headCommit = headResult.rows[0]?.head_commit_id ?? null;
  const idempotencyRows = await client.query<PushIdempotencyRow>(
    `SELECT idempotency_key, status, expected_head, commit_id, payload_fingerprint
     FROM repo_push_idempotency
     WHERE repo_id = $1 AND branch_name = $2`,
    [ref.repoId, ref.branch]
  );
  const snapshotRows = await client.query<SnapshotRow>(
    `SELECT
       c.id AS commit_id,
       cp.parent_commit_id,
       b.storage_key,
       b.ciphertext_sha256,
       b.size_bytes,
       s.repo_key_version,
       s.created_at
     FROM commits c
     JOIN snapshots s ON s.commit_id = c.id
     JOIN blobs b ON b.id = s.blob_id
     LEFT JOIN commit_parents cp ON cp.commit_id = c.id
     WHERE c.repo_id = $1`,
    [ref.repoId]
  );

  const pendingPushes: Record<string, PendingPush> = {};
  const idempotencyResults: Record<string, IdempotencyResult> = {};
  for (const row of idempotencyRows.rows) {
    if (row.status === "pending") {
      pendingPushes[row.idempotency_key] = {
        expectedHead: row.expected_head,
        commit: row.commit_id,
        payloadFingerprint: row.payload_fingerprint
      };
      continue;
    }
    idempotencyResults[row.idempotency_key] = {
      commit: row.commit_id,
      payloadFingerprint: row.payload_fingerprint
    };
  }

  const commits: Record<string, SnapshotCommitRecord> = {};
  for (const row of snapshotRows.rows) {
    commits[row.commit_id] = {
      commit: row.commit_id,
      parentCommit: row.parent_commit_id,
      objectKey: row.storage_key,
      ciphertextSha256: row.ciphertext_sha256,
      ciphertextSize: Number(row.size_bytes),
      repoKeyVersion: Number(row.repo_key_version),
      createdAt: toIsoString(row.created_at)
    };
  }

  return {
    headCommit,
    pendingPushes,
    idempotencyResults,
    commits
  };
}

async function ensureBranch(client: RepoMetadataSqlClient, ref: BranchRef): Promise<void> {
  const now = new Date().toISOString();
  await client.query(
    `INSERT INTO branches (repo_id, name, head_commit_id, created_at, updated_at)
     VALUES ($1, $2, NULL, $3, $4)
     ON CONFLICT (repo_id, name) DO NOTHING`,
    [ref.repoId, ref.branch, now, now]
  );
}

async function upsertPendingIntent(
  client: RepoMetadataSqlClient,
  ref: BranchRef,
  idempotencyKey: string,
  pending: PendingPush,
  createdAt: string
): Promise<void> {
  await client.query(
    `INSERT INTO repo_push_idempotency (
       repo_id,
       branch_name,
       idempotency_key,
       status,
       expected_head,
       commit_id,
       payload_fingerprint,
       created_at
     ) VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7)
     ON CONFLICT (repo_id, branch_name, idempotency_key) DO NOTHING`,
    [ref.repoId, ref.branch, idempotencyKey, pending.expectedHead, pending.commit, pending.payloadFingerprint, createdAt]
  );
}

async function persistCommittedSnapshot(
  client: RepoMetadataSqlClient,
  ref: BranchRef,
  input: PushCommitInput,
  snapshot: SnapshotCommitRecord
): Promise<void> {
  await client.query(
    `INSERT INTO commits (id, repo_id, created_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [snapshot.commit, ref.repoId, snapshot.createdAt]
  );
  if (snapshot.parentCommit) {
    await client.query(
      `INSERT INTO commit_parents (commit_id, parent_commit_id)
       VALUES ($1, $2)
       ON CONFLICT (commit_id, parent_commit_id) DO NOTHING`,
      [snapshot.commit, snapshot.parentCommit]
    );
  }
  await client.query(
    `INSERT INTO blobs (id, storage_backend, storage_key, ciphertext_sha256, size_bytes, created_at)
     VALUES ($1, 'r2', $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
       storage_key = EXCLUDED.storage_key,
       ciphertext_sha256 = EXCLUDED.ciphertext_sha256,
       size_bytes = EXCLUDED.size_bytes`,
    [snapshot.commit, snapshot.objectKey, snapshot.ciphertextSha256, snapshot.ciphertextSize, snapshot.createdAt]
  );
  await client.query(
    `INSERT INTO snapshots (commit_id, blob_id, repo_key_version, created_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (commit_id) DO NOTHING`,
    [snapshot.commit, snapshot.commit, snapshot.repoKeyVersion, snapshot.createdAt]
  );
  await client.query(
    `UPDATE repo_push_idempotency
     SET status = 'finalized', finalized_at = $5
     WHERE repo_id = $1 AND branch_name = $2 AND idempotency_key = $3 AND commit_id = $4`,
    [ref.repoId, ref.branch, input.idempotencyKey, snapshot.commit, snapshot.createdAt]
  );
  await client.query(
    `UPDATE branches
     SET head_commit_id = $3, updated_at = $4
     WHERE repo_id = $1 AND name = $2`,
    [ref.repoId, ref.branch, snapshot.commit, snapshot.createdAt]
  );
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
