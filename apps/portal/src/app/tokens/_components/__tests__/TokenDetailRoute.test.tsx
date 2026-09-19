/**
 * The detail page under the static export: the shell at /tokens/placeholder/
 * is served for every /tokens/<mint>/, so the mint must come from the URL.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const MINT = 'EMJPUbXXDgEYsftDsh8kw2m89muA7SaVrf2WejVNXEJe';

const useParams = vi.fn();
const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({
  useParams: () => useParams(),
  notFound: () => notFound(),
}));

const useTokenDetail = vi.fn();
vi.mock('../../_lib/use-gallery', () => ({
  useTokenDetail: (...args: unknown[]) => useTokenDetail(...args),
}));

const idle = { data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn() };
vi.mock('@/lib/launchlab/launch-config', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/launchlab/launch-config');
  return { ...actual, useLaunchConfig: () => idle };
});
vi.mock('@/lib/launchlab/pool-state', () => ({ usePoolState: () => idle }));
vi.mock('@/lib/launchlab/external-pool', () => ({ useExternalPoolState: () => idle }));
vi.mock('@/lib/api/hooks/use-agent-ledgers', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useBurnPlan: () => ({ status: 'not-built' }),
  useAgentPayouts: () => ({ status: 'not-built' }),
}));
vi.mock('@/lib/api/hooks/use-stonkfun-token', () => ({
  useStonkfunToken: () => idle,
  useStonkfunBurnPlan: () => ({ status: 'idle' }),
}));
vi.mock('../../_lib/use-token-chain-data', () => ({
  useAllHolders: () => idle,
  useMintInfo: () => idle,
  useTokenRevenue: () => idle,
}));
vi.mock('../../_lib/use-token-detail-data', () => ({
  useQuoteUsd: () => idle,
  useTokenMetadata: () => idle,
}));
vi.mock('../../_lib/use-token-tape', () => ({ useTokenTape: () => ({ ...idle, trades: [], candles: [] }) }));

import { TokenDetailClient } from '../TokenDetailClient';

const loading = { token: null, isLoading: true, isFetched: false, isError: false, refetch: vi.fn() };

function visit(pathname: string) {
  window.history.replaceState(null, '', pathname);
}

describe('TokenDetailClient routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTokenDetail.mockReturnValue(loading);
  });
  afterEach(() => {
    visit('/');
  });

  it('reads the mint from the URL when the route param is the static shell', async () => {
    useParams.mockReturnValue({ tokenId: 'placeholder' });
    visit(`/tokens/${MINT}/`);
    render(<TokenDetailClient />);

    await waitFor(() => expect(useTokenDetail).toHaveBeenLastCalledWith(MINT, { enablePolling: true }));
    expect(useTokenDetail).not.toHaveBeenCalledWith('placeholder', expect.anything());
    expect(screen.getByTestId('token-detail-loading')).toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled();
  });

  it('uses the route param directly when it names a mint', async () => {
    useParams.mockReturnValue({ tokenId: MINT });
    visit('/tokens/placeholder/');
    render(<TokenDetailClient />);
    await waitFor(() => expect(useTokenDetail).toHaveBeenLastCalledWith(MINT, { enablePolling: true }));
  });

  it('is a 404 when the URL really is the shell', async () => {
    useParams.mockReturnValue({ tokenId: 'placeholder' });
    visit('/tokens/placeholder/');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<TokenDetailClient />)).toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });

  it('says so when the segment is not an address', async () => {
    useParams.mockReturnValue({ tokenId: 'placeholder' });
    visit('/tokens/not-a-mint/');
    render(<TokenDetailClient />);
    await waitFor(() => expect(screen.getByText('Invalid token address.')).toBeInTheDocument());
    expect(useTokenDetail).toHaveBeenLastCalledWith(null, { enablePolling: true });
    expect(notFound).not.toHaveBeenCalled();
  });
});
