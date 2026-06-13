export function Keys() {
  return (
    <>
      <div className="vhead"><h1>SSH keys &amp; devices</h1><p>Every key is an envelope recipient. Revoke one and its envelopes are cut.</p></div>
      <table className="grid grid--head">
        <thead><tr><th>fingerprint</th><th>owner</th><th>label</th><th>alg</th><th>last used</th><th>status</th></tr></thead>
        <tbody>
          <tr><td className="mono">a1:b2:c3:…:9f</td><td className="b">harshit narang</td><td className="mono dim">mbp-16</td><td className="mono">ed25519</td><td className="mono dim">now</td><td><span className="st st--on">active</span></td></tr>
          <tr><td className="mono">d4:e5:f6:…:21</td><td className="b">harshit narang</td><td className="mono dim">desktop</td><td className="mono">ed25519</td><td className="mono dim">1d</td><td><span className="st st--on">active</span></td></tr>
          <tr><td className="mono">77:88:99:…:0a</td><td className="b">adheesh garg</td><td className="mono dim">ci-laptop</td><td className="mono">ed25519</td><td className="mono dim">4m</td><td><span className="st st--on">active</span></td></tr>
          <tr><td className="mono">3c:2b:1a:…:ff</td><td className="b">rishit shivam</td><td className="mono dim">old-air</td><td className="mono">rsa-2048</td><td className="mono dim">31d</td><td><span className="st st--off">revoked</span></td></tr>
        </tbody>
      </table>

      <h2 className="sect sect--mt">Web sessions</h2>
      <table className="grid">
        <tbody>
          <tr><td className="b">harshit narang</td><td className="mono dim">magic-link · fingerprint-bound</td><td className="mono">103.21.x.x · chrome/mac</td><td className="mono dim">expires 6h</td><td><span className="st st--on">active</span></td></tr>
          <tr><td className="b">rishit shivam</td><td className="mono dim">ssh→web bridge · ip-bound</td><td className="mono">49.36.x.x · firefox/linux</td><td className="mono dim">expires 12m</td><td><span className="st st--on">active</span></td></tr>
        </tbody>
      </table>
    </>
  )
}
