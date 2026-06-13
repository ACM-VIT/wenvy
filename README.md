# wenvy

Wenvy is a TypeScript-first, Cloudflare-native encrypted environment state platform.

## Layout

- `apps/web-worker`: Cloudflare Worker, Hono routes, Durable Objects, Queues, Workflows.
- `apps/landing`: React/Vite landing page.
- `packages/domain`: shared type-safe domain logic and regression-tested security rules.
- `packages/terminal-client`: TypeScript `wenvy` terminal client.
- `docs`: architecture and delivery planning.

## Commands

```bash
pnpm install
pnpm check
pnpm test
pnpm build
pnpm landing:dev
pnpm cloudflare:plan
```

## Demo Quickstart

```bash
npm install -g wenvy
wenvy init --repo <repo-id> --branch main
export WENVY_TOKEN=<service-account-token>
wenvy doctor
```

Show local env normalization:

```bash
printf 'B=two\nA=one\n' > demo.env
wenvy snapshot demo.env
```

Push and pull encrypted snapshot bytes:

```bash
printf 'sealed-demo-bytes' > snapshot.enc
wenvy push snapshot.enc
wenvy pull --output-file pulled.enc
```

For a narrated command list:

```bash
wenvy demo
```

`pnpm cloudflare:plan` reads the active Cloudflare account/zone from the `cf` CLI and prints the Wrangler initialization commands. To apply them, authenticate Wrangler or provide `CLOUDFLARE_API_TOKEN`, then run:

```bash
pnpm cloudflare:init
```

## Current Runtime Direction

The MVP uses Worker HTTPS routes for terminal push/pull instead of raw SSH so the implementation stays TypeScript-only. Optional SSH compatibility can be added later as a TypeScript Node service behind Cloudflare Tunnel or Spectrum.
