import { Client } from "pg";
import type { ServiceAccountTokenPolicy } from "@wenvy/domain";
import type { WorkerEnv } from "../../worker-env.js";

export interface ServiceAccountTokenRecord {
  readonly tokenId: string;
  readonly serviceAccountId: string;
  readonly organizationId: string | null;
  readonly policy: ServiceAccountTokenPolicy;
}

export interface ServiceAccountTokenRepository {
  findByTokenHash(input: {
    readonly tokenHash: string;
    readonly repoId: string;
  }): Promise<ServiceAccountTokenRecord | null>;
  markLastUsed(input: {
    readonly tokenId: string;
    readonly usedAt: string;
  }): Promise<void>;
}

interface ServiceAccountTokenRow {
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

interface SqlQueryResult<T> {
  readonly rows: T[];
}

export interface ServiceAccountTokenSqlClient {
  connect(): Promise<unknown>;
  end(): Promise<void>;
  query<T = unknown>(sql: string, values?: unknown[]): Promise<SqlQueryResult<T>>;
}

export type ServiceAccountTokenSqlClientFactory = () => ServiceAccountTokenSqlClient;

export class PostgresServiceAccountTokenRepository implements ServiceAccountTokenRepository {
  private readonly clientFactory: ServiceAccountTokenSqlClientFactory;

  constructor(connectionString: string, clientFactory?: ServiceAccountTokenSqlClientFactory) {
    this.clientFactory = clientFactory ?? (() => new Client({ connectionString }));
  }

  async findByTokenHash(input: {
    readonly tokenHash: string;
    readonly repoId: string;
  }): Promise<ServiceAccountTokenRecord | null> {
    const client = this.clientFactory();
    await client.connect();
    try {
      const result = await client.query<ServiceAccountTokenRow>(
        `SELECT
           sat.id AS token_id,
           sat.service_account_id,
           sa.organization_id,
           sa.status AS service_account_status,
           sa.revoked_at AS service_account_revoked_at,
           sat.revoked_at AS token_revoked_at,
           sat.expires_at,
           sat.allowed_branches,
           sat.capabilities
         FROM service_account_tokens sat
         JOIN service_accounts sa ON sa.id = sat.service_account_id
         WHERE sat.token_hash = $1
           AND sat.scope_type = 'repo'
           AND sat.scope_id = $2
         LIMIT 1`,
        [input.tokenHash, input.repoId]
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }

      return {
        tokenId: row.token_id,
        serviceAccountId: row.service_account_id,
        organizationId: row.organization_id,
        policy: {
          status: tokenStatus(row),
          ...(row.expires_at ? { expiresAt: toIsoString(row.expires_at) } : {}),
          ...(row.token_revoked_at ? { revokedAt: toIsoString(row.token_revoked_at) } : {}),
          allowedBranches: parseAllowedBranches(row.allowed_branches),
          capabilities: row.capabilities === "push_and_pull" ? "push-and-pull" : "pull-only"
        }
      };
    } finally {
      await client.end();
    }
  }

  async markLastUsed(input: {
    readonly tokenId: string;
    readonly usedAt: string;
  }): Promise<void> {
    const client = this.clientFactory();
    await client.connect();
    try {
      await client.query(
        `UPDATE service_account_tokens
         SET last_used_at = $2
         WHERE id = $1`,
        [input.tokenId, input.usedAt]
      );
    } finally {
      await client.end();
    }
  }
}

export function createServiceAccountTokenRepository(env: WorkerEnv): ServiceAccountTokenRepository {
  return new PostgresServiceAccountTokenRepository(env.WENVY_DB.connectionString);
}

function tokenStatus(row: ServiceAccountTokenRow): ServiceAccountTokenPolicy["status"] {
  if (row.token_revoked_at || row.service_account_revoked_at || row.service_account_status === "revoked") {
    return "revoked";
  }
  if (row.service_account_status === "suspended") {
    return "suspended";
  }
  return "active";
}

function parseAllowedBranches(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.some((branch) => typeof branch !== "string" || branch.length === 0)) {
    throw new Error("service account token allowed_branches must be a string array");
  }
  return value;
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
