import type { ApiStatusState } from "../use-api-status";

export function Rotations({ api }: { readonly api: ApiStatusState }) {
  const hasRotationEndpoint =
    api.status === "online" && api.openApi.paths.some((route) => route.path === "/v1/rotations");

  return (
    <>
      <div className="vhead">
        <h1>Rotations</h1>
        <p>Rotation requests are API-backed; this page does not fabricate in-progress jobs.</p>
      </div>

      <table className="grid grid--head">
        <thead><tr><th>capability</th><th>route</th><th>state</th><th>note</th></tr></thead>
        <tbody>
          <tr>
            <td className="b">enqueue rotation</td>
            <td className="mono">POST /v1/rotations</td>
            <td><span className={`st ${hasRotationEndpoint ? "st--on" : "st--warn"}`}>{hasRotationEndpoint ? "available" : "checking"}</span></td>
            <td className="mono dim">queued by Worker queue/workflow bindings</td>
          </tr>
        </tbody>
      </table>

      <div className="invariant">
        <span className="invariant__tick">✓</span>
        <p><b>No animated fake rotation.</b> Job history belongs here after the API exposes persisted rotation status.</p>
      </div>
    </>
  )
}
