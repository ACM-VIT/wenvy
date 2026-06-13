import type { ApiStatusState } from "../use-api-status";

export function Service({ api }: { readonly api: ApiStatusState }) {
  const protectedRoutes =
    api.status === "online" ? api.openApi.paths.filter((route) => route.requiresAuth) : [];

  return (
    <>
      <div className="vhead">
        <h1>Service accounts</h1>
        <p>The CLI sends a bearer token; the API validates service account scope before data-plane actions.</p>
      </div>

      <table className="grid grid--head">
        <thead><tr><th>protected route</th><th>method</th><th>summary</th><th>credential</th></tr></thead>
        <tbody>
          {protectedRoutes.length > 0 ? (
            protectedRoutes.map((route) => (
              <tr key={route.path}>
                <td className="mono">{route.path}</td>
                <td className="branchset">{route.methods.map((method) => <span key={method} className="bp bp--prod">{method}</span>)}</td>
                <td className="mono dim">{route.summary}</td>
                <td><span className="st st--warn">WENVY_TOKEN</span></td>
              </tr>
            ))
          ) : (
            <tr><td className="b">waiting for API</td><td className="mono dim">-</td><td className="mono dim">protected routes load from OpenAPI</td><td><span className="st st--warn">pending</span></td></tr>
          )}
        </tbody>
      </table>

      <div className="invariant">
        <span className="invariant__tick">✓</span>
        <p><b>No fake service accounts.</b> Token inventory should appear only after the API exposes a real service-account list endpoint.</p>
      </div>
    </>
  )
}
