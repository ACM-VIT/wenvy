import { describe, expect, it } from "vitest";
import {
  PostgresServiceAccountTokenRepository,
  type ServiceAccountTokenSqlClient
} from "../../apps/web-worker/src/worker/persistence/postgres/service-account-token-repository.js";

const repoId = "repo_01JY7X0WENVYAAA";
const tokenHash = "a".repeat(64);

describe("service account token repository regression", () => {
  it("loads repo-scoped token policy and records last use", async () => {
    const client = new InMemoryServiceAccountTokenSqlClient([
      {
        token_hash: tokenHash,
        scope_id: repoId,
        token_id: "token_01JY7X0WENVYAAA",
        service_account_id: "service_account_01JY7X0WENVYAAA",
        organization_id: "org_01JY7X0WENVYAAAA",
        service_account_status: "active",
        service_account_revoked_at: null,
        token_revoked_at: null,
        expires_at: new Date("2026-06-14T00:00:00.000Z"),
        allowed_branches: ["main", "release/*"],
        capabilities: "push_and_pull"
      }
    ]);
    const repository = new PostgresServiceAccountTokenRepository("postgres://test", () => client);

    const record = await repository.findByTokenHash({ tokenHash, repoId });

    expect(record).toMatchObject({
      tokenId: "token_01JY7X0WENVYAAA",
      serviceAccountId: "service_account_01JY7X0WENVYAAA",
      organizationId: "org_01JY7X0WENVYAAAA",
      policy: {
        status: "active",
        expiresAt: "2026-06-14T00:00:00.000Z",
        allowedBranches: ["main", "release/*"],
        capabilities: "push-and-pull"
      }
    });

    await repository.markLastUsed({
      tokenId: "token_01JY7X0WENVYAAA",
      usedAt: "2026-06-13T12:00:00.000Z"
    });

    expect(client.lastUsedAtByTokenId.get("token_01JY7X0WENVYAAA")).toBe("2026-06-13T12:00:00.000Z");
  });

  it("does not authenticate matching token hashes outside repo scope", async () => {
    const client = new InMemoryServiceAccountTokenSqlClient([
      {
        token_hash: tokenHash,
        scope_id: "repo_01JY7X0WENVYOTHER",
        token_id: "token_01JY7X0WENVYAAA",
        service_account_id: "service_account_01JY7X0WENVYAAA",
        organization_id: null,
        service_account_status: "active",
        service_account_revoked_at: null,
        token_revoked_at: null,
        expires_at: null,
        allowed_branches: ["main"],
        capabilities: "pull_only"
      }
    ]);
    const repository = new PostgresServiceAccountTokenRepository("postgres://test", () => client);

    await expect(repository.findByTokenHash({ tokenHash, repoId })).resolves.toBeNull();
  });

  it("normalizes revoked tokens before route authorization", async () => {
    const client = new InMemoryServiceAccountTokenSqlClient([
      {
        token_hash: tokenHash,
        scope_id: repoId,
        token_id: "token_01JY7X0WENVYAAA",
        service_account_id: "service_account_01JY7X0WENVYAAA",
        organization_id: null,
        service_account_status: "active",
        service_account_revoked_at: null,
        token_revoked_at: "2026-06-13T11:00:00.000Z",
        expires_at: null,
        allowed_branches: ["main"],
        capabilities: "pull_only"
      }
    ]);
    const repository = new PostgresServiceAccountTokenRepository("postgres://test", () => client);

    const record = await repository.findByTokenHash({ tokenHash, repoId });

    expect(record?.policy).toMatchObject({
      status: "revoked",
      revokedAt: "2026-06-13T11:00:00.000Z",
      capabilities: "pull-only"
    });
  });

  it("rejects malformed allowed branch policy rows instead of broadening access", async () => {
    const client = new InMemoryServiceAccountTokenSqlClient([
      {
        token_hash: tokenHash,
        scope_id: repoId,
        token_id: "token_01JY7X0WENVYAAA",
        service_account_id: "service_account_01JY7X0WENVYAAA",
        organization_id: null,
        service_account_status: "active",
        service_account_revoked_at: null,
        token_revoked_at: null,
        expires_at: null,
        allowed_branches: ["main", 123],
        capabilities: "pull_only"
      }
    ]);
    const repository = new PostgresServiceAccountTokenRepository("postgres://test", () => client);

    await expect(repository.findByTokenHash({ tokenHash, repoId })).rejects.toThrow("allowed_branches");
  });
});

interface ServiceAccountTokenTestRow {
  readonly token_hash: string;
  readonly scope_id: string;
  readonly token_id: string;
  readonly service_account_id: string;
  readonly organization_id: string | null;
  readonly service_account_status: "active" | "suspended" | "revoked";
  readonly service_account_revoked_at: string | Date | null;
  readonly token_revoked_at: string | Date | null;
  readonly expires_at: string | Date | null;
  readonly allowed_branches: unknown;
  readonly capabilities: "pull_only" | "push_and_pull";
}

interface QueryResult<T> {
  readonly rows: T[];
}

class InMemoryServiceAccountTokenSqlClient implements ServiceAccountTokenSqlClient {
  readonly lastUsedAtByTokenId = new Map<string, string>();

  constructor(private readonly rows: readonly ServiceAccountTokenTestRow[]) {}

  async connect(): Promise<void> {}

  async end(): Promise<void> {}

  async query<T = unknown>(sql: string, values: unknown[] = []): Promise<QueryResult<T>> {
    const normalized = sql.replace(/\s+/gu, " ").trim();
    if (normalized.startsWith("SELECT sat.id AS token_id")) {
      const [candidateTokenHash, candidateRepoId] = values as [string, string];
      return {
        rows: this.rows
          .filter((row) => row.token_hash === candidateTokenHash && row.scope_id === candidateRepoId)
          .map((row) => row as T)
      };
    }
    if (normalized.startsWith("UPDATE service_account_tokens")) {
      const [tokenId, usedAt] = values as [string, string];
      this.lastUsedAtByTokenId.set(tokenId, usedAt);
      return { rows: [] };
    }
    throw new Error(`unhandled SQL in service account token fake: ${normalized}`);
  }
}
