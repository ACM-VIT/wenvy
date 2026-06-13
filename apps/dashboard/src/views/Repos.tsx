export function Repos() {
  return (
    <>
      <div className="vhead"><h1>Repositories</h1><p>Secret repos by owning team. Counts are commits, never contents.</p></div>
      <table className="grid grid--head">
        <thead><tr><th>repo</th><th>owning team</th><th>branches</th><th>last commit</th><th>commits</th><th>access</th></tr></thead>
        <tbody>
          <tr><td className="b">payments-api</td><td className="mono">core-platform</td><td className="branchset"><span className="bp bp--dev">dev</span><span className="bp bp--pre">staging</span><span className="bp bp--prod">production</span></td><td className="mono dim">9f2c · 09:41</td><td className="mono">1,204</td><td className="mono dim">+2 teams</td></tr>
          <tr><td className="b">edge-config</td><td className="mono">core-platform</td><td className="branchset"><span className="bp bp--dev">dev</span><span className="bp bp--prod">production</span></td><td className="mono dim">4e9a · 08:57</td><td className="mono">512</td><td className="mono dim">·</td></tr>
          <tr><td className="b">auth-secrets</td><td className="mono">security</td><td className="branchset"><span className="bp bp--dev">dev</span><span className="bp bp--pre">staging</span><span className="bp bp--prod">production</span></td><td className="mono dim">c731 · yest</td><td className="mono">2,038</td><td className="mono dim">restricted</td></tr>
          <tr><td className="b">ml-pipeline</td><td className="mono">data</td><td className="branchset"><span className="bp bp--dev">dev</span><span className="bp bp--pre">release/*</span></td><td className="mono dim">a17b · 2d</td><td className="mono">144</td><td className="mono dim">+1 team</td></tr>
          <tr><td className="b">web-dashboard</td><td className="mono">frontend</td><td className="branchset"><span className="bp bp--dev">dev</span><span className="bp bp--pre">staging</span><span className="bp bp--prod">production</span></td><td className="mono dim">88f0 · 3d</td><td className="mono">876</td><td className="mono dim">·</td></tr>
        </tbody>
      </table>

      <h2 className="sect sect--mt">Pending branch change requests</h2>
      <table className="grid">
        <tbody>
          <tr><td className="b">payments-api → production</td><td className="mono dim">by rishit · commit 9f2c</td><td><span className="bar"><i style={{ width: '50%' }} /></span></td><td className="mono">1 / 2 approvals</td><td><span className="cls cls--pre">pending</span></td></tr>
          <tr><td className="b">auth-secrets → production</td><td className="mono dim">by adheesh · commit c731</td><td><span className="bar"><i style={{ width: '100%' }} /></span></td><td className="mono">2 / 2 approvals</td><td><span className="cls cls--dev">approved</span></td></tr>
        </tbody>
      </table>
    </>
  )
}
