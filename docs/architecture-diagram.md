# Architecture Diagram

This is the current Wenvy architecture snapshot. The renderable Mermaid source is in `system-architecture.mmd`, and the rendered SVG is in `system-architecture.svg`.

![Wenvy system architecture](system-architecture.svg)

## What the Diagram Shows

Wenvy is split into five main lanes:

1. Client boundary
   - Developer devices run the CLI.
   - The CLI canonicalizes, encrypts, decrypts, signs, and maintains local `.wenvy/` metadata.
   - Plaintext secret values exist only in the client runtime.

2. Cloudflare edge and control plane
   - HTTPS traffic enters through Cloudflare edge controls.
   - The dashboard and API run on Cloudflare Workers with React/Vite static assets and Hono API routes.
   - Durable Objects handle single-use login tokens, SSH bridge tokens, branch write locks, idempotency, and rate counters.

3. Terminal data plane
   - Operational push, pull, and share commands use Worker HTTPS routes for the MVP.
   - Optional SSH compatibility must be a TypeScript Node service behind Cloudflare Tunnel or Spectrum.
   - The data plane authenticates service accounts or user sessions and evaluates the same role/repo/branch authorization model as the HTTP control plane.

4. Async work
   - Queues process email retries, audit fanout, GitHub sync, and envelope checks.
   - Workflows run the key-rotation saga with checkpointed retries.
   - Cron Triggers enqueue scheduled reconciliation and consistency jobs.

5. Server-side state
   - Postgres is the source of truth for identity, RBAC, branch policy, envelope metadata, commit metadata, and audit events.
   - R2 stores encrypted snapshot blobs only.
   - Server-side components never store customer secret plaintext.

## Render

Use any Mermaid renderer against the source file:

```bash
mmdc -i docs/system-architecture.mmd -o docs/system-architecture.svg
```

If the repository docs are viewed on a platform that supports Mermaid, paste the contents of `system-architecture.mmd` into a Mermaid block.

## Key Security Reading

- Green client nodes are trusted because they handle private keys and plaintext.
- Red state nodes are treated as untrusted for secret confidentiality; they only receive ciphertext and metadata.
- The Worker and optional SSH compatibility service are semi-trusted: they enforce identity, authorization, branch policy, audit, and coordination, but cannot decrypt secret payloads.
