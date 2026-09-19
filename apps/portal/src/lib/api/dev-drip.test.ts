/**
 * Purpose: Tests for the dev drip client — the success shape, the 429 with nextAt, the
 *          drip_empty 503, a dead network, and the never-fake-success guard.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/config', () => ({
  trackerEndpoint: (path: string) => `https://tracker.test${path}`,
}));

import { requestDevDrip, DevDripError, DEV_DRIP_PATH } from './dev-drip';

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

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestDevDrip', () => {
  it('posts the wallet to the tracker drip route and returns the drip', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, OK_BODY));
    await expect(requestDevDrip('Wa11et')).resolves.toEqual(OK_BODY);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://tracker.test${DEV_DRIP_PATH}`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ wallet: 'Wa11et' }) }),
    );
  });

  it('surfaces a 429 as ALREADY_DRIPPED with the nextAt instant', async () => {
    fetchMock.mockResolvedValueOnce(
      reply(429, {
        error: { code: 'ALREADY_DRIPPED', message: 'This wallet was already dripped in the last 24 hours.' },
        nextAt: '2026-09-15T12:00:00Z',
      }),
    );
    const err = await requestDevDrip('Wa11et').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DevDripError);
    expect(err).toMatchObject({
      code: 'ALREADY_DRIPPED',
      status: 429,
      nextAt: '2026-09-15T12:00:00Z',
      message: 'This wallet was already dripped in the last 24 hours.',
    });
  });

  it('surfaces a 503 drip_empty with the tracker message', async () => {
    fetchMock.mockResolvedValueOnce(
      reply(503, { error: { code: 'drip_empty', message: 'The drip wallet is empty. Try again later.' } }),
    );
    await expect(requestDevDrip('Wa11et')).rejects.toMatchObject({ code: 'drip_empty', status: 503, nextAt: null });
  });

  it('maps unknown codes to UNKNOWN but keeps the status', async () => {
    fetchMock.mockResolvedValueOnce(reply(500, { error: 'boom' }));
    await expect(requestDevDrip('Wa11et')).rejects.toMatchObject({ code: 'UNKNOWN', status: 500, message: 'boom' });
  });

  it('reports a dead network as NETWORK', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(requestDevDrip('Wa11et')).rejects.toMatchObject({ code: 'NETWORK', status: null });
  });

  it('never fakes success on a 200 that is not the drip shape', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>edge</html>', { status: 200 }));
    await expect(requestDevDrip('Wa11et')).rejects.toMatchObject({ code: 'UNKNOWN', status: 200 });
  });
});
