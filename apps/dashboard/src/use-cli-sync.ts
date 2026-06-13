import { useCallback, useMemo, useState } from "react";
import { dashboardApiBaseUrl, pullBranchSnapshot, type BranchPullResponse } from "./api-client";
import { WENVY_DEFAULT_BRANCH } from "./product";

const storageKey = "wenvy.dashboard.sync";

interface StoredSyncConfig {
  readonly repo: string;
  readonly branch: string;
}

export interface CliSyncInput {
  readonly repo: string;
  readonly branch: string;
  readonly token: string;
  readonly knownHead?: string;
}

export type CliSyncState =
  | {
      readonly status: "disconnected";
      readonly apiBaseUrl: string;
      readonly repo: string;
      readonly branch: string;
      readonly hasToken: false;
    }
  | {
      readonly status: "syncing";
      readonly apiBaseUrl: string;
      readonly repo: string;
      readonly branch: string;
      readonly hasToken: true;
    }
  | {
      readonly status: "synced";
      readonly apiBaseUrl: string;
      readonly repo: string;
      readonly branch: string;
      readonly hasToken: true;
      readonly checkedAt: string;
      readonly pull: BranchPullResponse;
    }
  | {
      readonly status: "failed";
      readonly apiBaseUrl: string;
      readonly repo: string;
      readonly branch: string;
      readonly hasToken: boolean;
      readonly checkedAt: string;
      readonly message: string;
    };

export interface CliSyncController {
  readonly state: CliSyncState;
  readonly connect: (input: CliSyncInput) => Promise<void>;
  readonly refresh: () => Promise<void>;
  readonly disconnect: () => void;
}

export function useCliSync(): CliSyncController {
  const initial = useMemo(readStoredSyncConfig, []);
  const apiBaseUrl = dashboardApiBaseUrl();
  const [token, setToken] = useState("");
  const [lastInput, setLastInput] = useState<CliSyncInput | null>(null);
  const [state, setState] = useState<CliSyncState>({
    status: "disconnected",
    apiBaseUrl,
    repo: initial.repo,
    branch: initial.branch,
    hasToken: false
  });

  const connect = useCallback(
    async (input: CliSyncInput) => {
      const normalized = normalizeSyncInput(input);
      setToken(normalized.token);
      setLastInput(normalized);
      writeStoredSyncConfig(normalized);
      setState({
        status: "syncing",
        apiBaseUrl,
        repo: normalized.repo,
        branch: normalized.branch,
        hasToken: true
      });

      try {
        const pull = await pullBranchSnapshot({
          apiBaseUrl,
          repo: normalized.repo,
          branch: normalized.branch,
          token: normalized.token,
          knownHead: normalized.knownHead?.trim() || null
        });
        setState({
          status: "synced",
          apiBaseUrl,
          repo: normalized.repo,
          branch: normalized.branch,
          hasToken: true,
          checkedAt: new Date().toISOString(),
          pull
        });
      } catch (error) {
        setState({
          status: "failed",
          apiBaseUrl,
          repo: normalized.repo,
          branch: normalized.branch,
          hasToken: true,
          checkedAt: new Date().toISOString(),
          message: error instanceof Error ? error.message : "sync failed"
        });
      }
    },
    [apiBaseUrl]
  );

  const refresh = useCallback(async () => {
    if (!lastInput || !token) {
      return;
    }
    await connect({ ...lastInput, token });
  }, [connect, lastInput, token]);

  const disconnect = useCallback(() => {
    setToken("");
    setLastInput(null);
    setState((current) => ({
      status: "disconnected",
      apiBaseUrl,
      repo: current.repo,
      branch: current.branch,
      hasToken: false
    }));
  }, [apiBaseUrl]);

  return { state, connect, refresh, disconnect };
}

function normalizeSyncInput(input: CliSyncInput): CliSyncInput {
  return {
    repo: input.repo.trim(),
    branch: input.branch.trim() || WENVY_DEFAULT_BRANCH,
    token: input.token.trim(),
    ...(input.knownHead?.trim() ? { knownHead: input.knownHead.trim() } : {})
  };
}

function readStoredSyncConfig(): StoredSyncConfig {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) {
      return { repo: "", branch: WENVY_DEFAULT_BRANCH };
    }
    const parsed = JSON.parse(raw) as Partial<StoredSyncConfig>;
    return {
      repo: typeof parsed.repo === "string" ? parsed.repo : "",
      branch: typeof parsed.branch === "string" && parsed.branch ? parsed.branch : WENVY_DEFAULT_BRANCH
    };
  } catch {
    return { repo: "", branch: WENVY_DEFAULT_BRANCH };
  }
}

function writeStoredSyncConfig(input: Pick<CliSyncInput, "repo" | "branch">): void {
  window.sessionStorage.setItem(storageKey, JSON.stringify({ repo: input.repo, branch: input.branch }));
}
