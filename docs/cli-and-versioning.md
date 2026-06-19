# CLI and Versioning Specification

## 1. UX Contract

Wenvy follows Git terminology and command behavior where that remains compatible with branch-specific encryption. Commands operate on key-value state rather than files.

```text
encrypted working state -> encrypted index -> commit -> local branch -> remote branch
```

No command creates a plaintext working file unless the user explicitly requests an export.

## 2. Command Surface

### Repository and remotes

- `wenvy init [directory]`
- `wenvy clone <ssh-url> [directory]`
- `wenvy remote add|remove|rename|get-url|set-url`
- `wenvy fetch [remote]`
- `wenvy pull [--ff-only|--rebase|--no-rebase] [remote] [branch]`
- `wenvy push [-u|--set-upstream] [--force-with-lease] [--change-request] [remote] [branch]`

`pull` defaults to `--ff-only`. Plain `--force` is not supported; `--force-with-lease` remains subject to branch policy.

### Working state and index

- `wenvy status [--short]`
- `wenvy diff [--staged] [--show-values] [<key>...]`
- `wenvy add <key>... | --all`
- `wenvy restore [--staged] <key>...`
- `wenvy commit -m <message>`
- `wenvy log [--oneline|--graph]`
- `wenvy show [<commit>] [--show-values]`

Values are redacted in `diff`, `show`, conflict output, and logs unless `--show-values` is explicitly supplied.

### Key-value operations

- `wenvy set <key> [--stdin|--file <path>|--prompt]`
- `wenvy get <key> [--raw]`
- `wenvy unset <key>...`
- `wenvy list [--format table|json]`
- `wenvy import --format dotenv|json <path|->`
- `wenvy export --format dotenv|json <path|->`
- `wenvy run -- <command> [args...]`

`set` defaults to a hidden prompt when no input source is supplied. Secret values are never accepted as positional command arguments. Exporting to a file requires confirmation unless `--force` is present.

### Branches and merges

- `wenvy branch [--list|--delete|--move]`
- `wenvy switch <branch>`
- `wenvy switch -c <branch> [<start-point>]`
- `wenvy checkout <branch|commit>` as a compatibility alias.
- `wenvy merge <source>`
- `wenvy merge --continue|--abort`

### Stash

- `wenvy stash push [-m <message>] [--keep-index] [<key>...]`
- `wenvy stash list`
- `wenvy stash show [--show-values] [<stash>]`
- `wenvy stash apply|pop [<stash>]`
- `wenvy stash drop [<stash>]`
- `wenvy stash clear`

Stashes are local-only encrypted objects. A stash stores its base commit plus separate staged and unstaged key deltas. Applying a stash uses the same three-way merge rules as branch merges.

### Identity and access

- `wenvy auth enroll|status`
- `wenvy unlock|lock`
- `wenvy email add|verify|primary|remove|list`
- `wenvy ssh-key add|list|revoke`
- `wenvy group create|list|member`
- `wenvy access request|approve|deny|list`
- `wenvy rotate status|claim|resume`

## 3. K-V Contract

- Keys are non-empty, case-sensitive UTF-8 strings normalized to NFC.
- Two keys that normalize to the same byte sequence are duplicates and are rejected.
- Values are arbitrary byte strings; an optional client-only media type may describe them.
- Key names and values are encrypted together in an item-version payload.
- Stable item IDs are random 128-bit identifiers and reveal no key name.
- Deletion removes the item from the new tree; historical commits retain the old item version.

Dotenv import accepts only valid dotenv identifiers. Dotenv export and `wenvy run` fail with a list of incompatible keys rather than silently rewriting them. JSON import/export preserves arbitrary UTF-8 key names and base64-encodes non-UTF-8 values.

## 4. Local Repository Layout

```text
.wenvy/
├── config.json
├── HEAD
├── refs/
│   ├── heads/
│   ├── remotes/origin/
│   └── stash
├── index.enc
├── worktree.enc
├── objects/
├── envelopes/
├── rotation/
└── logs/operations.log
```

