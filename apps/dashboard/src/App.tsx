import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Rail } from './components/Rail'
import { Top } from './components/Top'
import { Overview } from './views/Overview'
import { Repos } from './views/Repos'
import { Access } from './views/Access'
import { Keys } from './views/Keys'
import { Rotations } from './views/Rotations'
import { Service } from './views/Service'
import { Audit } from './views/Audit'
import type { ViewId } from './data'
import { useApiStatus, type ApiStatusState } from './use-api-status'

interface ViewProps {
  readonly api: ApiStatusState
}

const VIEWS: Record<ViewId, (props: ViewProps) => JSX.Element> = {
  overview: Overview,
  repos: Repos,
  access: Access,
  keys: Keys,
  rotations: Rotations,
  service: Service,
  audit: Audit,
}

export default function App() {
  const [view, setView] = useState<ViewId>('overview')
  const api = useApiStatus()
  const Active = VIEWS[view]

  return (
    <div className="shell">
      <Rail view={view} onNavigate={setView} />
      <main className="main">
        <Top view={view} api={api} />
        <AnimatePresence mode="wait">
          <motion.section
            key={view}
            className="view"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          >
            <Active api={api} />
          </motion.section>
        </AnimatePresence>
      </main>
    </div>
  )
}
