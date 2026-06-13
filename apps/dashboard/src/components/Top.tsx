import { CRUMB, type ViewId } from '../data'
import { useApiStatus } from '../use-api-status'

export function Top({ view }: { view: ViewId }) {
  const api = useApiStatus()
  const apiLabel =
    api.status === 'online'
      ? `${api.openApi.pathCount} API routes`
      : api.status === 'checking'
        ? 'checking API'
        : 'API degraded'

  return (
    <header className="top">
      <div className="top__crumb"><span>{CRUMB[view]}</span></div>
      <div className="top__search">
        <span>⌕</span>
        <input type="text" placeholder="filter repos, members, events…" aria-label="Filter" />
      </div>
      <a className={`top__api top__api--${api.status}`} href={api.apiBaseUrl} target="_blank" rel="noreferrer">
        <span className={`ping${api.status === 'online' ? ' ping--ok' : ' ping--warn'}`} />
        {apiLabel}
      </a>
      <div className="top__session">
        <span className="ping ping--ok" />ssh.wenvy.dev
      </div>
    </header>
  )
}
