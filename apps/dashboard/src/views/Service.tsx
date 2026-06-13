export function Service() {
  return (
    <>
      <div className="vhead"><h1>Service accounts</h1><p>Machine identities. Scoped tokens, branch allow-lists, no governance powers.</p></div>
      <table className="grid grid--head">
        <thead><tr><th>account</th><th>scope</th><th>allowed branches</th><th>capability</th><th>last used</th><th>status</th></tr></thead>
        <tbody>
          <tr><td className="b">gh-actions-prod</td><td className="mono">repo / payments-api</td><td className="mono"><span className="bp bp--prod">production</span></td><td><span className="cap cap--pull">pull-only</span></td><td className="mono dim">2m</td><td><span className="st st--on">active</span></td></tr>
          <tr><td className="b">gh-actions-stg</td><td className="mono">repo / payments-api</td><td className="mono"><span className="bp bp--pre">staging</span><span className="bp bp--dev">dev</span></td><td><span className="cap cap--push">push+pull</span></td><td className="mono dim">11m</td><td><span className="st st--on">active</span></td></tr>
          <tr><td className="b">vercel-edge</td><td className="mono">team / frontend</td><td className="mono"><span className="bp bp--prod">production</span></td><td><span className="cap cap--pull">pull-only</span></td><td className="mono dim">1h</td><td><span className="st st--on">active</span></td></tr>
          <tr><td className="b dim">legacy-runner</td><td className="mono">repo / ml-pipeline</td><td className="mono dim">dev</td><td><span className="cap cap--pull">pull-only</span></td><td className="mono dim">14d</td><td><span className="st st--off">revoked</span></td></tr>
        </tbody>
      </table>
    </>
  )
}
