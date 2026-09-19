/**
 * Purpose: Tests for the devnet drip — the module-level gate, once per wallet per day in
 *          this browser, the success toast with its Solscan link, the quiet already-dripped
 *          path, the error toast, and the holder-balance invalidation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

const wallet = vi.hoisted(() => ({ connected: true, publicKey: 'Wa11et' as string | null, fetchBalance: vi.fn(async () => {}) }));
vi.mock('@/lib/wallet', () => ({ useWalletService: () => wallet }));
const addToast = vi.hoisted(() => vi.fn());
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ addToast, dismissToast: vi.fn(), toasts: [] }) }));
/* The tracker's launch config carries the drip flag; the real hook is a fetch we do not want here. */
const launchConfig = vi.hoisted(() => ({ data: { devDripEnabled: true } as Record<string, unknown> | undefined }));
vi.mock('@/lib/launchlab/launch-config', () => ({ useLaunchConfig: () => ({ data: launchConfig.data }) }));

const OK_BODY = {
  signature: '5sig',
  sol: 0.05,
  stonk: 25,
  explorer: 'https://solscan.io/tx/5sig?cluster=devnet',
  sentSol: true,
  sentStonk: true,
};
const fetchMock = vi.fn();

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** The gate reads config at import time, so each case re-imports with its own environment. */
async function loadDevDrip(env: Record<string, string> = { NEXT_PUBLIC_ENV: 'dev', NEXT_PUBLIC_SOLANA_CLUSTER: 'devnet' }) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_TRACKER_URL', 'https://tracker.test');
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import('../DevDrip');
}

function renderWithQuery(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
  return { invalidate };
}

const today = new Date().toISOString().slice(0, 10);

