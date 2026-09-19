/**
 * stonkfun's burns as the panel's burn plan: burned and the count from the
 * totals, the list as the ledger, the created supply read back off the mint,
 * no plan target, no next burn, no cadence. The hook is off until told
 * otherwise and reads the client through react-query.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import { StonkfunApiError, parseStonkfunBurns, parseStonkfunToken } from '@/lib/api/stonkfun';

const fetchToken = vi.fn();
const fetchBurns = vi.fn();
vi.mock('@/lib/api/stonkfun', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/api/stonkfun');
  return {
    ...actual,
    fetchStonkfunToken: (...args: unknown[]) => fetchToken(...args),
    fetchStonkfunBurns: (...args: unknown[]) => fetchBurns(...args),
  };
});

import { burnPlanFromStonkfun, useStonkfunBurnPlan, useStonkfunToken } from './use-stonkfun-token';

const KNOTS = '8RVBk8vxLiUHueLUW1f4izFVqN3nWippLhkohKg6EGkS';
const read = (name: string): unknown => JSON.parse(readFileSync(join(__dirname, '..', '__fixtures__', 'stonkfun', name), 'utf8'));
const knots = parseStonkfunToken(read('knots-token.json'))!;
const burns = parseStonkfunBurns(read('knots-burns.json'));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
}

describe('burnPlanFromStonkfun', () => {
  it('is the flywheel ledger: burned and the count from the totals, the created supply from the mint plus the burns, no plan', () => {
    const current = 998_724_544.962446;
    const plan = burnPlanFromStonkfun(burns, current);
    expect(plan.burned).toBe(1_275_455.037554);
    expect(plan.burns).toBe(1966);
    expect(plan.total).toBeCloseTo(1_000_000_000, 3);
    expect(plan.remaining).toBeCloseTo(current, 3);
    expect(plan.planTotal).toBeNull();
    expect(plan.next).toBeNull();
    expect(plan.schedule).toBeNull();
    expect(plan.recent).toHaveLength(5);
    expect(plan.recent[0]).toEqual({
      at: '2026-09-14T16:15:58.148Z',
      amount: 7043.046204,
      sig: '4RaJAZQW3eJaa2P7ZcQhLxzDnGcUk62K9dSUF1bK8s6YNNM1YkD9tkNu6JJdkViBDgGcJipaRoagff7ieHRzAb4P',
    });
  });

  it('has no created supply until the mint has answered', () => {
    const plan = burnPlanFromStonkfun(burns, null);
    expect(plan.total).toBe(0);
    expect(plan.burned).toBe(1_275_455.037554);
    expect(plan.remaining).toBe(0);
  });
});

describe('useStonkfunToken', () => {
  beforeEach(() => {
    fetchToken.mockReset();
    fetchBurns.mockReset();
  });

  it('reads the token for the mint and stays off without one or when disabled', async () => {
    fetchToken.mockResolvedValue(knots);
    const { result } = renderHook(() => useStonkfunToken(KNOTS), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data?.symbol).toBe('KNOTS'));
    expect(fetchToken).toHaveBeenCalledWith(KNOTS, expect.anything());

    const off = renderHook(() => useStonkfunToken(null), { wrapper: wrapper() });
    expect(off.result.current.fetchStatus).toBe('idle');
    const disabled = renderHook(() => useStonkfunToken(KNOTS, false), { wrapper: wrapper() });
    expect(disabled.result.current.fetchStatus).toBe('idle');
    expect(fetchToken).toHaveBeenCalledTimes(1);
  });
});

describe('useStonkfunBurnPlan', () => {
  beforeEach(() => {
    fetchToken.mockReset();
    fetchBurns.mockReset();
  });

  it('is idle when off, loading, then ready with the ledger shaped as a plan', async () => {
    fetchBurns.mockResolvedValue(burns);
    const off = renderHook(() => useStonkfunBurnPlan(KNOTS, 998_724_544.962446, false), { wrapper: wrapper() });
    expect(off.result.current).toEqual({ status: 'idle' });
    expect(fetchBurns).not.toHaveBeenCalled();

    const { result } = renderHook(() => useStonkfunBurnPlan(KNOTS, 998_724_544.962446), { wrapper: wrapper() });
    expect(result.current).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const state = result.current as { status: 'ready'; data: ReturnType<typeof burnPlanFromStonkfun> };
    expect(state.data.burns).toBe(1966);
    expect(state.data.total).toBeCloseTo(1_000_000_000, 3);
    expect(fetchBurns).toHaveBeenCalledWith(KNOTS, 25, expect.anything());
  });

  it('is an error when stonkfun refuses, never a sample (a 4xx is not retried; an outage is, twice, before this)', async () => {
    fetchBurns.mockRejectedValue(new StonkfunApiError('stonkfun returned 429', 429));
    const { result } = renderHook(() => useStonkfunBurnPlan(KNOTS, null), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect((result.current as { status: 'error'; error: Error }).error.message).toMatch(/429/);
    expect(fetchBurns).toHaveBeenCalledTimes(1);
  });
});
