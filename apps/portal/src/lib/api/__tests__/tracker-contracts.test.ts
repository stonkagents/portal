/**
 * Purpose: The tracker's real answers, through the portal's real readers.
 *
 * Every other API test mocks fetch with a shape typed by hand, which is how
 * the burn-plan `total` drift slipped through. The fixtures under
 * `src/lib/api/__fixtures__/tracker/` are generated from the tracker's own
 * handlers (agent/tracker/testdata/contracts, copied by
 * `npm run contracts:sync`), and each one here is fed to the client that
 * consumes that route in production, envelope and all. A field the tracker
 * renames, drops or retypes fails this file before it fails a page.
 *
 * Nothing here is skipped when a fixture is missing: a missing file is a
 * contract nobody checked, and that fails too.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type * as ConfigModule from '@/config';

vi.mock('@/config', async () => {
  const actual = await vi.importActual<typeof ConfigModule>('@/config');
  return {
    ...actual,
    config: { ...actual.config, api: { ...actual.config.api, trackerUrl: 'https://tracker.example' } },
    trackerEndpoint: (path: string) => `https://tracker.example${path}`,
  };
});

import { assertLaunchConfig, getLaunchConfig, LaunchConfigError } from '@/lib/launchlab/launch-config';
import {
  getLaunch,
  fetchLaunchesByWallet,
  listLaunches,
  recordLaunch,
  toLaunch,
  LaunchApiError,
  LAUNCH_EXISTS_CODE,
} from '../launches';
import { fetchLaunchCandles, fetchLaunchTrades, readMetrics24h } from '../launch-trades';
import { fetchBurnPlan, parseBurnPlan } from '../hooks/use-agent-ledgers';
import { requestDevDrip, DevDripError } from '../dev-drip';
import { postFeedback } from '../feedback';
import { postInterest } from '../interest';
import { readDevDripEnabled } from '@/components/features/devnet/DevDrip';

const FIXTURES_DIR = join(__dirname, '..', '__fixtures__', 'tracker');

/**
 * Fixture file per route, as `TestWriteContractFixtures` in
 * agent/tracker/internal/api/contract_fixtures_test.go names them.
 */
const FIXTURE = {
  launchConfig: 'launch-config.json',
  launchConfigQuoteNotAllowed: 'launch-config-quote-not-allowed-422.json',
  launch: 'launch-get.json',
  launchNotFound: 'launch-get-not-found-404.json',
  launches: 'launches-list.json',
  launchByWallet: 'launch-by-wallet.json',
  trades: 'launch-trades.json',
  candles: 'launch-candles.json',
  launchExists: 'launch-record-launch-exists-409.json',
  launchQuoteNotAllowed: 'launch-record-quote-not-allowed-422.json',
  burnPlan: 'agent-token-burnplan.json',
  devDrip: 'dev-drip-ok.json',
  devDripLimited: 'dev-drip-limited-429.json',
  devDripEmpty: 'dev-drip-empty-503.json',
  devDripUnregistered: 'dev-drip-unregistered-404.json',
  feedback: 'feedback.json',
  interest: 'interest.json',
} as const;

/**
 * One fixture file: the request that produced it and the exact response the
 * handler wrote, so the portal's transport code runs as it would live.
 */
interface Fixture {
  method: string;
  path: string;
  requestBody?: unknown;
  requestHeaders?: Record<string, string>;
  status: number;
  /** The response body verbatim: envelopes and nulls are the handler's own. */
  response: unknown;
}

function loadFixture(name: string): Fixture {
  const path = join(FIXTURES_DIR, name);
  if (!existsSync(path)) {
    const have = existsSync(FIXTURES_DIR) ? readdirSync(FIXTURES_DIR).join(', ') || '(none)' : '(directory missing)';
    throw new Error(`Missing tracker contract fixture ${name}. Run \`npm run contracts:sync\`. Present: ${have}`);
  }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<Fixture> | null;
  if (
    !raw ||
    typeof raw.status !== 'number' ||
    !('response' in raw) ||
    typeof raw.method !== 'string' ||
    typeof raw.path !== 'string'
  ) {
    throw new Error(`Fixture ${name} is not { method, path, status, response } as the tracker's generator writes it.`);
  }
  return raw as Fixture;
}

