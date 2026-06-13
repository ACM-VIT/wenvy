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
