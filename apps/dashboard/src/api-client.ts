import { WENVY_API_URL } from "./product";

export interface ApiHealth {
  readonly ok: boolean;
  readonly service: string;
  readonly runtime: string;
}

export interface ApiOpenApiSummary {
  readonly openapi: string;
  readonly title: string;
  readonly pathCount: number;
  readonly paths: readonly ApiRouteSummary[];
}

export interface ApiRouteSummary {
  readonly path: string;
  readonly methods: readonly string[];
  readonly summary: string;
  readonly requiresAuth: boolean;
}

export interface BranchSnapshot {
  readonly commit: string;
  readonly parentCommit: string | null;
  readonly objectKey: string;
  readonly ciphertextSha256: string;
  readonly ciphertextSize: number;
  readonly repoKeyVersion: number;
  readonly createdAt: string;
}

export interface BranchPullResponse {
  readonly status: "empty" | "up-to-date" | "snapshot" | "missing-snapshot";
  readonly headCommit: string | null;
  readonly snapshot: BranchSnapshot | null;
}

export function dashboardApiBaseUrl(): string {
  return (import.meta.env.VITE_WENVY_API_URL ?? WENVY_API_URL).replace(/\/+$/u, "");
}

export async function fetchApiHealth(signal?: AbortSignal): Promise<ApiHealth> {
  const response = await fetch(`${dashboardApiBaseUrl()}/health`, {
    headers: { accept: "application/json" },
    signal
  });
  if (!response.ok) {
    throw new Error(`health check failed with ${response.status}`);
  }
  return (await response.json()) as ApiHealth;
}

export async function fetchApiOpenApiSummary(signal?: AbortSignal): Promise<ApiOpenApiSummary> {
  const response = await fetch(`${dashboardApiBaseUrl()}/openapi.json`, {
    headers: { accept: "application/json" },
    signal
  });
  if (!response.ok) {
    throw new Error(`OpenAPI fetch failed with ${response.status}`);
  }

  const document = (await response.json()) as {
    readonly openapi?: string;
    readonly info?: { readonly title?: string };
    readonly paths?: Record<
      string,
      Record<string, { readonly summary?: string; readonly security?: readonly unknown[] }>
    >;
  };
  const paths = Object.entries(document.paths ?? {}).map(([path, methods]) => {
    const entries = Object.entries(methods).filter(([method]) => method !== "parameters");
    return {
      path,
      methods: entries.map(([method]) => method.toUpperCase()),
      summary: entries.map(([, operation]) => operation.summary).find(Boolean) ?? "API route",
      requiresAuth: entries.some(([, operation]) => Array.isArray(operation.security) && operation.security.length > 0)
    };
  });
  return {
    openapi: document.openapi ?? "unknown",
    title: document.info?.title ?? "Wenvy API",
    pathCount: paths.length,
    paths
  };
}

export async function pullBranchSnapshot(input: {
  readonly apiBaseUrl: string;
  readonly repo: string;
  readonly branch: string;
  readonly token: string;
  readonly knownHead?: string | null;
  readonly signal?: AbortSignal;
}): Promise<BranchPullResponse> {
  const response = await fetch(
    `${input.apiBaseUrl}/v1/repos/${encodeURIComponent(input.repo)}/branches/${encodeURIComponent(input.branch)}/pull`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ knownHead: input.knownHead ?? null }),
      signal: input.signal
    }
  );
  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(readErrorMessage(payload, `pull failed with ${response.status}`));
  }
  return payload as BranchPullResponse;
}

function readErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string") {
    return payload.message;
  }
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }
  return fallback;
}
