import { Logo } from './Logo'
import { NAV, type ViewId } from '../data'
import { WENVY_CLI_PACKAGE, WENVY_CLI_VERSION } from '../product'

export function Rail({ view, onNavigate }: { view: ViewId; onNavigate: (v: ViewId) => void }) {
  return (
    <aside className="rail">
      <a
        className="rail__brand"
        href="#"
        onClick={(e) => { e.preventDefault(); onNavigate('overview') }}
      >
        <Logo className="rail__logo" /><span className="rail__name">wenvy</span>
      </a>

      <nav className="rail__nav" aria-label="Sections">
        {NAV.map((n) => (
          <a
            key={n.id}
            href="#"
            className={`navlink${view === n.id ? ' is-active' : ''}`}
            onClick={(e) => { e.preventDefault(); onNavigate(n.id) }}
          >
            {n.label}
          </a>
        ))}
      </nav>

      <div className="rail__foot">
        <div className="who">
          <span className="who__dot" />
          <div><b>{WENVY_CLI_PACKAGE}@{WENVY_CLI_VERSION}</b><span>npm package in use</span></div>
        </div>
      </div>
    </aside>
  )
}
