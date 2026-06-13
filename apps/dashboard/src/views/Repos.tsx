import type { ApiStatusState } from "../use-api-status";

export function Repos({ api }: { readonly api: ApiStatusState }) {
  return (
    <>
      <div className="vhead">
        <h1>API routes</h1>
        <p>The dashboard lists routes from the live OpenAPI document instead of inventing repository rows.</p>
      </div>

      <table className="grid grid--head">
        <thead><tr><th>route</th><th>method</th><th>summary</th><th>auth</th></tr></thead>
        <tbody>
          {api.status === "online" ? (
            api.openApi.paths.map((route) => (
              <tr key={route.path}>
                <td className="mono">{route.path}</td>
                <td className="branchset">{route.methods.map((method) => <span key={method} className="bp bp--dev">{method}</span>)}</td>
                <td className="mono dim">{route.summary}</td>
                <td><span className={`st ${route.requiresAuth ? "st--warn" : "st--on"}`}>{route.requiresAuth ? "bearer" : "public"}</span></td>
              </tr>
            ))
          ) : (
            <tr><td className="b">waiting for API</td><td className="mono dim">-</td><td className="mono dim">{api.status === "checking" ? "checking OpenAPI document" : api.message}</td><td><span className="st st--warn">pending</span></td></tr>
          )}
        </tbody>
      </table>

      <div className="invariant">
        <p><b>No fake repository list.</b> The current API supports branch push, pull, blob upload, authorization, envelopes, rotations, and GitHub webhooks. Repository inventory should appear here only after the API exposes a real list endpoint.</p>
      </div>
    </>
  )
}
