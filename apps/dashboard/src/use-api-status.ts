import { useEffect, useState } from "react";
import {
  dashboardApiBaseUrl,
  fetchApiHealth,
  fetchApiOpenApiSummary,
  type ApiHealth,
  type ApiOpenApiSummary
} from "./api-client";

export type ApiStatusState =
  | {
      readonly status: "checking";
      readonly apiBaseUrl: string;
    }
  | {
      readonly status: "online";
      readonly apiBaseUrl: string;
      readonly health: ApiHealth;
      readonly openApi: ApiOpenApiSummary;
      readonly checkedAt: string;
    }
  | {
      readonly status: "degraded";
      readonly apiBaseUrl: string;
      readonly message: string;
      readonly checkedAt: string;
    };

export function useApiStatus(): ApiStatusState {
  const [state, setState] = useState<ApiStatusState>({
    status: "checking",
    apiBaseUrl: dashboardApiBaseUrl()
  });

  useEffect(() => {
    const controller = new AbortController();
    const apiBaseUrl = dashboardApiBaseUrl();

    async function check(): Promise<void> {
      try {
        const [health, openApi] = await Promise.all([
          fetchApiHealth(controller.signal),
          fetchApiOpenApiSummary(controller.signal)
        ]);
        setState({
          status: health.ok ? "online" : "degraded",
          apiBaseUrl,
          health,
          openApi,
          checkedAt: new Date().toISOString(),
          ...(health.ok ? {} : { message: "health endpoint returned ok=false" })
        } as ApiStatusState);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setState({
          status: "degraded",
          apiBaseUrl,
          message: error instanceof Error ? error.message : "API status check failed",
          checkedAt: new Date().toISOString()
        });
      }
    }

    void check();
    const id = window.setInterval(() => void check(), 30_000);
    return () => {
      controller.abort();
      window.clearInterval(id);
    };
  }, []);

  return state;
}
