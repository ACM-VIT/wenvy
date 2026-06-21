# CLI Contract v1

## Commands

The initial command surface is:

```text
wenvy init | clone | remote | fetch | pull | push
wenvy status | diff | add | commit | log
wenvy branch | checkout | merge
wenvy identity list | use | link | revoke
wenvy account email list | add | primary
wenvy secret set | attach | remove | reveal
wenvy rotation status | submit
```

Commands use Git-derived exit behavior: zero for success, non-zero for failure, and
stable machine-readable error codes with `--format json`. Human output may evolve
without changing those codes.

## Safety and Identity

- Secret values are redacted by default in status, diff, log, and merge output.
- Plaintext reveal requires an explicit command/flag and local confirmation when
  interactive. Plaintext is never emitted to structured logs.
- Before fetch, pull, or push, output identifies the active SSH fingerprint label
  and linked Wenvy account. `--quiet` may suppress successful context output but
  never mismatch warnings.
- Successful commit output always shows commit ID and `Committed by: <handle>`.
- `push` on `author_identity_mismatch` makes no remote ref change and prints the
  exact local recovery requirement: revert offending commits, select an eligible
  identity/account, and recreate them.

## Secret Values

`secret set` accepts normalized UTF-8 key names and UTF-8 text values. `secret
attach` stores arbitrary bytes with a media type. Key normalization collisions
block staging/commit and list the colliding local paths without revealing values.

## Merge

Three-way merge uses normalized key identity. One-sided changes and identical
two-sided results resolve automatically. Different two-sided additions or
modifications, delete-versus-modify, and renames remain conflicted. The user must
resolve every conflict and create a merge commit.

## Local Exit Codes

- `0`: success
- `1`: operation failed
- `2`: invalid command/input
- `3`: merge conflicts remain
- `4`: authentication or active identity error
- `5`: authorization or rotation policy denial
- `6`: non-fast-forward/concurrent ref update
- `7`: unsupported contract/object version

Automation should prefer `--format json`, whose schema includes `version`,
`operation`, `status`, `code`, `message`, `request_id`, and safe `details`.
