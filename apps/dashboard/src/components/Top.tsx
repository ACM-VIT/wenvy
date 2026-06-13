import { CRUMB, type ViewId } from '../data'
import type { ApiStatusState } from '../use-api-status'
import type { CliSyncState } from '../use-cli-sync'
import { WENVY_CLI_PACKAGE, WENVY_CLI_VERSION } from '../product'

export function Top({ view, api, sync }: { view: ViewId; api: ApiStatusState; sync: CliSyncState }) {
  const apiLabel =
    api.status === 'online'
      ? `${api.openApi.pathCount} API routes`
      : api.status === 'checking'
        ? 'checking API'
        : 'API degraded'
  const syncLabel =
    sync.status === 'synced'
      ? `${sync.repo} / ${sync.branch}`
      : sync.status === 'syncing'
        ? 'syncing CLI state'
        : sync.status === 'failed'
          ? 'sync failed'
          : `${WENVY_CLI_PACKAGE}@${WENVY_CLI_VERSION}`

  return (
    <header className="top">
      <div className="top__crumb"><span>{CRUMB[view]}</span></div>
      <a className={`top__api top__api--${api.status}`} href={api.apiBaseUrl} target="_blank" rel="noreferrer">
        <span className={`ping${api.status === 'online' ? ' ping--ok' : ' ping--warn'}`} />
        {apiLabel}
      </a>
      <div className="top__session">
        <span className={`ping${sync.status === 'synced' ? ' ping--ok' : ' ping--warn'}`} />{syncLabel}
      </div>
    </header>
  )
}
