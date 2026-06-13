export function Overview() {
  return (
    <>
      <div className="vhead">
        <h1>Governance at a glance</h1>
        <p>Everything the control plane can see, and nothing it can decrypt.</p>
      </div>

      <div className="metrics">
        <div className="metric"><span className="metric__k">push p50</span><span className="metric__v">312<i>ms</i></span><span className="metric__d up">within SLO</span></div>
        <div className="metric"><span className="metric__k">rotation SLA</span><span className="metric__v">2:41<i>min</i></span><span className="metric__d up">≤ 5:00 target</span></div>
        <div className="metric"><span className="metric__k">denied writes / 24h</span><span className="metric__v">7</span><span className="metric__d">all on production</span></div>
        <div className="metric"><span className="metric__k">envelope drift</span><span className="metric__v">0</span><span className="metric__d up">checked 41m ago</span></div>
      </div>

      <div className="invariant">
        <span className="invariant__tick">✓</span>
        <p><b>Envelope consistency holds.</b> Every active member and service account has an envelope for team key <code>v3</code>. No envelope references a revoked SSH key. Last sweep 41 minutes ago.</p>
      </div>

      <div className="cols">
        <div className="col">
          <h2 className="sect">Branch protection</h2>
          <table className="grid">
            <tbody>
              <tr><td className="b">production</td><td><span className="cls cls--prod">protected</span></td><td className="mono">2 approvals · freeze · no force-push</td><td className="mono dim">owner / admin</td></tr>
              <tr><td className="b">staging</td><td><span className="cls cls--pre">preproduction</span></td><td className="mono">1 approval on merge</td><td className="mono dim">editor → admin</td></tr>
              <tr><td className="b">dev</td><td><span className="cls cls--dev">development</span></td><td className="mono">open writes</td><td className="mono dim">editor +</td></tr>
              <tr><td className="b">release/*</td><td><span className="cls cls--pre">prefix rule</span></td><td className="mono">inherits staging</td><td className="mono dim">admin</td></tr>
              <tr><td className="b dim">* (fallthrough)</td><td><span className="cls cls--deny">default-deny</span></td><td className="mono">no policy match</td><td className="mono dim">admin / owner only</td></tr>
            </tbody>
          </table>
        </div>

        <div className="col">
          <h2 className="sect">Latest events</h2>
          <ul className="feed">
            <li><span className="feed__t">09:41</span><span className="r-ok">ok</span><p><b>rishit</b> pushed <code>payments-api</code> ← <span className="hl">staging</span></p></li>
            <li><span className="feed__t">09:36</span><span className="r-deny">denied</span><p><b>ishaan</b> push to <span className="hl">production</span>, role <code>editor</code> blocked</p></li>
            <li><span className="feed__t">09:22</span><span className="r-ok">ok</span><p>rotation <code>team/core-platform</code> reached <span className="hl">repo_keys_rewrapped</span></p></li>
            <li><span className="feed__t">08:57</span><span className="r-ok">ok</span><p><b>adheesh</b> shared <code>edge-config</code> with <b>rishit</b></p></li>
            <li><span className="feed__t">08:40</span><span className="r-warn">warn</span><p>svc <code>gh-actions-prod</code> hit pull rate ceiling</p></li>
          </ul>
        </div>
      </div>
    </>
  )
}
