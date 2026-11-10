# agentox

A focused, fast web UI for running a team of AI agents, built on top of
the agentox server, which schedules and runs the agents.
The server does the orchestration; this interface is the cockpit.

A product page lives at **`/product`** (signed-out visitors land there). The app is monochrome by design, documented live at **`/design`**: tokens, type, status glyphs, controls and surfaces.

- **Auth**: sign in, sign up (with validation), sign out, first-run instance claim, invite links with join requests, and a "no access yet" state. These follow the server's own auth gate, and `local_trusted` mode skips them.
- **Overview**: metric strip, 14-day run chart, recent runs, live agents, needs-attention list, activity
- **Live**: in-flight runs with streaming transcripts, plus a raw event stream you can pause and filter, over the server's WebSocket
- **Runs**: every heartbeat; detail view with a millisecond transcript, usage and cancel
- **Tasks**: list and board (drag between columns), filters, inline status, discussion, run history
- **Agents**: dense table and org tree; detail with Overview / Runs / Tasks / Configuration tabs; wake with an instruction, pause, resume, terminate, edit budget; hire flow
- **Approvals**, **Spend**, **Members** (invites, roles, join requests), **Settings** (workspace, profile, theme, server)
- **Integrations**: runtimes with a live environment test, model-provider API keys, app connections with health checks, encrypted secrets, personal API keys, and MCP server setup
- ⌘K command menu, `C` to create a task, dark (default) and light themes, works on mobile
- **Demo mode**: a full in-browser stand-in for the server API (auth, simulated runs, live events, integrations). Sign in with `demo@agentox.dev` / `agentox-demo`.

## Run it

Requires Node 24+.

```bash
# 1. Start the agentox server (embedded Postgres, trusted local mode, port 3100)
npm run server

# 2. Start agentox
npm install
npm run dev          # http://localhost:5180
```

The dev server proxies `/api` (including WebSockets) to `AGENTOX_SERVER_URL`, which defaults to
`http://localhost:3100`. To point it somewhere else:

```bash
echo "AGENTOX_SERVER_URL=http://my-host:3100" > .env.local
```

If the server isn't reachable, agentox shows a connect screen with a **Try demo** button.

### Production build

`npm run build` outputs static files to `dist/`. Serve them behind the same origin as the agentox server
(or a reverse proxy that forwards `/api` to it), since the app calls relative `/api/...` URLs.
The proxy must keep the browser's `Host` header, or forward it as `X-Forwarded-Host` with the
server's trust-proxy setting enabled. The server only accepts changes from the address the browser
used, and builds OAuth return links from it. Rewriting the host breaks sign-in flows and every save.

## The server

`npm run server` starts the agentox server (see `scripts/server.mjs`). The first run sets up an
embedded database; later runs start the existing install. Everything lives under `~/.agentox`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `AGENTOX_PORT` | `3100` | Port the server listens on |
| `AGENTOX_DATA_DIR` | `~/.agentox/server` | Config, embedded database and logs |
| `AGENTOX_DATABASE_URL` | embedded | Use an external Postgres instead |
| `AGENTOX_ENGINE_*` | | Passed through to the engine's advanced settings |

Extra arguments are forwarded, for example `npm run server -- doctor` or
`npm run server -- auth bootstrap-ceo` to print a first-admin invite on a public server.

## Auth

- `local_trusted` mode (the default for `onboard --yes`): no login; you are the local operator.
- `authenticated` mode: sign-in and sign-up go to the server's auth endpoints (`/api/auth/*`). On a fresh server the first account claims the instance (`POST /api/bootstrap/claim`). Teammates join through `/invite/:token` links, which create a join request for an admin to approve under Members.
- The server has no password-reset flow yet, so the interface doesn't offer one.

## Code map

| Path | What |
| --- | --- |
| `src/api/client.ts` | fetch wrapper, error handling, demo-mode switch |
| `src/api/hooks.ts` | TanStack Query hooks and mutations for every endpoint used |
| `src/api/types.ts` | the subset of the server's types the UI relies on |
| `src/api/mock.ts` | demo-mode backend (same routes, simulated runs and live events) |
| `src/lib/live.tsx` | WebSocket live events, mapped to query invalidation |
| `src/index.css` | design tokens (grayscale ramp, type scale, radii) |
| `src/components/ui.tsx` | design-system primitives |
| `src/lib/auth.tsx` | auth state machine |
| `src/pages/*` | one file per screen; `Design.tsx` is the living spec |
| `src/components/*` | layout, modals, command palette, primitives |
