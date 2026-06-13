import { WENVY_DEFAULT_BRANCH } from "../product";

export function Access() {
  return (
    <>
      <div className="vhead">
        <h1>Access model</h1>
        <p>The CLI authenticates with a service account token; branch access is enforced by the Worker before push or pull.</p>
      </div>

      <table className="grid grid--head">
        <thead><tr><th>step</th><th>source</th><th>what is checked</th><th>dashboard state</th></tr></thead>
        <tbody>
          <tr><td className="b">token</td><td className="mono">WENVY_TOKEN</td><td className="mono dim">bearer token present in CLI request</td><td><span className="st st--warn">never displayed</span></td></tr>
          <tr><td className="b">repo</td><td className="mono">.wenvy/config.json</td><td className="mono dim">repo id sent in route and blob headers</td><td><span className="st st--warn">local only</span></td></tr>
          <tr><td className="b">branch</td><td className="mono">{WENVY_DEFAULT_BRANCH}</td><td className="mono dim">branch allow-list and capability</td><td><span className="st st--on">documented</span></td></tr>
          <tr><td className="b">operation</td><td className="mono">push / pull</td><td className="mono dim">service account policy permits the action</td><td><span className="st st--on">enforced by API</span></td></tr>
        </tbody>
      </table>

      <div className="invariant">
        <p><b>No member dummy data.</b> Users, teams, and grants need real API endpoints before the dashboard can show them. Until then, this view mirrors the access checks the CLI actually triggers.</p>
      </div>
    </>
  )
}
