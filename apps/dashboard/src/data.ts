export type ViewId =
  | 'overview' | 'repos' | 'access' | 'keys' | 'rotations' | 'service' | 'audit'

export const NAV: { id: ViewId; label: string }[] = [
  { id: 'overview', label: 'overview' },
  { id: 'repos', label: 'routes' },
  { id: 'access', label: 'access' },
  { id: 'keys', label: 'snapshots' },
  { id: 'rotations', label: 'rotations' },
  { id: 'service', label: 'tokens' },
  { id: 'audit', label: 'audit' },
]

export const CRUMB: Record<ViewId, string> = {
  overview: 'overview',
  repos: 'routes',
  access: 'access',
  keys: 'snapshots',
  rotations: 'rotations',
  service: 'tokens',
  audit: 'audit',
}
