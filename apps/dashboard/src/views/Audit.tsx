import { useState } from 'react'
import { AUDIT, FILTERS, type AuditResult } from '../data'

export function Audit() {
  const [filter, setFilter] = useState<'all' | AuditResult>('all')
  const rows = AUDIT.filter((e) => filter === 'all' || e.res === filter)

  return (
    <>
      <div className="vhead">
        <h1>Audit ledger</h1>
        <p>Append-only. Attributable to a user or a service account. Metadata only, never a secret value.</p>
      </div>

      <div className="filters">
        {FILTERS.map(({ f, label }) => (
          <button
            key={f}
            className={`chip${filter === f ? ' is-on' : ''}`}
            onClick={() => setFilter(f)}
          >
            {label}
          </button>
        ))}
      </div>

      <ol className="audit">
        {rows.map((e, i) => (
          <li key={`${e.t}-${i}`}>
            <span className="audit__t">{e.t}</span>
            <span className={`audit__res res-${e.res}`}>{e.res}</span>
            {/* msg is trusted, static, internal copy, not user input */}
            <span className="audit__msg" dangerouslySetInnerHTML={{ __html: e.msg }} />
            <span className={`audit__actor${e.svc ? ' svc' : ''}`}>{e.actor}</span>
          </li>
        ))}
      </ol>
    </>
  )
}
