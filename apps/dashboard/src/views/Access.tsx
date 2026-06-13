export function Access() {
  return (
    <>
      <div className="vhead"><h1>Teams &amp; access</h1><p>Role is baseline capability; branch policy can only narrow it.</p></div>
      <table className="grid grid--head">
        <thead><tr><th>member</th><th>team</th><th>role</th><th>devices</th><th>last active</th><th>status</th></tr></thead>
        <tbody>
          <tr><td className="b">harshit narang</td><td className="mono">core-platform</td><td><span className="role role--owner">owner</span></td><td className="mono">3</td><td className="mono dim">now</td><td><span className="st st--on">active</span></td></tr>
          <tr><td className="b">adheesh garg</td><td className="mono">core-platform</td><td><span className="role role--admin">admin</span></td><td className="mono">2</td><td className="mono dim">4m</td><td><span className="st st--on">active</span></td></tr>
          <tr><td className="b">rishit shivam</td><td className="mono">core-platform</td><td><span className="role role--editor">editor</span></td><td className="mono">2</td><td className="mono dim">just now</td><td><span className="st st--on">active</span></td></tr>
          <tr><td className="b">ishaan samdani</td><td className="mono">frontend</td><td><span className="role role--editor">editor</span></td><td className="mono">1</td><td className="mono dim">12m</td><td><span className="st st--on">active</span></td></tr>
          <tr><td className="b dim">priya v.</td><td className="mono">data</td><td><span className="role role--viewer">viewer</span></td><td className="mono">1</td><td className="mono dim">2d</td><td><span className="st st--off">removed</span></td></tr>
        </tbody>
      </table>

      <h2 className="sect sect--mt">Multi-team repo grants</h2>
      <table className="grid">
        <tbody>
          <tr><td className="b">payments-api</td><td className="mono dim">→ data</td><td className="mono">ceiling: <span className="role role--viewer">viewer</span></td><td className="mono dim">granted by harshit · 6d</td><td><span className="st st--on">active</span></td></tr>
          <tr><td className="b">payments-api</td><td className="mono dim">→ security</td><td className="mono">ceiling: <span className="role role--editor">editor</span></td><td className="mono dim">granted by harshit · 6d</td><td><span className="st st--on">active</span></td></tr>
          <tr><td className="b">ml-pipeline</td><td className="mono dim">→ frontend</td><td className="mono">ceiling: <span className="role role--viewer">viewer</span></td><td className="mono dim">revoked · rotation queued</td><td><span className="st st--warn">rotating</span></td></tr>
        </tbody>
      </table>
    </>
  )
}
