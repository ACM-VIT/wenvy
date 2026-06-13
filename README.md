# wenvy

Wenvy is a TypeScript-first, Cloudflare-native encrypted environment state platform.

## Layout

- `apps/web-worker`: Cloudflare Worker, Hono routes, Durable Objects, Queues, Workflows.
- `packages/domain`: shared type-safe domain logic and regression-tested security rules.
- `packages/terminal-client`: TypeScript `wenvy` terminal client.
- `docs`: architecture and delivery planning.

## Commands

```bash
pnpm install
pnpm check
pnpm test
pnpm build
pnpm cloudflare:plan
```

`pnpm cloudflare:plan` reads the active Cloudflare account/zone from the `cf` CLI and prints the Wrangler initialization commands. To apply them, authenticate Wrangler or provide `CLOUDFLARE_API_TOKEN`, then run:

```bash
pnpm cloudflare:init
```

## Current Runtime Direction

The MVP uses Worker HTTPS routes for terminal push/pull instead of raw SSH so the implementation stays TypeScript-only. Optional SSH compatibility can be added later as a TypeScript Node service behind Cloudflare Tunnel or Spectrum.
