export const problems = [
  {
    n: 'i.',
    title: 'Plaintext sprawl',
    body: 'Keys get pasted into chat, committed by accident, and copied between laptops. Once a secret is in a Slack thread, it is everywhere and nowhere.',
    tag: 'leak surface',
  },
  {
    n: 'ii.',
    title: 'Environment drift',
    body: 'Dev isn’t staging, staging isn’t production. Without a single source of truth, “works on my machine” becomes a deploy-time mystery.',
    tag: 'dev ≠ staging ≠ prod',
  },
  {
    n: 'iii.',
    title: 'No history, no blame',
    body: 'Who rotated DATABASE_URL last Tuesday, and to what? Flat files have no commits, no signatures, no audit.',
    tag: 'zero provenance',
    code: 'DATABASE_URL',
  },
  {
    n: 'iv.',
    title: 'Sharing without revoking',
    body: 'Hand someone a secret and you can never take it back. No rotation, no key hierarchy, no way to cut access when a laptop walks out the door.',
    tag: 'irreversible',
  },
] as const

export const verbs = [
  ['wenvy push', 'seal & upload a snapshot'],
  ['wenvy pull', 'fetch head, envelopes, blob ref'],
  ['wenvy share', 'wrap keys for a teammate'],
  ['wenvy rotate', 'roll a team or repo key'],
  ['wenvy keys', 'add / list / revoke devices'],
  ['wenvy bridge-login', 'terminal → browser session'],
] as const

export const features = [
  { n: '01', title: 'End-to-end encryption', body: 'Encrypt and decrypt only on the client. The server enforces access but is cryptographically blind to your plaintext.', tag: 'zero-knowledge' },
  { n: '02', title: 'SSH-first by design', body: 'Your existing SSH key is your identity and your decryption root. No new passwords, no browser detours.', tag: 'ed25519 / rsa' },
  { n: '03', title: 'Branch-based access', body: 'dev, staging and production are first-class policy targets. Unmatched branches fall through to default-deny.', tag: 'exact › prefix › *' },
  { n: '04', title: 'Team RBAC', body: 'Viewer, editor, admin, owner at org, team and repo scope. Share a repo with a second team without cloning a secret.', tag: '4 roles · multi-team' },
  { n: '05', title: 'Rotation & recovery', body: 'Revoke a member and roll the team key as a checkpointed saga. A BIP39 recovery key brings you back without an admin.', tag: 'saga · bip39' },
  { n: '06', title: 'Immutable audit', body: 'Every login, share, rotation and denied write is an append-only event, attributable to a user or service account.', tag: 'append-only' },
] as const

export const stages = [
  { name: 'dev', cls: 'development', body: 'Editors and above push freely. Move fast, break nothing downstream.', prod: false },
  { name: 'staging', cls: 'preproduction', body: 'Editors propose; admins approve and merge. Optional required-approval counts.', prod: false },
  { name: 'production', cls: 'protected', body: 'No direct editor writes. Admin/owner only, behind freeze windows and approvals.', prod: true },
] as const
