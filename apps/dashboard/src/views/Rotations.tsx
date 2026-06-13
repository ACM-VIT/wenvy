import { useEffect, useState } from 'react'

export function Rotations() {
  const [done, setDone] = useState(4)

  useEffect(() => {
    const id = setInterval(() => setDone((d) => (d < 5 ? d + 1 : d)), 5200)
    return () => clearInterval(id)
  }, [])

  return (
    <>
      <div className="vhead"><h1>Key rotation</h1><p>Each rotation is a checkpointed saga, idempotent, resumable, audited.</p></div>

      <div className="rot rot--live">
        <div className="rot__top">
          <span className="rot__scope">team / core-platform</span>
          <span className="cls cls--pre">running · v3 → v4</span>
        </div>
        <p className="rot__why">triggered by member removal, <b>priya v.</b> · 8m ago</p>
        <ol className="steps">
          <li className="done"><span className="steps__dot" />key_generated</li>
          <li className="done"><span className="steps__dot" />envelopes_wrapped</li>
          <li className="active"><span className="steps__dot" />repo_keys_rewrapped <em>{done} / 5</em></li>
          <li><span className="steps__dot" />old_key_retired</li>
        </ol>
      </div>

      <h2 className="sect sect--mt">Recent rotations</h2>
      <table className="grid grid--head">
        <thead><tr><th>scope</th><th>trigger</th><th>checkpoint</th><th>duration</th><th>result</th></tr></thead>
        <tbody>
          <tr><td className="b">repo / auth-secrets</td><td className="mono dim">scheduled policy</td><td className="mono">old_key_retired</td><td className="mono">1:58</td><td><span className="st st--on">completed</span></td></tr>
          <tr><td className="b">team / security</td><td className="mono dim">ssh key compromise</td><td className="mono">old_key_retired</td><td className="mono">3:12</td><td><span className="st st--on">completed</span></td></tr>
          <tr><td className="b">repo / payments-api</td><td className="mono dim">secondary access revoked</td><td className="mono">old_key_retired</td><td className="mono">2:41</td><td><span className="st st--on">completed</span></td></tr>
          <tr><td className="b dim">team / data</td><td className="mono dim">incident response</td><td className="mono">repo_keys_rewrapped</td><td className="mono">· retried</td><td><span className="st st--warn">recovered</span></td></tr>
        </tbody>
      </table>
    </>
  )
}
