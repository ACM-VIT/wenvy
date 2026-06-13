import {
  WENVY_CLI_PACKAGE,
  WENVY_CLI_VERSION,
  WENVY_DASHBOARD_URL,
  WENVY_DEFAULT_BRANCH,
  WENVY_LANDING_URL
} from "../product";
import type { ApiStatusState } from "../use-api-status";

export function Overview({ api }: { readonly api: ApiStatusState }) {
  const apiRoutes = api.status === "online" ? String(api.openApi.pathCount) : "checking";
  const apiRuntime = api.status === "online" ? api.health.runtime : "waiting for API";
  const apiDetail = api.status === "online" ? `${api.openApi.title} ${api.openApi.openapi}` : "live API health";

  return (
    <>
      <div className="vhead">
        <h1>Governance at a glance</h1>
        <p>CLI pushes encrypted snapshots to the Worker API; this console watches the same deployed control plane.</p>
      </div>

      <div className="metrics">
        <div className="metric"><span className="metric__k">api routes</span><span className="metric__v">{apiRoutes}</span><span className="metric__d up">{apiDetail}</span></div>
        <div className="metric"><span className="metric__k">cli package</span><span className="metric__v">{WENVY_CLI_VERSION}</span><span className="metric__d up">npm install -g {WENVY_CLI_PACKAGE}</span></div>
        <div className="metric"><span className="metric__k">default branch</span><span className="metric__v">{WENVY_DEFAULT_BRANCH}</span><span className="metric__d">matches CLI init fallback</span></div>
        <div className="metric"><span className="metric__k">runtime</span><span className="metric__v metric__v--text">{apiRuntime}</span><span className="metric__d up">Cloudflare deployment</span></div>
      </div>

      <div className="invariant">
        <span className="invariant__tick">✓</span>
        <p><b>Demo path is aligned.</b> Use <code>wenvy init</code>, <code>wenvy doctor</code>, <code>wenvy push</code>, and <code>wenvy pull</code> against <code>{api.apiBaseUrl}</code>, then keep this dashboard open at <code>{WENVY_DASHBOARD_URL}</code>.</p>
      </div>

      <div className="cols">
        <div className="col">
          <h2 className="sect">CLI flow</h2>
          <table className="grid">
            <tbody>
              <tr><td className="b">install</td><td><span className="cls cls--dev">npm</span></td><td className="mono">npm install -g {WENVY_CLI_PACKAGE}</td><td className="mono dim">{WENVY_CLI_PACKAGE}@{WENVY_CLI_VERSION}</td></tr>
              <tr><td className="b">init</td><td><span className="cls cls--pre">config</span></td><td className="mono">wenvy init --branch {WENVY_DEFAULT_BRANCH}</td><td className="mono dim">writes .wenvy/config.json</td></tr>
              <tr><td className="b">check</td><td><span className="cls cls--dev">health</span></td><td className="mono">wenvy doctor</td><td className="mono dim">{api.status === "online" ? "API online" : "waiting"}</td></tr>
              <tr><td className="b">push</td><td><span className="cls cls--prod">snapshot</span></td><td className="mono">wenvy push snapshot.enc</td><td className="mono dim">intent + blob + commit</td></tr>
              <tr><td className="b">pull</td><td><span className="cls cls--prod">snapshot</span></td><td className="mono">wenvy pull --output-file pulled.enc</td><td className="mono dim">same Worker API</td></tr>
            </tbody>
          </table>
        </div>

        <div className="col">
          <h2 className="sect">Live surfaces</h2>
          <ul className="feed">
            <li><span className="feed__t">api</span><span className={api.status === "online" ? "r-ok" : "r-warn"}>{api.status === "online" ? "ok" : "wait"}</span><p><a href={api.apiBaseUrl} target="_blank" rel="noreferrer">{api.apiBaseUrl}</a> exposes the CLI data plane</p></li>
            <li><span className="feed__t">dash</span><span className="r-ok">ok</span><p><a href={WENVY_DASHBOARD_URL} target="_blank" rel="noreferrer">{WENVY_DASHBOARD_URL}</a> reads the same API health and OpenAPI document</p></li>
            <li><span className="feed__t">site</span><span className="r-ok">ok</span><p><a href={WENVY_LANDING_URL} target="_blank" rel="noreferrer">{WENVY_LANDING_URL}</a> remains the landing surface</p></li>
            <li><span className="feed__t">npm</span><span className="r-ok">ok</span><p><a href={`https://www.npmjs.com/package/${WENVY_CLI_PACKAGE}`} target="_blank" rel="noreferrer">{WENVY_CLI_PACKAGE}</a> is the package used by the demo commands</p></li>
            <li><span className="feed__t">branch</span><span className="r-ok">ok</span><p><code>{WENVY_DEFAULT_BRANCH}</code> is the default branch shown in CLI and dashboard setup</p></li>
          </ul>
        </div>
      </div>
    </>
  )
}
