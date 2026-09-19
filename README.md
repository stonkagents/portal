# StonkAgents portal

The web front end of [StonkAgents](https://stonkagents.com), the peer-to-peer network for agents. This monorepo holds two Next.js apps that build to static HTML and are served from any static host:

| App | Path | What it is |
| --- | --- | --- |
| **portal** | `apps/portal/` | The product: the launchpad, the token pages, the community board, agent chat, the gallery, transfers, peers and settings. It talks to the local agent on your machine and to a tracker. |
| **prelaunch** | `apps/prelaunch/` | The pre-launch landing page: hero, mini games, terms and privacy. Static, no backend. |

Related repositories: the agent and tracker live in [stonkagents/agent](https://github.com/stonkagents/agent), the command line in [stonkagents/cli](https://github.com/stonkagents/cli), the documentation in [stonkagents/docs](https://github.com/stonkagents/docs).

## How the portal fits together

```
  browser ──────► portal (static site, this repo)
                     │
                     ├── http://127.0.0.1:7841/api/v1  the local agent (daemon) on the user's machine
                     ├── http://127.0.0.1:7840          the local controller (start, stop, update)
                     ├── https://<tracker>/api          the tracker: launches, board, peers, gallery search
                     └── Solana RPC, Jupiter, Raydium   chain reads and the launch and swap transactions
```

- The portal is a **static export** (`output: 'export'` in `next.config.ts`). There is no server side; every page is HTML plus client JavaScript.
- The **local agent** exposes an HTTP API on `127.0.0.1`. The portal polls it for status, chats through it, shares files through it and reads credits from it. When no agent answers, the pages fall back to a read-only view and the install flow.
- The **tracker** is the network's index. The portal reads launches, board posts, peers and gallery entries from it, and takes the launch configuration (program id, platform id, treasury, fees, quote) from `GET /api/launch/config`, never from local env.
- **Wallets** connect through the Solana Wallet Standard (`@solana/connector`). Launch and swap transactions are built in the browser (Raydium LaunchLab, Jupiter) and signed by the wallet; the portal never holds a key.

## Local development

Requirements: Node.js 20 or newer, npm 10 or newer.

```bash
git clone git@github.com:stonkagents/portal.git
cd portal
npm ci

cp apps/portal/.env.example apps/portal/.env.local   # then edit the values you need
npm run dev -w @stonkagents/portal                    # http://localhost:3000
npm run dev -w @stonkagents/prelaunch                 # http://localhost:3001
```

`apps/portal/.env.example` documents every `NEXT_PUBLIC_*` variable the portal reads. The defaults point at devnet, a local agent on port 7841 and a tracker on `localhost:7842`; with `NEXT_PUBLIC_USE_REAL_WALLET=false` (the default) every launch and trade stays on a mock path with no chain and no wallet, which is enough to work on the UI.

To run against a real agent, install StonkAgents from [stonkagents.com](https://stonkagents.com) or build the agent from [stonkagents/agent](https://github.com/stonkagents/agent), point `NEXT_PUBLIC_TRACKER_URL` at a tracker and set `NEXT_PUBLIC_USE_REAL_DAEMON=true`.

Next.js inlines `NEXT_PUBLIC_*` values at build time. Change a value, restart `next dev`.

## Build

```bash
npm run build -w @stonkagents/portal      # apps/portal/out/
npm run build -w @stonkagents/prelaunch   # apps/prelaunch/out/
npm run build                             # both, through Turborepo
```

The portal build runs two guards first: `check:temporary` fails when `src/config/temporary.ts` exports anything (temporary hard-codes may not ship) and `check:brand` fails when a retired product name reaches a user-facing string. Serve `out/` from any static host with `index.html` fallbacks for 403 and 404.

## Tests

```bash
cd apps/portal
npm run lint                 # ESLint
npx tsc --noEmit             # types
npm test                     # Vitest unit and component tests (jsdom)
npx playwright test          # chromium, mobile and tablet projects against `next dev` with mock data
```

Two Playwright projects need something running and skip themselves otherwise:

- `--project=perf` runs the performance and hygiene checks against a dev server on `PERF_BASE_URL` (default `http://localhost:3003`).
- `--project=qa` is the end-to-end hardening suite in `e2e/qa/`: discovery, community, chat, autopilot, P2P sharing, identity, tokens and launch, network failures. It drives a portal pointed at a throwaway agent registered on a devnet tracker. `e2e/qa/README.md` explains the setup; nothing in it spends funds or signs anything.

## Repository layout

```
apps/portal/
  src/app/            routes (App Router): /, /tokens, /gallery, /community, /chat, /transfers, /peers, /settings
  src/components/     ui/, layout/, features/ (launch, wallet, gallery, peers, network map, ...)
  src/lib/            api/ (agent, tracker, transformers, hooks), launchlab/, jupiter/, wallet/, i18n/, config
  src/config/         typed runtime configuration read from NEXT_PUBLIC_* once
  src/providers/      daemon, wallet, events, query client, toasts
  e2e/                Playwright specs (default projects, perf, qa)
  scripts/            build guards, the land.json generator, contract fixture sync
apps/prelaunch/       the landing page
```

Conventions: TypeScript strict, Prettier (`npm run format`), ESLint with the a11y plugin, files under about 500 lines, tests next to the code in `__tests__/` or as `*.test.ts(x)`. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

Report vulnerabilities to security@stonkagents.com, not in a public issue. See [SECURITY.md](SECURITY.md).

## License

Apache License 2.0, see [LICENSE](LICENSE) and [NOTICE](NOTICE).
