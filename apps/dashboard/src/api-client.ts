export interface ApiHealth {
  readonly ok: boolean;
  readonly service: string;
  readonly runtime: string;
}

export interface ApiOpenApiSummary {
  readonly openapi: string;
  readonly title: string;
  readonly pathCount: number;
}

export function dashboardApiBaseUrl(): string {
  return (import.meta.env.VITE_WENVY_API_URL ?? "https://api.wenvy.dev").replace(/\/+$/u, "");
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
    readonly paths?: Record<string, unknown>;
  };
  return {
    openapi: document.openapi ?? "unknown",
    title: document.info?.title ?? "Wenvy API",
    pathCount: Object.keys(document.paths ?? {}).length
  };
}