beforeEach(() => {
  vi.unstubAllEnvs();
  localStorage.clear();
  fetchMock.mockReset();
  addToast.mockReset();
  wallet.fetchBalance.mockClear();
  wallet.connected = true;
  wallet.publicKey = 'Wa11et';
  launchConfig.data = { devDripEnabled: true };
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('DevDrip gate', () => {
  it('is inert on production, even on devnet', async () => {
    const { DevDrip, DEV_DRIP_ENABLED } = await loadDevDrip({ NEXT_PUBLIC_ENV: 'production', NEXT_PUBLIC_SOLANA_CLUSTER: 'devnet' });
    expect(DEV_DRIP_ENABLED).toBe(false);
    renderWithQuery(<DevDrip />);
    await new Promise(r => setTimeout(r, 0));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is inert on mainnet, even on the dev deployment', async () => {
    const { DevDrip, DEV_DRIP_ENABLED } = await loadDevDrip({ NEXT_PUBLIC_ENV: 'dev', NEXT_PUBLIC_SOLANA_CLUSTER: 'mainnet' });
    expect(DEV_DRIP_ENABLED).toBe(false);
    renderWithQuery(<DevDrip />);
    await new Promise(r => setTimeout(r, 0));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is live on the dev deployment on devnet', async () => {
    const { DEV_DRIP_ENABLED } = await loadDevDrip();
    expect(DEV_DRIP_ENABLED).toBe(true);
  });
});

describe('DevDrip tracker flag', () => {
  it('reads devDripEnabled loosely: only a literal true switches the drip on', async () => {
    const { readDevDripEnabled } = await loadDevDrip();
    expect(readDevDripEnabled({ devDripEnabled: true })).toBe(true);
    expect(readDevDripEnabled({ devDripEnabled: 'true' })).toBe(false);
    expect(readDevDripEnabled({ devDripEnabled: false })).toBe(false);
    expect(readDevDripEnabled({ programId: 'x' })).toBe(false);
    expect(readDevDripEnabled(undefined)).toBe(false);
    expect(readDevDripEnabled(null)).toBe(false);
  });

  it('never asks while the launch config has not answered', async () => {
    launchConfig.data = undefined;
    const { DevDrip } = await loadDevDrip();
    renderWithQuery(<DevDrip />);
    await new Promise(r => setTimeout(r, 0));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('dev-drip:Wa11et')).toBeNull();
  });

  it('never asks when the tracker reports the drip off or omits the flag (an older tracker)', async () => {
    launchConfig.data = { devDripEnabled: false };
    const { DevDrip } = await loadDevDrip();
    renderWithQuery(<DevDrip />);
    await new Promise(r => setTimeout(r, 0));
    expect(fetchMock).not.toHaveBeenCalled();

    launchConfig.data = { programId: 'x' };
    const { DevDrip: Older } = await loadDevDrip();
    renderWithQuery(<Older />);
    await new Promise(r => setTimeout(r, 0));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(addToast).not.toHaveBeenCalled();
  });

  it('stays quiet on a 404 (the route is unregistered) and does not remember the day', async () => {
    fetchMock.mockResolvedValueOnce(reply(404, { error: { code: 'NOT_FOUND', message: 'not found' } }));
    const { DevDrip } = await loadDevDrip();
    renderWithQuery(<DevDrip />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise(r => setTimeout(r, 0));
    expect(addToast).not.toHaveBeenCalled();
    expect(localStorage.getItem('dev-drip:Wa11et')).toBeNull();
  });
});

describe('DevDrip once per wallet per day', () => {
  it('asks the tracker when the wallet connects and remembers the day', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, OK_BODY));
    const { DevDrip } = await loadDevDrip();
    renderWithQuery(<DevDrip />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      'https://tracker.test/api/dev/drip',
      expect.objectContaining({ body: JSON.stringify({ wallet: 'Wa11et' }) }),
    );
    await waitFor(() => expect(localStorage.getItem('dev-drip:Wa11et')).toBe(today));
  });

  it('does not ask again the same day', async () => {
    localStorage.setItem('dev-drip:Wa11et', today);
    const { DevDrip } = await loadDevDrip();
    renderWithQuery(<DevDrip />);
    await new Promise(r => setTimeout(r, 0));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(addToast).not.toHaveBeenCalled();
  });

  it('asks again on a later day', async () => {
    localStorage.setItem('dev-drip:Wa11et', '2020-01-01');
    fetchMock.mockResolvedValueOnce(reply(200, OK_BODY));
    const { DevDrip } = await loadDevDrip();
    renderWithQuery(<DevDrip />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it('does nothing while no wallet is connected', async () => {
    wallet.connected = false;
    wallet.publicKey = null;
    const { DevDrip } = await loadDevDrip();
    renderWithQuery(<DevDrip />);
    await new Promise(r => setTimeout(r, 0));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('DevDrip outcome', () => {
  it('toasts the send with a Solscan link and refreshes the holder balance', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, OK_BODY));
    const { DevDrip, DEV_DRIP_SENT, DEV_DRIP_LINK } = await loadDevDrip();
    const { invalidate } = renderWithQuery(<DevDrip />);
    await waitFor(() => expect(addToast).toHaveBeenCalledTimes(1));
    expect(addToast).toHaveBeenCalledWith({
      title: DEV_DRIP_SENT,
      description: '0.05 SOL + 25 $STONK on devnet',
      variant: 'success',
      action: { label: DEV_DRIP_LINK, href: OK_BODY.explorer },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['holder-balance'] });
    expect(wallet.fetchBalance).toHaveBeenCalledTimes(1);
  });

  it('names only the leg that was sent', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { ...OK_BODY, sol: 0, sentSol: false }));
    const { DevDrip, DEV_DRIP_SENT_STONK } = await loadDevDrip();
    renderWithQuery(<DevDrip />);
    await waitFor(() => expect(addToast).toHaveBeenCalledTimes(1));
    expect(addToast.mock.calls[0][0]).toMatchObject({ title: DEV_DRIP_SENT_STONK, description: '25 $STONK on devnet' });
  });

  it('stays quiet when the wallet already held enough of both', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { signature: '', sol: 0, stonk: 0, explorer: '', sentSol: false, sentStonk: false }));
    const { DevDrip } = await loadDevDrip();
    const { invalidate } = renderWithQuery(<DevDrip />);
    await waitFor(() => expect(localStorage.getItem('dev-drip:Wa11et')).toBe(today));
    expect(addToast).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('stays quiet on ALREADY_DRIPPED and remembers the day', async () => {
    fetchMock.mockResolvedValueOnce(
      reply(429, { error: { code: 'ALREADY_DRIPPED', message: 'already' }, nextAt: '2026-09-15T12:00:00Z' }),
    );
    const { DevDrip } = await loadDevDrip();
    renderWithQuery(<DevDrip />);
    await waitFor(() => expect(localStorage.getItem('dev-drip:Wa11et')).toBe(today));
    expect(addToast).not.toHaveBeenCalled();
  });

  it('shows the tracker error and does not remember the day', async () => {
    fetchMock.mockResolvedValueOnce(
      reply(503, { error: { code: 'drip_empty', message: 'The drip wallet is empty. Try again later.' } }),
    );
    const { DevDrip, DEV_DRIP_FAILED, DEV_DRIP_FAILED_HINT, DEV_DRIP_RETRY } = await loadDevDrip();
    renderWithQuery(<DevDrip />);
    await waitFor(() => expect(addToast).toHaveBeenCalledTimes(1));
    expect(addToast).toHaveBeenCalledWith({
      title: DEV_DRIP_FAILED,
      description: `The drip wallet is empty. Try again later. ${DEV_DRIP_FAILED_HINT}`,
      variant: 'error',
      action: { label: DEV_DRIP_RETRY, onClick: expect.any(Function) },
    });
    expect(localStorage.getItem('dev-drip:Wa11et')).toBeNull();
  });

  it('Try again asks once more without a reload, and a second success lands as usual', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fetchMock.mockResolvedValueOnce(reply(200, OK_BODY));
    const { DevDrip, DEV_DRIP_RETRY, DEV_DRIP_SENT } = await loadDevDrip();
    renderWithQuery(<DevDrip />);
    await waitFor(() => expect(addToast).toHaveBeenCalledTimes(1));
    const first = addToast.mock.calls[0][0] as { action?: { label: string; onClick: () => void } };
    expect(first.action?.label).toBe(DEV_DRIP_RETRY);
    first.action?.onClick();
    await waitFor(() => expect(addToast).toHaveBeenCalledTimes(2));
    expect(addToast.mock.calls[1][0]).toMatchObject({ title: DEV_DRIP_SENT, variant: 'success' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem('dev-drip:Wa11et')).toBe(today);
  });

  it('offers no retry on a cooldown refusal (IP_LIMITED), which a second ask cannot change', async () => {
    fetchMock.mockResolvedValueOnce(reply(429, { error: { code: 'IP_LIMITED', message: 'Too many wallets from this address today.' } }));
    const { DevDrip, DEV_DRIP_FAILED } = await loadDevDrip();
    renderWithQuery(<DevDrip />);
    await waitFor(() => expect(addToast).toHaveBeenCalledTimes(1));
    expect(addToast).toHaveBeenCalledWith({
      title: DEV_DRIP_FAILED,
      description: 'Too many wallets from this address today.',
      variant: 'error',
    });
  });
});
