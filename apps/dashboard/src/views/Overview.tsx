import {
  WENVY_CLI_PACKAGE,
  WENVY_CLI_VERSION,
  WENVY_DEFAULT_BRANCH
} from "../product";
import type { FormEvent } from "react";
import type { CliSyncController } from "../use-cli-sync";
import type { ApiStatusState } from "../use-api-status";

export function Overview({ api, sync }: { readonly api: ApiStatusState; readonly sync: CliSyncController }) {
  const apiRoutes = api.status === "online" ? String(api.openApi.pathCount) : "checking";
  const apiDetail = api.status === "online" ? `${api.openApi.title} ${api.openApi.openapi}` : "live API health";
  const syncedHead =
    sync.state.status === "synced" ? sync.state.pull.headCommit ?? "empty" : sync.state.status === "syncing" ? "syncing" : "not connected";

  return (
    <>
      <div className="vhead">
        <h1>Wenvy dashboard</h1>
        <p>Paste the same repo, branch, and token used by the CLI. The dashboard calls the same pull endpoint.</p>
      </div>

      <div className="metrics">
        <div className="metric"><span className="metric__k">api routes</span><span className="metric__v">{apiRoutes}</span><span className="metric__d up">{apiDetail}</span></div>
        <div className="metric"><span className="metric__k">cli package</span><span className="metric__v">{WENVY_CLI_VERSION}</span><span className="metric__d up">npm install -g {WENVY_CLI_PACKAGE}</span></div>
        <div className="metric"><span className="metric__k">default branch</span><span className="metric__v">{WENVY_DEFAULT_BRANCH}</span><span className="metric__d">matches CLI init fallback</span></div>
        <div className="metric"><span className="metric__k">branch head</span><span className="metric__v metric__v--text">{syncedHead}</span><span className="metric__d up">from authenticated pull</span></div>
      </div>

      <SyncPanel sync={sync} />

      <h2 className="sect">CLI commands</h2>
      <table className="grid">
        <tbody>
          <tr><td className="b">install</td><td className="mono">npm install -g {WENVY_CLI_PACKAGE}</td><td className="mono dim">{WENVY_CLI_PACKAGE}@{WENVY_CLI_VERSION}</td></tr>
          <tr><td className="b">init</td><td className="mono">wenvy init --branch {WENVY_DEFAULT_BRANCH}</td><td className="mono dim">creates .wenvy/config.json</td></tr>
          <tr><td className="b">check</td><td className="mono">wenvy doctor</td><td className="mono dim">{api.status === "online" ? "API online" : "waiting"}</td></tr>
          <tr><td className="b">push</td><td className="mono">wenvy push snapshot.enc</td><td className="mono dim">updates branch head</td></tr>
          <tr><td className="b">pull</td><td className="mono">wenvy pull --output-file pulled.enc</td><td className="mono dim">same route as dashboard sync</td></tr>
        </tbody>
      </table>
    </>
  )
}

function SyncPanel({ sync }: { readonly sync: CliSyncController }) {
  const state = sync.state;

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await sync.connect({
      repo: String(form.get("repo") ?? ""),
      branch: String(form.get("branch") ?? ""),
      token: String(form.get("token") ?? ""),
      knownHead: String(form.get("knownHead") ?? "")
    });
  }

  return (
    <div className="sync">
      <div className="sync__head">
        <div>
          <h2 className="sect">Sync</h2>
          <p>Paste values from <code>.wenvy/config.json</code> and your <code>WENVY_TOKEN</code>. The token is only used for the pull request.</p>
        </div>
        {state.hasToken ? <button className="chip" type="button" onClick={sync.disconnect}>disconnect</button> : null}
      </div>

      <form className="sync__form" onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span>repo</span>
          <input name="repo" defaultValue={state.repo} placeholder="repo_..." required />
        </label>
        <label className="field">
          <span>branch</span>
          <input name="branch" defaultValue={state.branch || WENVY_DEFAULT_BRANCH} placeholder={WENVY_DEFAULT_BRANCH} required />
        </label>
        <label className="field">
          <span>token</span>
          <input name="token" type="password" placeholder="paste WENVY_TOKEN" required />
        </label>
        <label className="field">
          <span>known head</span>
          <input name="knownHead" placeholder="optional" />
        </label>
        <button className="sync__button" type="submit" disabled={state.status === "syncing"}>
          {state.status === "syncing" ? "syncing" : "sync"}
        </button>
      </form>

      <SyncResult sync={sync} />
    </div>
  );
}

function SyncResult({ sync }: { readonly sync: CliSyncController }) {
  const state = sync.state;
  if (state.status === "disconnected") {
    return <p className="sync__note">Token goes in the token field above. Repo and branch come from <code>.wenvy/config.json</code>.</p>;
  }
  if (state.status === "syncing") {
    return <p className="sync__note">Calling <code>{state.apiBaseUrl}/v1/repos/{state.repo}/branches/{state.branch}/pull</code>.</p>;
  }
  if (state.status === "failed") {
    return <p className="sync__error">{state.message}</p>;
  }

  const snapshot = state.pull.snapshot;
  return (
    <div className="sync__result">
      <div><span>repo</span><b>{state.repo}</b></div>
      <div><span>branch</span><b>{state.branch}</b></div>
      <div><span>pull status</span><b>{state.pull.status}</b></div>
      <div><span>head commit</span><b>{state.pull.headCommit ?? "empty"}</b></div>
      <div><span>snapshot commit</span><b>{snapshot?.commit ?? "none"}</b></div>
      <div><span>ciphertext</span><b>{snapshot ? `${snapshot.ciphertextSize} bytes` : "none"}</b></div>
      <div><span>sha256</span><b>{snapshot?.ciphertextSha256.slice(0, 16) ?? "none"}</b></div>
      <div><span>checked</span><b>{new Date(state.checkedAt).toLocaleTimeString()}</b></div>
    </div>
  );
}
