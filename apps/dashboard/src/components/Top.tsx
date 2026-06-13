import { CRUMB, type ViewId } from '../data'

export function Top({ view }: { view: ViewId }) {
  return (
    <header className="top">
      <div className="top__crumb"><span>{CRUMB[view]}</span></div>
      <div className="top__search">
        <span>⌕</span>
        <input type="text" placeholder="filter repos, members, events…" aria-label="Filter" />
      </div>
      <div className="top__session">
        <span className="ping ping--ok" />ssh.wenvy.dev
      </div>
    </header>
  )
}
