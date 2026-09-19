import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { LAUNCH_CONFIG, LAUNCH_CONFIG_ENVELOPE, LAUNCH_CONFIG_USDC, STONK_QUOTE, USDC_QUOTE } from './__fixtures__/launch-config';
import type * as ConfigModule from '@/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/config', async () => {
  const actual = await vi.importActual<typeof ConfigModule>('@/config');
  return {
    ...actual,
    config: {
      ...actual.config,
      api: { ...actual.config.api, trackerUrl: 'https://tracker.example' },
    },
    trackerEndpoint: (path: string) => `https://tracker.example${path}`,
  };
});

import {
  LAUNCH_CONFIG_PATH,
  LaunchConfigError,
  QUOTE_NOT_ALLOWED_CODE,
  assertLaunchConfig,
  getLaunchConfig,
  launchConfigKey,
  launchFeeSol,
  raiseUnits,
  useLaunchConfig,
} from './launch-config';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('getLaunchConfig', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls GET /api/launch/config on the tracker with the quote mint', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(LAUNCH_CONFIG_ENVELOPE));
    const result = await getLaunchConfig(STONK_QUOTE.quoteMint);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://tracker.example${LAUNCH_CONFIG_PATH}?quoteMint=${STONK_QUOTE.quoteMint}`);
    expect((init.headers as Record<string, string>).Accept).toBe('application/json');
    expect(result.programId).toBe(LAUNCH_CONFIG.programId);
    expect(result.platformId).toBe(LAUNCH_CONFIG.platformId);
    expect(result.treasury).toBe(LAUNCH_CONFIG.treasury);
    expect(result.fee.lamports).toBe(4_901_732);
    expect(result.quote.launchlabConfigId).toBe(STONK_QUOTE.launchlabConfigId);
    expect(result.raise.raw).toBe('32230140093987');
    expect(result.curve.supply).toBe('1000000000000000');
  });

  it('omits the query when no quote is given', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(LAUNCH_CONFIG_ENVELOPE));
    await getLaunchConfig();
    expect(fetchSpy.mock.calls[0][0]).toBe(`https://tracker.example${LAUNCH_CONFIG_PATH}`);
  });

  it('accepts a bare payload without the data envelope', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(LAUNCH_CONFIG));
    await expect(getLaunchConfig()).resolves.toMatchObject({ programId: LAUNCH_CONFIG.programId });
  });

  it('turns a non-2xx into a LaunchConfigError with the status', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ error: { message: 'nope' } }, 503));
    await expect(getLaunchConfig()).rejects.toMatchObject({ name: 'LaunchConfigError', status: 503 });
  });

  it('turns a network failure into a LaunchConfigError', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(getLaunchConfig()).rejects.toBeInstanceOf(LaunchConfigError);
  });

  /** The tracker's own answers (2026-09-14 contract), copied by `npm run contracts:sync`. */
  const FIXTURES_DIR = join(__dirname, '..', 'api', '__fixtures__', 'tracker');
  const fixture = (name: string) =>
    JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf8')) as { status: number; response: unknown };

  it("reads the tracker's config fixture: one $STONK quote and defaultQuoteMint naming it", async () => {
    const { status, response } = fixture('launch-config.json');
    fetchSpy.mockResolvedValueOnce(jsonResponse(response, status));
    const result = await getLaunchConfig();
    expect(result.defaultQuoteMint).toBe(result.quote.quoteMint);
    expect(result.quotes).toHaveLength(1);
    expect(result.quotes[0].quoteMint).toBe(result.defaultQuoteMint);
    expect(result.quote.symbol).toBe('STONK');
  });

  it('turns a 422 QUOTE_NOT_ALLOWED (the tracker fixture) into a final, clearly worded LaunchConfigError', async () => {
    const { status, response } = fixture('launch-config-quote-not-allowed-422.json');
    fetchSpy.mockResolvedValueOnce(jsonResponse(response, status));
    const err = (await getLaunchConfig('So11111111111111111111111111111111111111112').catch((e: unknown) => e)) as LaunchConfigError;
    expect(err).toBeInstanceOf(LaunchConfigError);
    expect(err.status).toBe(422);
    expect(err.code).toBe(QUOTE_NOT_ALLOWED_CODE);
    expect(err.final).toBe(true);
    expect(err.message).toContain('Only $STONK launches are allowed on this launchpad (QUOTE_NOT_ALLOWED)');
    expect(err.message).toContain('only the $STONK quote is launchable on this platform');
  });

  it('an outage is not final, so the query may retry it', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ error: { message: 'nope' } }, 503));
    const err = (await getLaunchConfig().catch((e: unknown) => e)) as LaunchConfigError;
    expect(err.final).toBe(false);
  });
});

