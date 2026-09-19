/**
 * The Network token's ledgers: a 404 is "not built yet", a clean answer is
 * parsed defensively (envelope or bare), anything else is an error. The
 * answer is the tracker's own contract fixture (agent-token-burnplan.json,
 * synced from agent/tracker/testdata/contracts).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import {
  BURN_PLAN_PATH,
  LedgerApiError,
  LedgerMintMismatchError,
  fetchBurnPlan,
  ledgerForMint,
  parseBurnPlan,
  useBurnPlan,
} from './use-agent-ledgers';

const fetchMock = vi.fn();

function reply(status: number, body?: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
}

/** The tracker's fixture: `total` is the whole supply, `planTotal` what the plan burns. */
const fixture = JSON.parse(readFileSync(join(__dirname, '..', '__fixtures__', 'tracker', 'agent-token-burnplan.json'), 'utf8')) as {
  path: string;
  response: Record<string, unknown>;
};
const plan = fixture.response as {
  mint: string;
  total: number;
  planTotal: number;
  burned: number;
  remaining: number;
  burns: number;
  next: { at: string; amount: number };
  recent: { at: string; amount: number; sig: string }[];
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('parseBurnPlan', () => {
  it("parses the tracker's own answer, in the envelope or bare, and drops malformed rows", () => {
    expect(fixture.path).toBe(BURN_PLAN_PATH);
    expect(plan.total).toBe(1_000_000_000);
    expect(plan.planTotal).toBe(50_000_000);
    expect(plan.mint).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    expect(parseBurnPlan({ data: plan })).toEqual(plan);
    expect(parseBurnPlan(plan)).toEqual(plan);
    expect(parseBurnPlan(plan).next).toEqual({ at: '2026-09-18T10:00:00Z', amount: 500_000 });
    expect(parseBurnPlan(plan).recent).toHaveLength(2);
    const loose = parseBurnPlan({
      total: 10,
      burned: 4,
      next: { amount: 1 },
      recent: [{ at: 'x', amount: 1 }, null, { sig: 'S', amount: '2' }],
    });
    expect(loose).toEqual({
      mint: null,
      total: 10,
      planTotal: null,
      burned: 4,
      remaining: 6,
      burns: 1,
      next: null,
      schedule: null,
      recent: [{ at: '', amount: 0, sig: 'S' }],
    });
    expect(parseBurnPlan(null)).toEqual({
      mint: null,
      total: 0,
      planTotal: null,
      burned: 0,
      remaining: 0,
      burns: 0,
      next: null,
      schedule: null,
      recent: [],
    });
  });

  it('keeps planTotal apart from the supply and never derives one from total', () => {
    expect(parseBurnPlan({ total: 1e9, burned: 5 }).planTotal).toBeNull();
    expect(parseBurnPlan({ total: 1e9, planTotal: 0, burned: 5 }).planTotal).toBeNull();
    const withPlan = parseBurnPlan({ total: 1e9, planTotal: 150e6, burned: 5e6 });
    expect(withPlan.planTotal).toBe(150e6);
    // Remaining, when the tracker omits it, is what the plan has left, not the supply.
    expect(withPlan.remaining).toBe(145e6);
  });
});

describe('fetchBurnPlan', () => {
  it('hits the agent-token routes on the tracker origin', async () => {
    fetchMock.mockResolvedValue(reply(200, { data: plan }));
    await fetchBurnPlan();
    expect(fetchMock.mock.calls[0][0]).toMatch(new RegExp(`${BURN_PLAN_PATH.replace(/\//g, '\\/')}$`));
  });

  it('resolves null on a 404, the not-built state', async () => {
    fetchMock.mockResolvedValue(reply(404, { error: { code: 'NOT_FOUND' } }));
    await expect(fetchBurnPlan()).resolves.toBeNull();
  });

  it('throws a LedgerApiError for any other failure', async () => {
    fetchMock.mockResolvedValue(reply(503, null));
    await expect(fetchBurnPlan()).rejects.toBeInstanceOf(LedgerApiError);
  });

  it('names an unreachable tracker instead of passing on "Failed to fetch"', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await fetchBurnPlan().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LedgerApiError);
    expect((err as Error).message).toBe('the tracker could not be reached.');
    expect((err as LedgerApiError).status).toBe(0);
  });
});

describe('useBurnPlan', () => {
  it('is idle when disabled and loads to ready', async () => {
    fetchMock.mockResolvedValue(reply(200, plan));
    const { result: idle } = renderHook(() => useBurnPlan(false), { wrapper: wrapper() });
    expect(idle.current).toEqual({ status: 'idle' });

    const { result } = renderHook(() => useBurnPlan(), { wrapper: wrapper() });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toEqual({ status: 'ready', data: plan });
  });

  it('reports a 404 as not-built, not as an error', async () => {
    fetchMock.mockResolvedValue(reply(404));
    const { result } = renderHook(() => useBurnPlan(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBe('not-built'));
  });

  it('reports an outage as an error', async () => {
    fetchMock.mockResolvedValue(reply(500));
    const { result } = renderHook(() => useBurnPlan(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBe('error'), { timeout: 6_000 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('ledgerForMint', () => {
  const served = { status: 'ready' as const, data: parseBurnPlan(plan) };

  it('passes a plan for this mint, a plan that names none, and every other state through', () => {
    expect(ledgerForMint(served, plan.mint)).toBe(served);
    const unnamed = { status: 'ready' as const, data: { ...served.data, mint: null } };
    expect(ledgerForMint(unnamed, 'OtherMint')).toBe(unnamed);
    expect(ledgerForMint(served, null)).toBe(served);
    for (const state of [{ status: 'idle' as const }, { status: 'loading' as const }, { status: 'not-built' as const }]) {
      expect(ledgerForMint(state, 'OtherMint')).toBe(state);
    }
  });

  it("turns a plan the tracker names for another mint into an error naming both, so its burns never dress this mint's supply", () => {
    const state = ledgerForMint(served, 'OtherMint');
    expect(state.status).toBe('error');
    if (state.status !== 'error') return;
    expect(state.error).toBeInstanceOf(LedgerMintMismatchError);
    expect(state.error.message).toContain(plan.mint);
    expect(state.error.message).toContain('OtherMint');
    expect(state.error.message).toMatch(/NEXT_PUBLIC_AGENT_MINT/);
    expect(state.error.message).toMatch(/AGENT_TOKEN_MINT/);
  });
});
