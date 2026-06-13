import { describe, expect, it } from "vitest";
import {
  PostgresRepoMetadataRepository,
  type RepoMetadataSqlClient
} from "../../apps/web-worker/src/worker/persistence/postgres/repo-metadata-repository.js";

const branchRef = {
  repoId: "repo_01JY7X0WENVYAAA",
  branch: "main"
};
const commitA = "commit_01JY7X0WENVYAAA";
const commitB = "commit_01JY7X0WENVYBBB";
const idemA = "idem_01JY7X0WENVYAAA";
const idemB = "idem_01JY7X0WENVYBBB";
const hashA = "a".repeat(64);
const hashB = "b".repeat(64);

describe("repo metadata repository regression", () => {
  it("persists intent, finalizes encrypted snapshot metadata, and serves pull metadata", async () => {
    const client = new InMemoryRepoMetadataSqlClient();
    const repository = new PostgresRepoMetadataRepository("postgres://test", () => client);

    const intent = await repository.createPushIntent(branchRef, {
      expectedHead: null,
      nextCommit: commitA,
      idempotencyKey: idemA,
      payloadFingerprint: hashA
    });
    expect(intent.status).toBe("accepted");
    expect(intent.headCommit).toBeNull();

    const duplicateIntent = await repository.createPushIntent(branchRef, {
      expectedHead: null,
      nextCommit: commitA,
      idempotencyKey: idemA,
      payloadFingerprint: hashA
    });
    expect(duplicateIntent.status).toBe("duplicate");

    const committed = await repository.finalizePush(branchRef, {
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

    const duplicateCommit = await repository.finalizePush(branchRef, {
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
    expect(duplicateCommit.status).toBe("duplicate");
    expect(duplicateCommit.snapshot.objectKey).toBe("snapshots/opaque-object-key");

    const pullBehind = await repository.pullBranch(branchRef, { knownHead: null });
    expect(pullBehind.status).toBe("snapshot");
    expect(pullBehind.snapshot?.commit).toBe(commitA);
    expect(pullBehind.snapshot?.ciphertextSha256).toBe(hashA);

    const pullFresh = await repository.pullBranch(branchRef, { knownHead: commitA });
    expect(pullFresh.status).toBe("up-to-date");
    expect(pullFresh.snapshot).toBeNull();
  });

  it("rejects stale expected heads before writing pending idempotency rows", async () => {
    const client = new InMemoryRepoMetadataSqlClient();
    const repository = new PostgresRepoMetadataRepository("postgres://test", () => client);
    await repository.createPushIntent(branchRef, {
      expectedHead: null,
      nextCommit: commitA,
      idempotencyKey: idemA,
      payloadFingerprint: hashA
    });
    await repository.finalizePush(branchRef, {
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

    const stale = await repository.createPushIntent(branchRef, {
      expectedHead: null,
      nextCommit: commitB,
      idempotencyKey: idemB,
      payloadFingerprint: hashB
    });

    expect(stale.status).toBe("conflict");
    expect(stale.headCommit).toBe(commitA);
    expect(client.idempotencyRows.has(`${branchRef.repoId}:${branchRef.branch}:${idemB}`)).toBe(false);
  });

  it("does not create branch rows on pull for an unknown branch", async () => {
    const client = new InMemoryRepoMetadataSqlClient();
    const repository = new PostgresRepoMetadataRepository("postgres://test", () => client);

    const missing = await repository.pullBranch({ repoId: branchRef.repoId, branch: "missing" }, {});

    expect(missing.status).toBe("empty");
    expect(client.branches.has(`${branchRef.repoId}:missing`)).toBe(false);
  });
});

interface QueryResult<T> {
  readonly rows: T[];
  readonly rowCount: number;
}

interface BranchRow {
  head_commit_id: string | null;
  created_at: string;
  updated_at: string;
}

interface IdempotencyRow {
  repo_id: string;
  branch_name: string;
  idempotency_key: string;
  status: "pending" | "finalized";
  expected_head: string | null;
  commit_id: string;
  payload_fingerprint: string;
  created_at: string;
  finalized_at: string | null;
}

interface CommitRow {
  id: string;
  repo_id: string;
  created_at: string;
}

interface BlobRow {
  id: string;
  storage_key: string;
  ciphertext_sha256: string;
  size_bytes: number;
}

interface SnapshotRow {
  commit_id: string;
  blob_id: string;
  repo_key_version: number;
  created_at: string;
}

class InMemoryRepoMetadataSqlClient implements RepoMetadataSqlClient {
  readonly branches = new Map<string, BranchRow>();
  readonly idempotencyRows = new Map<string, IdempotencyRow>();
  private readonly commits = new Map<string, CommitRow>();
  private readonly parents = new Map<string, string>();
  private readonly blobs = new Map<string, BlobRow>();
  private readonly snapshots = new Map<string, SnapshotRow>();

  async connect(): Promise<void> {}

  async end(): Promise<void> {}

  async query<T = unknown>(sql: string, values: unknown[] = []): Promise<QueryResult<T>> {
    const normalized = sql.replace(/\s+/gu, " ").trim();
    if (normalized === "BEGIN" || normalized === "COMMIT" || normalized === "ROLLBACK") {
      return result([]);
    }
    if (normalized.startsWith("INSERT INTO branches")) {
      const [repoId, branch, createdAt, updatedAt] = values as [string, string, string, string];
      const key = branchKey(repoId, branch);
      if (!this.branches.has(key)) {
        this.branches.set(key, { head_commit_id: null, created_at: createdAt, updated_at: updatedAt });
      }
      return result([]);
    }
    if (normalized.startsWith("SELECT head_commit_id FROM branches")) {
      const [repoId, branch] = values as [string, string];
      const row = this.branches.get(branchKey(repoId, branch));
      return result(row ? [{ head_commit_id: row.head_commit_id } as T] : []);
    }
    if (normalized.startsWith("SELECT idempotency_key, status, expected_head")) {
      const [repoId, branch] = values as [string, string];
      return result(
        Array.from(this.idempotencyRows.values())
          .filter((row) => row.repo_id === repoId && row.branch_name === branch)
          .map((row) => row as T)
      );
    }
    if (normalized.startsWith("SELECT c.id AS commit_id")) {
      const [repoId] = values as [string];
      return result(
        Array.from(this.commits.values())
          .filter((commit) => commit.repo_id === repoId)
          .flatMap((commit) => {
            const snapshot = this.snapshots.get(commit.id);
            if (!snapshot) {
              return [];
            }
            const blob = this.blobs.get(snapshot.blob_id);
            if (!blob) {
              return [];
            }
            return [
              {
                commit_id: commit.id,
                parent_commit_id: this.parents.get(commit.id) ?? null,
                storage_key: blob.storage_key,
                ciphertext_sha256: blob.ciphertext_sha256,
                size_bytes: blob.size_bytes,
                repo_key_version: snapshot.repo_key_version,
                created_at: snapshot.created_at
              } as T
            ];
          })
      );
    }
    if (normalized.startsWith("INSERT INTO repo_push_idempotency")) {
      const [repoId, branch, idempotencyKey, expectedHead, commitId, payloadFingerprint, createdAt] = values as [
        string,
        string,
        string,
        string | null,
        string,
        string,
        string
      ];
      const key = idempotencyKeyFor(repoId, branch, idempotencyKey);
      if (!this.idempotencyRows.has(key)) {
        this.idempotencyRows.set(key, {
          repo_id: repoId,
          branch_name: branch,
          idempotency_key: idempotencyKey,
          status: "pending",
          expected_head: expectedHead,
          commit_id: commitId,
          payload_fingerprint: payloadFingerprint,
          created_at: createdAt,
          finalized_at: null
        });
      }
      return result([]);
    }
    if (normalized.startsWith("INSERT INTO commits")) {
      const [commitId, repoId, createdAt] = values as [string, string, string];
      if (!this.commits.has(commitId)) {
        this.commits.set(commitId, { id: commitId, repo_id: repoId, created_at: createdAt });
      }
      return result([]);
    }
    if (normalized.startsWith("INSERT INTO commit_parents")) {
      const [commitId, parentCommitId] = values as [string, string];
      this.parents.set(commitId, parentCommitId);
      return result([]);
    }
    if (normalized.startsWith("INSERT INTO blobs")) {
      const [blobId, storageKey, ciphertextSha256, sizeBytes] = values as [string, string, string, number];
      this.blobs.set(blobId, {
        id: blobId,
        storage_key: storageKey,
        ciphertext_sha256: ciphertextSha256,
        size_bytes: sizeBytes
      });
      return result([]);
    }
    if (normalized.startsWith("INSERT INTO snapshots")) {
      const [commitId, blobId, repoKeyVersion, createdAt] = values as [string, string, number, string];
      if (!this.snapshots.has(commitId)) {
        this.snapshots.set(commitId, {
          commit_id: commitId,
          blob_id: blobId,
          repo_key_version: repoKeyVersion,
          created_at: createdAt
        });
      }
      return result([]);
    }
    if (normalized.startsWith("UPDATE repo_push_idempotency")) {
      const [repoId, branch, idempotencyKey, commitId, finalizedAt] = values as [string, string, string, string, string];
      const row = this.idempotencyRows.get(idempotencyKeyFor(repoId, branch, idempotencyKey));
      if (row?.commit_id === commitId) {
        row.status = "finalized";
        row.finalized_at = finalizedAt;
      }
      return result([]);
    }
    if (normalized.startsWith("UPDATE branches")) {
      const [repoId, branch, headCommitId, updatedAt] = values as [string, string, string, string];
      const row = this.branches.get(branchKey(repoId, branch));
      if (row) {
        row.head_commit_id = headCommitId;
        row.updated_at = updatedAt;
      }
      return result([]);
    }

    throw new Error(`unhandled SQL in regression fake: ${normalized}`);
  }
}

function result<T>(rows: T[]): QueryResult<T> {
  return {
    rows,
    rowCount: rows.length
  };
}

function branchKey(repoId: string, branch: string): string {
  return `${repoId}:${branch}`;
}

function idempotencyKeyFor(repoId: string, branch: string, idempotencyKey: string): string {
  return `${repoId}:${branch}:${idempotencyKey}`;
}
