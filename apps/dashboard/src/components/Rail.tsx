import { Koi } from './Koi'
import { Logo } from './Logo'
import { NAV, type ViewId } from '../data'

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

      <button className="switcher" aria-label="Switch organization">
        <span className="switcher__org">acm-vit</span>
        <span className="switcher__team">core-platform · key v3</span>
        <span className="switcher__chev">⌄</span>
      </button>

      <nav className="rail__nav" aria-label="Sections">
        {NAV.map((n) => (
          <a
            key={n.id}
            href="#"
            className={`navlink${view === n.id ? ' is-active' : ''}`}
            onClick={(e) => { e.preventDefault(); onNavigate(n.id) }}
          >
            <span className="navlink__g">{n.glyph}</span>{n.label}
            {n.pip ? <span className="navlink__pip">{n.pip}</span> : null}
          </a>
        ))}
      </nav>

      <div className="rail__foot">
        <Koi className="rail__koi" />
        <div className="who">
          <span className="who__dot" />
          <div><b>harshit narang</b><span>owner · ed25519 a1:b2</span></div>
        </div>
        <p className="rail__creed">plaintext never leaves your device</p>
      </div>
    </aside>
  )
}
