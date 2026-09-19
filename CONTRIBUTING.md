# Contributing

Thanks for helping build the StonkAgents portal. This page covers the mechanics; the [README](README.md) explains what the apps are and how they talk to the agent and the tracker.

## Before you start

- Look for an existing issue. For anything larger than a small fix, open one first so the approach can be agreed before you write code.
- Security problems go to security@stonkagents.com, never to a public issue. See [SECURITY.md](SECURITY.md).
- By contributing you agree that your work is licensed under the [Apache License 2.0](LICENSE) like the rest of the repository.

## Setup

```bash
git clone git@github.com:stonkagents/portal.git
cd portal
npm ci
cp apps/portal/.env.example apps/portal/.env.local
npm run dev -w @stonkagents/portal
```

Node.js 20 or newer. The defaults in `.env.example` run the portal with mock data and no wallet, which covers most UI work. See the README for running against a real agent.

## Checks

Run these from `apps/portal` before opening a pull request; CI runs the same set.

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Playwright specs live in `apps/portal/e2e`. The default projects (`npx playwright test`) start `next dev` with mock data on their own. The `perf` and `qa` projects need a running target and skip themselves without one.

## Code conventions

- TypeScript strict mode; no `any`. Typed interfaces for anything exported.
- Components import `config` from `@/config` and never read `process.env` directly. New `NEXT_PUBLIC_*` keys are added to the literal block in `src/config/index.ts` and documented in `.env.example`.
- Validate input at the boundaries: every tracker and agent response goes through a parser in `src/lib/api` before a component sees it.
- Keep files under about 500 lines; split rather than grow.
- Tests sit next to the code (`__tests__/` or `*.test.ts(x)`), Vitest with Testing Library, jsdom. Mock the modules at the edge (`@/lib/api/daemon`, `@/config`), not the component under test.
- The build guards are part of the contract: `src/config/temporary.ts` must export nothing when you are done, and user-facing strings must pass `npm run check:brand`.
- Prettier formats everything (`npm run format` at the root). Single quotes, semicolons, trailing commas, LF line endings, 135 columns.
- User-facing copy is plain and specific. Say what happened and what to do next; avoid exclamation marks and jargon.

## Commits and pull requests

- Small, focused pull requests are reviewed faster.
- Commit messages: `type(scope): what changed`, for example `fix(portal): the launch form keeps its draft across a wallet reconnect`. Types: `feat`, `fix`, `test`, `docs`, `chore`, `refactor`.
- Fill in the pull request template: what changed, why, how you tested it, and screenshots for anything visual (375px, 600px and desktop widths).
- A maintainer reviews every pull request. Expect questions; they are about the change, not about you.

## Reporting bugs and proposing features

Use the issue templates. A good bug report names the page, the agent and wallet state (connected or not, mock or real), what you did, what you expected and what happened, with the browser console output when there is any.
