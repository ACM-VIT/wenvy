export function Keys() {
  return (
    <>
      <div className="vhead">
        <h1>Local snapshot flow</h1>
        <p>The browser cannot inspect local env files or keys; the CLI owns canonicalization, encryption, push, and pull.</p>
      </div>

      <table className="grid grid--head">
        <thead><tr><th>command</th><th>input</th><th>output</th><th>sync point</th></tr></thead>
        <tbody>
          <tr><td className="b">wenvy snapshot .env</td><td className="mono">plaintext env file</td><td className="mono dim">canonical text + SHA-256</td><td><span className="st st--warn">local only</span></td></tr>
          <tr><td className="b">wenvy push snapshot.enc</td><td className="mono">encrypted bytes</td><td className="mono dim">commit metadata in Worker</td><td><span className="st st--on">API</span></td></tr>
          <tr><td className="b">wenvy pull --output-file pulled.enc</td><td className="mono">repo + branch + token</td><td className="mono dim">encrypted bytes from R2</td><td><span className="st st--on">API</span></td></tr>
        </tbody>
      </table>

      <div className="invariant">
        <p><b>No fake SSH devices.</b> The dashboard now avoids showing keys or sessions that were not created through the API.</p>
      </div>
    </>
  )
}