- `config.json`, refs, and object IDs contain no secret names or values.
- `index.enc`, `worktree.enc`, stashes, cached payloads, and cached envelopes are encrypted with a local-state key derived from the unlocked account bundle.
- Decrypted account keys and local-state keys exist only in the memory agent.
- Locking removes memory-held keys; encrypted local state remains available but unreadable.

## 5. Commit and Tree Model

Cryptographic objects use deterministic CBOR as defined by RFC 8949. Map keys are fixed integer field identifiers, arrays preserve specified order, integers use shortest encoding, and duplicate/non-canonical map keys are rejected. SHA-256 hashes and Ed25519 signatures cover those exact canonical bytes.

A commit contains visible metadata:

- Repository ID, author user ID, account-key version, timestamp, and message.
- Ordered parent commit IDs.
- Hash of the canonical tree-entry list.
- Branch crypto epoch used when the commit was prepared.
- Ed25519 signature over the complete canonical commit object.

Each tree entry points from a random item ID to an immutable item-version ID. The item version stores encrypted `{key, value, media_type}` bytes and a ciphertext hash. Its DEK envelopes are separate so the same immutable ciphertext may be projected into another branch without payload re-encryption.

## 6. Branch Creation

Creating a branch:

1. Creates a new branch Vault Key version.
2. Copies the source tree logically.
3. Adds new Vault Key envelopes for the source item-version DEKs.
4. Wraps the new Vault Key for every group granted read access.
5. Creates the branch ref only after all envelopes validate.

This is metadata work proportional to the current item count; payload ciphertext is reused.

## 7. Three-Way K-V Merge

The merge base, source, and target are compared by normalized key name:

- One-sided add, modify, or delete: accept automatically.
- Identical two-sided result: accept once.
- Different two-sided additions or modifications: conflict.
- Delete versus modify: conflict.
- Rename is represented as delete plus add in v1.

Conflict state remains encrypted locally. `merge --continue` requires every conflict to be resolved and staged; `merge --abort` restores the pre-merge index and working state.

## 8. Projection Commits

Every cross-branch merge creates a target-scoped projection commit with target and source parents. True cross-branch fast-forward is not supported because branches have distinct Vault Keys.

For unchanged or accepted source item versions, the client adds a target Vault Key envelope for the existing DEK and reuses ciphertext. Newly resolved values receive fresh DEKs and ciphertext. The server validates object references and signatures but cannot inspect merge content.

## 9. Protected Branch Changes

`push --change-request` uploads the proposed projection commit and records the expected target head. Approvals cover the exact commit ID and base head. When policy is satisfied, the server atomically advances the target ref only if the head still matches; otherwise the request becomes `superseded` and the proposer must fetch and merge again.

Direct pushes to protected branches are rejected unless policy explicitly allows them. Approval never causes the server to decrypt or synthesize a commit.

## 10. Wire Operations

The SSH protocol exposes typed operations rather than shell execution. Each control frame is deterministic CBOR prefixed by a four-byte unsigned big-endian length. Ciphertext blobs use a declared 64-bit length followed by bounded chunks; they are not embedded in control frames.

- Fetch refs, commits, tree entries, ciphertext objects, and authorized envelopes.
- Upload objects and commits, then compare-and-swap a ref using `expected_old_head`.
- Create/update a change request.
- Claim a client-assisted rotation and upload signed rotation artifacts.
- Manage SSH keys and request an SSH-to-web bridge token.

Every mutating request includes a client-generated idempotency key. Blob frames are length-prefixed and bounded before allocation. Error codes are stable machine-readable values such as `AUTH_REQUIRED`, `KEYS_LOCKED`, `NON_FAST_FORWARD`, `ROTATION_REQUIRED`, `PROTECTED_BRANCH`, `STALE_HEAD`, and `WITNESS_QUORUM_FAILED`.
