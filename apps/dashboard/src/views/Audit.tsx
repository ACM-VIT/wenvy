import type { ApiStatusState } from "../use-api-status";

export function Audit({ api }: { readonly api: ApiStatusState }) {
  return (
    <>
      <div className="vhead">
        <h1>Audit ledger</h1>
        <p>The Worker writes audit events for protected actions, but the public API does not expose an audit feed yet.</p>
      </div>

      <table className="grid grid--head">
        <thead><tr><th>source</th><th>current API support</th><th>dashboard behavior</th><th>status</th></tr></thead>
        <tbody>
          <tr><td className="b">push commit</td><td className="mono">audit queue send on success</td><td className="mono dim">not listed until read endpoint exists</td><td><span className="st st--warn">write-only</span></td></tr>
          <tr><td className="b">pull snapshot</td><td className="mono">audit queue send on success</td><td className="mono dim">not listed until read endpoint exists</td><td><span className="st st--warn">write-only</span></td></tr>
          <tr><td className="b">denied access</td><td className="mono">audit queue send on denial</td><td className="mono dim">not listed until read endpoint exists</td><td><span className="st st--warn">write-only</span></td></tr>
          <tr><td className="b">API document</td><td className="mono">{api.status === "online" ? `${api.openApi.pathCount} routes` : "checking"}</td><td className="mono dim">shown live across dashboard</td><td><span className={`st ${api.status === "online" ? "st--on" : "st--warn"}`}>{api.status}</span></td></tr>
        </tbody>
      </table>

      <div className="invariant">
        <p><b>No fake audit log.</b> This page now reflects the real backend boundary instead of showing invented user activity.</p>
      </div>
    </>
  )
}
