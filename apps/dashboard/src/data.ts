export type ViewId =
  | 'overview' | 'repos' | 'access' | 'keys' | 'rotations' | 'service' | 'audit'

export const NAV: { id: ViewId; glyph: string; label: string; pip?: number }[] = [
  { id: 'overview', glyph: '▦', label: 'overview' },
  { id: 'repos', glyph: '⎙', label: 'repositories' },
  { id: 'access', glyph: '◑', label: 'teams & access' },
  { id: 'keys', glyph: '⚷', label: 'ssh keys' },
  { id: 'rotations', glyph: '↻', label: 'rotations' },
  { id: 'service', glyph: '⊞', label: 'service accounts' },
  { id: 'audit', glyph: '≣', label: 'audit ledger' },
]

export const CRUMB: Record<ViewId, string> = {
  overview: 'overview',
  repos: 'repositories',
  access: 'teams & access',
  keys: 'ssh keys',
  rotations: 'rotations',
  service: 'service accounts',
  audit: 'audit ledger',
}