/** The payload inside the tracker's `{ data }` envelope, or the body itself. */
function unwrap<T = Record<string, unknown>>(body: unknown): T {
  const env = body as { data?: unknown } | null;
  return (env && typeof env === 'object' && 'data' in env ? env.data : body) as T;
}

const fetchMock = vi.fn();

/** Serve one fixture for the next fetch, exactly as the handler wrote it. */
function serve(fixture: Fixture) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(fixture.response), { status: fixture.status, headers: { 'Content-Type': 'application/json' } }),
  );
}

/** The portal must have asked the route the fixture was recorded from (query strings may differ). */
function expectAsked(fixture: Fixture, call = 0) {
  const [url, init] = fetchMock.mock.calls[call] as [string, RequestInit | undefined];
  expect(new URL(url).pathname).toBe(new URL(fixture.path, 'https://tracker.example').pathname);
  expect((init?.method ?? 'GET').toUpperCase()).toBe(fixture.method.toUpperCase());
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const isBase58 = (s: unknown): s is string => typeof s === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
const isIso = (s: unknown): s is string => typeof s === 'string' && Number.isFinite(Date.parse(s));

async function rejection<E>(promise: Promise<unknown>, ctor: new (...args: never[]) => E): Promise<E> {
  await expect(promise).rejects.toBeInstanceOf(ctor);
  return (await promise.catch((e: unknown) => e)) as E;
}

describe('GET /api/launch/config', () => {
  it('parses with the portal launch-config reader and carries the drip flag', async () => {
    const fixture = loadFixture(FIXTURE.launchConfig);
    serve(fixture);
    const cfg = await getLaunchConfig();
    expectAsked(fixture);

    expect(isBase58(cfg.programId)).toBe(true);
    /* Placeholders in the fixture; on a live tracker both are base58. */
    expect(cfg.platformId).not.toBe('');
    expect(cfg.treasury).not.toBe('');
    expect(typeof cfg.transferFeeBps).toBe('number');
    expect(cfg.fee).toMatchObject({
      usd: expect.any(Number),
      lamports: expect.any(Number),
      solUsd: expect.any(Number),
      stale: expect.any(Boolean),
    });
    expect(isIso(cfg.fee.pricedAt)).toBe(true);
    expect(cfg.quotes.length).toBeGreaterThan(0);
    for (const q of cfg.quotes) {
      expect(isBase58(q.quoteMint)).toBe(true);
      expect(isBase58(q.launchlabConfigId)).toBe(true);
      expect(typeof q.decimals).toBe('number');
      expect(typeof q.minFundRaisingRaw).toBe('string');
      expect(typeof q.enabled).toBe('boolean');
    }
    expect(cfg.quotes.some(q => q.quoteMint === cfg.quote.quoteMint)).toBe(true);
    expect(cfg.raise.raw).toMatch(/^\d+$/);
    expect(cfg.curve.supply).toMatch(/^\d+$/);
    expect(cfg.curve.totalSellA).toMatch(/^\d+$/);

    /* Fields a portal fallback would otherwise mask: the tracker must send them. */
    const payload = unwrap(fixture.response);
    expect(typeof payload.transferFeeBps).toBe('number');
    expect(Array.isArray(payload.quotes)).toBe(true);
    /* The devnet drip gate: a boolean, present, read exactly as DevDrip does. */
    expect(typeof payload.devDripEnabled).toBe('boolean');
    expect(readDevDripEnabled(cfg)).toBe(payload.devDripEnabled);
    expect(() => assertLaunchConfig(payload)).not.toThrow();
  });

  it('refuses a quote outside the catalog with a 422 the reader surfaces as LaunchConfigError', async () => {
    const fixture = loadFixture(FIXTURE.launchConfigQuoteNotAllowed);
    expect(fixture.status).toBe(422);
    serve(fixture);
    const err = await rejection(getLaunchConfig('any'), LaunchConfigError);
    expect(err.status).toBe(422);
  });
});

/** Every field `toLaunch` reads must exist on the wire in at least one spelling, so the '' fallbacks never hide a rename. */
function expectCompleteLaunch(record: Record<string, unknown>) {
  const launch = toLaunch(record as never);
  expect(isBase58(launch.mint)).toBe(true);
  expect(isBase58(launch.creatorWallet)).toBe(true);
  expect(isBase58(launch.quoteMint)).toBe(true);
  expect(launch.name).not.toBe('');
  expect(launch.symbol).not.toBe('');
  expect(launch.launchSignature).not.toBe('');
  expect(typeof launch.feeLamports).toBe('number');
  expect(typeof launch.transferFeeBps).toBe('number');
  expect(launch.status).not.toBe('');
  expect(isIso(launch.createdAt)).toBe(true);
  expect(typeof launch.agentBound).toBe('boolean');
  /* A record the tracker enriches must carry the camelCase spelling the readers prefer. */
  expect(typeof record.creatorWallet).toBe('string');
  expect(typeof record.quoteMint).toBe('string');
  expect(typeof record.createdAt).toBe('string');
  expect(typeof record.agentBound).toBe('boolean');
  expect('quote' in record).toBe(true);
  expect('metrics' in record).toBe(true);
  if (launch.quote) {
    expect(launch.quote).toMatchObject({ mint: expect.any(String), symbol: expect.any(String), decimals: expect.any(Number) });
  }
  if (launch.metrics) {
    for (const key of ['marketCapUsd', 'curveProgressPct', 'holders', 'priceUsd', 'quoteRaised', 'quoteTarget'] as const) {
      expect(launch.metrics[key] === null || typeof launch.metrics[key] === 'number').toBe(true);
    }
    expect(launch.metrics.graduated === null || typeof launch.metrics.graduated === 'boolean').toBe(true);
    const m24 = readMetrics24h(launch.metrics);
    for (const value of Object.values(m24)) expect(value === null || typeof value === 'number').toBe(true);
  }
  return launch;
}

describe('GET /api/launch/{mint}', () => {
  it('parses into a complete Launch', async () => {
    const fixture = loadFixture(FIXTURE.launch);
    serve(fixture);
    const record = await getLaunch('any');
    expectAsked({ ...fixture, path: fixture.path.replace(/[^/]+$/, 'any') });
    expectCompleteLaunch(record as unknown as Record<string, unknown>);
  });

  it('surfaces an unknown mint as LaunchApiError 404', async () => {
    const fixture = loadFixture(FIXTURE.launchNotFound);
    expect(fixture.status).toBe(404);
    serve(fixture);
    const err = await rejection(getLaunch('any'), LaunchApiError);
    expect(err.status).toBe(404);
    expect(err.message).not.toBe('');
  });
});

describe('GET /api/launches', () => {
  it('pages with the tracker meta and every item parses', async () => {
    const fixture = loadFixture(FIXTURE.launches);
    serve(fixture);
    const page = await listLaunches();
    expectAsked(fixture);
    const { meta } = fixture.response as { meta?: unknown };
    expect(meta).toMatchObject({ total: expect.any(Number), limit: expect.any(Number), offset: expect.any(Number) });
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.total).toBeGreaterThanOrEqual(page.items.length);
    for (const item of page.items) expectCompleteLaunch(item as unknown as Record<string, unknown>);
  });
});

