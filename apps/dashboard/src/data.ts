export type ViewId =
  | 'overview' | 'repos' | 'access' | 'keys' | 'rotations' | 'service' | 'audit'

export const NAV: { id: ViewId; glyph: string; label: string; pip?: number }[] = [
  { id: 'overview', glyph: '▦', label: 'overview' },
  { id: 'repos', glyph: '⎙', label: 'repositories' },
  { id: 'access', glyph: '◑', label: 'teams & access' },
  { id: 'keys', glyph: '⚷', label: 'ssh keys' },
  { id: 'rotations', glyph: '↻', label: 'rotations', pip: 1 },
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

export type AuditResult = 'success' | 'denied' | 'security'

export interface AuditEvent {
  t: string
  res: AuditResult
  msg: string // may contain <b>/<code>/<span class="hl"> markup
  actor: string
  svc?: boolean
}

export const AUDIT: AuditEvent[] = [
  { t: '09:41:07', res: 'success', msg: '<b>rishit</b> pushed snapshot to <code>payments-api</code> ← staging', actor: 'ed25519 3c:2b' },
  { t: '09:36:55', res: 'denied', msg: '<b>ishaan</b> push to <code>payments-api</code> ← <span class="hl">production</span>, editor blocked by branch policy', actor: 'ed25519 7e:1a' },
  { t: '09:31:12', res: 'security', msg: 'SSH push rate ceiling reached', actor: 'svc gh-actions-prod', svc: true },
  { t: '09:22:48', res: 'success', msg: 'rotation <code>team/core-platform</code> → checkpoint <span class="hl">repo_keys_rewrapped</span>', actor: 'workflow rot_4e9a', svc: true },
  { t: '09:14:03', res: 'success', msg: '<b>adheesh</b> approved change request on <code>auth-secrets</code> ← production', actor: 'ed25519 77:88' },
  { t: '08:57:30', res: 'success', msg: '<b>adheesh</b> shared <code>edge-config</code> envelope with <b>rishit</b>', actor: 'ed25519 77:88' },
  { t: '08:51:19', res: 'success', msg: 'svc <code>gh-actions-prod</code> pulled <code>payments-api</code> ← production', actor: 'svc gh-actions-prod', svc: true },
  { t: '08:44:02', res: 'denied', msg: '<b>priya</b> pull on <code>payments-api</code>, membership removed', actor: 'ed25519 ff:00' },
  { t: '08:40:55', res: 'security', msg: 'envelope re-wrap requested without recovery proof, held for admin', actor: 'ed25519 ff:00' },
  { t: '08:31:40', res: 'success', msg: '<b>harshit</b> revoked member <b>priya</b> · rotation queued', actor: 'ed25519 a1:b2' },
  { t: '08:20:11', res: 'success', msg: '<b>harshit</b> opened magic-link session · fingerprint-bound', actor: 'web a1:b2' },
  { t: '08:02:37', res: 'success', msg: '<b>rishit</b> bridge-login → web session · ip-bound 49.36.x.x', actor: 'ed25519 3c:2b' },
  { t: '07:55:09', res: 'success', msg: 'svc <code>vercel-edge</code> pulled <code>web-dashboard</code> ← production', actor: 'svc vercel-edge', svc: true },
  { t: '07:41:22', res: 'security', msg: '3 failed SSH auth attempts from 185.x.x.x, throttled', actor: 'unknown' },
  { t: '07:30:00', res: 'success', msg: 'envelope consistency sweep, 0 drift across 3 teams', actor: 'cron envelope-check', svc: true },
]

export const FILTERS: { f: 'all' | AuditResult; label: string }[] = [
  { f: 'all', label: 'all' },
  { f: 'success', label: 'success' },
  { f: 'denied', label: 'denied' },
  { f: 'security', label: 'security' },
]