describe('assertLaunchConfig', () => {
  it('names every missing chain value', () => {
    expect(() => assertLaunchConfig({ programId: 'x' })).toThrow(
      /platformId, treasury, quote\.launchlabConfigId, curve\.supply, raise\.raw/,
    );
  });

  it('rejects a non-object', () => {
    expect(() => assertLaunchConfig(null)).toThrow(LaunchConfigError);
  });

  it('falls back to the display holder tax and to the single quote when the list is empty', () => {
    const { transferFeeBps, quotes } = assertLaunchConfig({ ...LAUNCH_CONFIG, transferFeeBps: undefined, quotes: [] });
    expect(transferFeeBps).toBe(100);
    expect(quotes).toEqual([STONK_QUOTE]);
  });
});

describe('helpers', () => {
  it('keys the query by quote, with a stable default', () => {
    expect(launchConfigKey()).toEqual(['launch', 'config', 'default']);
    expect(launchConfigKey('m')).toEqual(['launch', 'config', 'm']);
  });

  it('converts the fee to SOL', () => {
    expect(launchFeeSol(LAUNCH_CONFIG.fee)).toBeCloseTo(0.004901732, 9);
  });

  it('reads the raise in whole tokens, deriving it from raw when units are missing', () => {
    expect(raiseUnits(LAUNCH_CONFIG.raise, STONK_QUOTE)).toBeCloseTo(32230.14, 2);
    expect(raiseUnits({ ...LAUNCH_CONFIG.raise, units: 0 }, STONK_QUOTE)).toBeCloseTo(32230.14, 2);
    expect(raiseUnits({ raw: '8670405000', units: 0, minimumRaw: '1', basis: '' }, USDC_QUOTE)).toBeCloseTo(8670.405, 3);
  });
});

describe('useLaunchConfig', () => {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, children);

  afterEach(() => vi.restoreAllMocks());

  it('keeps the previous quote on screen while the next one is priced', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockResolvedValueOnce(jsonResponse(LAUNCH_CONFIG_ENVELOPE));

    const { result, rerender } = renderHook(({ mint }: { mint?: string }) => useLaunchConfig(mint), {
      wrapper,
      initialProps: { mint: undefined as string | undefined },
    });
    await waitFor(() => expect(result.current.data?.quote.symbol).toBe('STONK'));

    let release: (value: Response) => void = () => undefined;
    fetchSpy.mockReturnValueOnce(new Promise<Response>(resolve => (release = resolve)));
    rerender({ mint: USDC_QUOTE.quoteMint });

    expect(result.current.data?.quote.symbol).toBe('STONK');
    expect(result.current.isPlaceholderData).toBe(true);

    release(jsonResponse({ data: LAUNCH_CONFIG_USDC }));
    await waitFor(() => expect(result.current.data?.quote.symbol).toBe('USDC'));
    expect(result.current.isPlaceholderData).toBe(false);
    expect(fetchSpy.mock.calls[1][0]).toContain(`quoteMint=${USDC_QUOTE.quoteMint}`);
  });
});