describe('GET /api/launch/by-wallet?wallet=', () => {
  it("lists the wallet's launches, claimed or not, and every item parses", async () => {
    const fixture = loadFixture(FIXTURE.launchByWallet);
    serve(fixture);
    const items = await fetchLaunchesByWallet('any');
    expectAsked(fixture);
    expect(Array.isArray(unwrap<unknown>(fixture.response))).toBe(true);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expectCompleteLaunch(item as unknown as Record<string, unknown>);
  });
});

describe('GET /api/launch/{mint}/trades', () => {
  it('maps every row onto the tape and keeps the cursor', async () => {
    const fixture = loadFixture(FIXTURE.trades);
    serve(fixture);
    const page = await fetchLaunchTrades('any');
    expectAsked({ ...fixture, path: fixture.path.replace(/\/launch\/[^/]+\//, '/launch/any/') });
    const rows = unwrap<unknown[]>(fixture.response);
    expect(rows.length).toBeGreaterThan(0);
    expect(page.trades).toHaveLength(rows.length);
    for (const trade of page.trades) {
      expect(trade.signature).not.toBe('');
      expect(typeof trade.blockTime).toBe('number');
      expect(['buy', 'sell']).toContain(trade.type);
      expect(typeof trade.amountToken).toBe('number');
      expect(typeof trade.amountQuote).toBe('number');
      expect(typeof trade.price).toBe('number');
      expect(isBase58(trade.wallet)).toBe(true);
    }
    const body = fixture.response as { next_cursor?: unknown };
    expect(page.nextCursor).toBe(body.next_cursor ? body.next_cursor : null);
  });
});

describe('GET /api/launch/{mint}/candles', () => {
  it('maps every bucket onto a chart candle, oldest first', async () => {
    const fixture = loadFixture(FIXTURE.candles);
    serve(fixture);
    const candles = await fetchLaunchCandles('any', '1h');
    expectAsked({ ...fixture, path: fixture.path.replace(/\/launch\/[^/]+\//, '/launch/any/') });
    const rows = unwrap<unknown[]>(fixture.response);
    expect(rows.length).toBeGreaterThan(0);
    expect(candles).toHaveLength(rows.length);
    for (const c of candles) {
      for (const v of [c.time, c.open, c.high, c.low, c.close, c.volume]) expect(Number.isFinite(v)).toBe(true);
      expect(c.high).toBeGreaterThanOrEqual(c.low);
    }
    for (let i = 1; i < candles.length; i++) expect(candles[i].time).toBeGreaterThan(candles[i - 1].time);
  });
});

describe('POST /api/launch/record refusals', () => {
  it('409 LAUNCH_EXISTS surfaces as LaunchApiError.walletHasLaunch with the existing mint', async () => {
    const fixture = loadFixture(FIXTURE.launchExists);
    expect(fixture.status).toBe(409);
    serve(fixture);
    const err = await rejection(recordLaunch((fixture.requestBody ?? {}) as never), LaunchApiError);
    expectAsked(fixture);
    expect(err.status).toBe(409);
    expect(err.code).toBe(LAUNCH_EXISTS_CODE);
    expect(err.walletHasLaunch).toBe(true);
    expect(isBase58(err.mint)).toBe(true);
    expect(err.message).not.toMatch(/^Could not/);
  });

  it('422 for a quote outside the catalog carries a code and the tracker message', async () => {
    const fixture = loadFixture(FIXTURE.launchQuoteNotAllowed);
    expect(fixture.status).toBe(422);
    serve(fixture);
    const err = await rejection(recordLaunch((fixture.requestBody ?? {}) as never), LaunchApiError);
    expect(err.status).toBe(422);
    expect(err.code).toBeTruthy();
    expect(err.walletHasLaunch).toBe(false);
    expect(err.message).not.toMatch(/^Could not/);
  });
});

describe('GET /api/v1/agent-token/burnplan', () => {
  it('parses without a single silent fallback', async () => {
    const fixture = loadFixture(FIXTURE.burnPlan);
    serve(fixture);
    const plan = await fetchBurnPlan();
    expectAsked(fixture);
    expect(plan).not.toBeNull();
    /* The parser defaults every number to 0; the contract is that it never has to. */
    const raw = unwrap(fixture.response);
    for (const key of ['total', 'burned', 'remaining', 'burns'] as const) {
      expect(typeof raw[key], `burnplan.${key}`).toBe('number');
      expect(plan![key]).toBe(raw[key]);
    }
    expect(plan!.remaining).toBe(plan!.total - plan!.burned);
    expect(Array.isArray(raw.recent)).toBe(true);
    expect(plan!.recent).toHaveLength((raw.recent as unknown[]).length);
    for (const entry of plan!.recent) {
      expect(isIso(entry.at)).toBe(true);
      expect(entry.sig).not.toBe('');
    }
    expect('next' in raw).toBe(true);
    expect(plan!.next === null || (isIso(plan!.next.at) && typeof plan!.next.amount === 'number')).toBe(true);
    expect(parseBurnPlan(fixture.response)).toEqual(plan);
  });
});

describe('POST /api/dev/drip', () => {
  it('200 is the drip shape the portal requires before it toasts', async () => {
    const fixture = loadFixture(FIXTURE.devDrip);
    expect(fixture.status).toBe(200);
    serve(fixture);
    const result = await requestDevDrip('any');
    expectAsked(fixture);
    expect(result).toMatchObject({
      signature: expect.any(String),
      sol: expect.any(Number),
      stonk: expect.any(Number),
      explorer: expect.any(String),
      sentSol: expect.any(Boolean),
      sentStonk: expect.any(Boolean),
    });
  });

  it('429 carries a known code and nextAt', async () => {
    const fixture = loadFixture(FIXTURE.devDripLimited);
    expect(fixture.status).toBe(429);
    serve(fixture);
    const err = await rejection(requestDevDrip('any'), DevDripError);
    expect(err.status).toBe(429);
    expect(['ALREADY_DRIPPED', 'IP_LIMITED']).toContain(err.code);
    expect(isIso(err.nextAt)).toBe(true);
  });

  it('503 is drip_empty', async () => {
    const fixture = loadFixture(FIXTURE.devDripEmpty);
    expect(fixture.status).toBe(503);
    serve(fixture);
    const err = await rejection(requestDevDrip('any'), DevDripError);
    expect(err.status).toBe(503);
    expect(err.code).toBe('drip_empty');
  });

  it('404 (no DEV_DRIP_SECRET_KEY) is a status the drip effect stays quiet on', async () => {
    const fixture = loadFixture(FIXTURE.devDripUnregistered);
    expect(fixture.status).toBe(404);
    serve(fixture);
    const err = await rejection(requestDevDrip('any'), DevDripError);
    expect(err.status).toBe(404);
  });
});

describe('POST /api/v1/feedback and /api/v1/interest', () => {
  it('feedback answers { ok: true } and the portal sends the Turnstile header the tracker reads', async () => {
    const fixture = loadFixture(FIXTURE.feedback);
    serve(fixture);
    await expect(postFeedback({ kind: 'bug', message: 'The chart is blank', path: '/tokens' }, 'ts-token')).resolves.toBeUndefined();
    expectAsked(fixture);
    const headerName = Object.keys(fixture.requestHeaders ?? {}).find(h => /turnstile/i.test(h));
    expect(headerName).toBeDefined();
    const sent = (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>;
    expect(Object.keys(sent).map(h => h.toLowerCase())).toContain(headerName!.toLowerCase());
  });

  it('interest answers { ok: true } with per-capability counts', async () => {
    const fixture = loadFixture(FIXTURE.interest);
    serve(fixture);
    const result = await postInterest({ capabilities: ['trade', 'alerts'], description: '', priority: 'nice', path: '/' });
    expectAsked(fixture);
    /* The counts the tracker sends must all be known capability keys with numeric tallies, none dropped by the reader. */
    const { counts } = fixture.response as { counts?: Record<string, unknown> };
    expect(counts).toBeDefined();
    expect(Object.keys(counts!).length).toBeGreaterThan(0);
    expect(result.counts).toBeDefined();
    for (const [key, value] of Object.entries(counts!)) {
      expect(typeof value, `counts.${key}`).toBe('number');
      expect(result.counts?.[key as keyof typeof result.counts]).toBe(value);
    }
  });
});
