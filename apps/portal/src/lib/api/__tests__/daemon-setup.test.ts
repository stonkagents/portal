/**
 * Purpose: Tests for the agent setup client (RUN-1 Permissions step): the
 *          GET/POST contract, the 404 pre-endpoint case, and the row helpers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  allChecksOk,
  applySetupFix,
  blockingChecks,
  pendingChecksNote,
  setupBlocked,
  getSetupStatus,
  parseSetupStatus,
  rowFix,
  rowStatus,
  SETUP_HEADER,
  SETUP_HEADERS,
  SETUP_ERROR_MESSAGES,
  STATUS_TIMEOUT_MS,
  checkTimedOut,
  SETUP_ROWS,
  SETUP_STATUS_URL,
  setupFixUrl,
  type SetupCheckId,
  type SetupStatus,
} from '../daemon-setup';

const fetchMock = vi.fn();

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const GREEN: SetupStatus = {
  checks: [
    { id: 'service', status: 'ok' },
    { id: 'controller', status: 'ok' },
    { id: 'firewall', status: 'ok' },
    { id: 'p2p', status: 'ok' },
    { id: 'tracker', status: 'ok' },
    { id: 'storage', status: 'ok' },
    { id: 'bandwidth', status: 'ok' },
    { id: 'autostart', status: 'ok' },
    { id: 'origin', status: 'ok' },
  ],
};

describe('urls', () => {
  it('lives under the daemon api v1 root', () => {
    expect(SETUP_STATUS_URL).toMatch(/\/api\/v1\/setup\/status$/);
    expect(setupFixUrl('firewall')).toMatch(/\/api\/v1\/setup\/firewall$/);
  });
});

describe('getSetupStatus', () => {
  it('returns the parsed checks on 200 and declares the loopback target (PERF-2)', async () => {
    fetchMock.mockResolvedValueOnce(json({ checks: [{ id: 'firewall', status: 'missing', message: 'No rule' }] }));
    const res = await getSetupStatus();
    expect(res).toEqual({ kind: 'ok', status: { checks: [{ id: 'firewall', status: 'missing', message: 'No rule' }] } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { targetAddressSpace?: string }];
    expect(url).toBe(SETUP_STATUS_URL);
    expect(init.targetAddressSpace).toBe('loopback');
  });

  it('reads a 404 as unsupported: the agent predates the setup surface', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'not found' }, 404));
    expect(await getSetupStatus()).toEqual({ kind: 'unsupported' });
  });

  it('reads any other failure, a network error or a malformed body as unreachable', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 500));
    expect(await getSetupStatus()).toEqual({ kind: 'unreachable' });
    fetchMock.mockRejectedValueOnce(new Error('boom'));
    expect(await getSetupStatus()).toEqual({ kind: 'unreachable' });
    fetchMock.mockResolvedValueOnce(json({ nope: true }));
    expect(await getSetupStatus()).toEqual({ kind: 'unreachable' });
  });

  it('drops malformed or unknown checks instead of failing', () => {
    expect(
      parseSetupStatus({
        checks: [{ id: 'firewall', status: 'ok' }, { id: 'quantum', status: 'ok' }, { id: 'p2p', status: 'weird' }, 'x'],
      }),
    ).toEqual({
      checks: [{ id: 'firewall', status: 'ok' }],
    });
    expect(parseSetupStatus(null)).toBeNull();
    expect(parseSetupStatus({ checks: 'no' })).toBeNull();
  });
});

describe('applySetupFix', () => {
  it('POSTs the check id and returns the re-evaluated check, wrapped or bare', async () => {
    fetchMock.mockResolvedValueOnce(json({ check: { id: 'firewall', status: 'ok' } }));
    expect(await applySetupFix('firewall')).toEqual({ kind: 'ok', check: { id: 'firewall', status: 'ok' }, restartRequired: false });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(setupFixUrl('firewall'));
    expect(init.method).toBe('POST');

    fetchMock.mockResolvedValueOnce(json({ id: 'storage', status: 'ok' }));
    expect(await applySetupFix('storage')).toEqual({ kind: 'ok', check: { id: 'storage', status: 'ok' }, restartRequired: false });

    fetchMock.mockResolvedValueOnce(json({}));
    expect(await applySetupFix('bandwidth')).toEqual({ kind: 'ok', check: null, restartRequired: false });
  });

  it('carries the CSRF headers the daemon requires on every setup POST, and none on the GET', async () => {
    expect(SETUP_HEADER).toBe('X-StonkAgents-Setup');
    expect(SETUP_HEADERS).toEqual({ Accept: 'application/json', 'Content-Type': 'application/json', 'X-StonkAgents-Setup': '1' });

    const ids = ['firewall', 'storage', 'bandwidth', 'autostart', 'origin'] as const;
    for (const id of ids) {
      fetchMock.mockResolvedValueOnce(json({ check: { id, status: 'ok' } }));
      await applySetupFix(id);
    }
    expect(fetchMock).toHaveBeenCalledTimes(ids.length);
    for (const call of fetchMock.mock.calls as [string, RequestInit & { targetAddressSpace?: string }][]) {
      const headers = call[1].headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-StonkAgents-Setup']).toBe('1');
      expect(call[1].body).toBe('{}');
      expect(call[1].targetAddressSpace).toBe('loopback');
    }

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(json({ checks: [] }));
    await getSetupStatus();
    const [, getInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(getInit.method).toBeUndefined();
    expect(getInit.headers).not.toHaveProperty('X-StonkAgents-Setup');
    expect(getInit.headers).not.toHaveProperty('Content-Type');
  });

  it('reads a 202 as applied-after-restart, and the same flag in a proxied check detail', async () => {
    const moved = { id: 'storage', status: 'ok', message: 'restart to apply', detail: { restartRequired: true, path: 'D:/data' } };
    fetchMock.mockResolvedValueOnce(json({ check: moved }, 202));
    expect(await applySetupFix('storage')).toEqual({ kind: 'ok', check: moved, restartRequired: true });

    fetchMock.mockResolvedValueOnce(json({ check: moved }, 200));
    expect(await applySetupFix('storage')).toEqual({ kind: 'ok', check: moved, restartRequired: true });

    fetchMock.mockResolvedValueOnce(json({ check: { id: 'storage', status: 'ok', detail: { path: 'D:/data' } } }, 200));
    expect((await applySetupFix('storage')) as { restartRequired?: boolean }).toMatchObject({ kind: 'ok', restartRequired: false });
  });

  it('surfaces the daemon error message, a 404 as unsupported, and a network failure as a retryable error', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'ELEVATION_DENIED', message: 'Elevation was refused' } }, 403));
    expect(await applySetupFix('firewall')).toEqual({ kind: 'error', message: 'Elevation was refused', code: 'ELEVATION_DENIED' });
    fetchMock.mockResolvedValueOnce(json(null, 500));
    expect(await applySetupFix('firewall')).toEqual({ kind: 'error', message: 'Could not apply the fix (500)', code: null });
    fetchMock.mockResolvedValueOnce(json(null, 404));
    expect(await applySetupFix('autostart')).toEqual({ kind: 'unsupported' });
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await applySetupFix('origin')).toEqual({ kind: 'error', message: 'Your agent did not answer. Try again.', code: null });
  });

  it("carries the daemon's refusal codes and falls back to our words when it sends none", async () => {
    const cases: [SetupCheckId, number, string][] = [
      ['origin', 403, 'ORIGIN_NOT_ALLOWED'],
      ['storage', 400, 'INVALID_REQUEST'],
      ['bandwidth', 400, 'INVALID_REQUEST'],
      ['firewall', 409, 'DAEMON_EXE_MISSING'],
    ];
    for (const [id, status, code] of cases) {
      fetchMock.mockResolvedValueOnce(json({ error: { code, message: `daemon says ${code}` } }, status));
      expect(await applySetupFix(id)).toEqual({ kind: 'error', message: `daemon says ${code}`, code });
      fetchMock.mockResolvedValueOnce(json({ error: { code } }, status));
      expect(await applySetupFix(id)).toEqual({ kind: 'error', message: SETUP_ERROR_MESSAGES[code], code });
    }
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'SOMETHING_NEW' } }, 418));
    expect(await applySetupFix('origin')).toEqual({ kind: 'error', message: 'Could not apply the fix (418)', code: 'SOMETHING_NEW' });
  });
});

describe('status budget', () => {
  it('waits longer than the daemon’s 8s check budget before reading a live agent as unreachable', () => {
    expect(STATUS_TIMEOUT_MS).toBeGreaterThan(8000);
    expect(STATUS_TIMEOUT_MS).toBe(10_000);
  });

  it('aborts the status read at the budget and reads it as unreachable', async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementationOnce(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          }),
      );
      const pending = getSetupStatus();
      await vi.advanceTimersByTimeAsync(STATUS_TIMEOUT_MS - 1);
      let settled = false;
      void pending.then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      expect(await pending).toEqual({ kind: 'unreachable' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('tells a check the daemon gave up on apart from one that really failed', () => {
    expect(checkTimedOut({ id: 'firewall', status: 'failed', message: 'check did not finish within 8s' })).toBe(true);
    expect(checkTimedOut({ id: 'firewall', status: 'failed', message: 'no rule for the agent' })).toBe(false);
    expect(checkTimedOut({ id: 'firewall', status: 'ok', message: 'check did not finish within 8s' })).toBe(false);
    expect(checkTimedOut({ id: 'firewall', status: 'failed' })).toBe(false);
  });
});

describe('row helpers', () => {
  const network = SETUP_ROWS.find(r => r.id === 'network')!;
  const storage = SETUP_ROWS.find(r => r.id === 'storage')!;

  it('allChecksOk needs every reported check green', () => {
    expect(allChecksOk(GREEN)).toBe(true);
    expect(allChecksOk({ checks: [] })).toBe(true);
    expect(allChecksOk({ checks: [{ id: 'p2p', status: 'failed' }] })).toBe(false);
  });

  it('only a fixable check that was actually evaluated blocks; report-only and timed-out checks are a note', () => {
    expect(setupBlocked(GREEN)).toBe(false);
    expect(setupBlocked({ checks: [{ id: 'firewall', status: 'missing' }] })).toBe(true);
    expect(blockingChecks({ checks: [{ id: 'firewall', status: 'missing' }, { id: 'p2p', status: 'failed' }] }).map(c => c.id)).toEqual([
      'firewall',
    ]);
    /* p2p and tracker have no Grant: the agent retries them on its own. */
    expect(setupBlocked({ checks: [{ id: 'p2p', status: 'failed' }, { id: 'tracker', status: 'missing' }] })).toBe(false);
    /* A fixable check the daemon gave up on is slow, not denied. */
    expect(setupBlocked({ checks: [{ id: 'firewall', status: 'failed', message: 'check did not finish within 8s' }] })).toBe(false);
  });

  it('pendingChecksNote names what is still settling and the first real failure reason', () => {
    expect(pendingChecksNote(GREEN)).toBeNull();
    expect(pendingChecksNote({ checks: [{ id: 'firewall', status: 'missing' }] })).toBeNull();
    const note = pendingChecksNote({
      checks: [
        { id: 'tracker', status: 'missing', message: 'tracker registration pending' },
        { id: 'p2p', status: 'failed', message: 'neither the DHT nor a relay is available; peers cannot reach this agent' },
        { id: 'firewall', status: 'failed', message: 'check did not finish within 8s' },
      ],
    });
    expect(note).toContain('Still settling: tracker registration, P2P network, firewall rule');
    expect(note).toContain('(neither the DHT nor a relay is available; peers cannot reach this agent)');
    expect(note).toContain('you can continue');
  });

  it('a row is red when any backing check is not ok; failed outranks missing', () => {
    expect(rowStatus(GREEN, network)).toBe('ok');
    const status: SetupStatus = {
      checks: [
        { id: 'firewall', status: 'missing' },
        { id: 'p2p', status: 'failed' },
        { id: 'storage', status: 'ok' },
      ],
    };
    expect(rowStatus(status, network)).toBe('failed');
    expect(rowStatus(status, storage)).toBe('ok');
  });

  it('rowFix picks the first fixable check that is not ok; p2p alone is not fixable from here', () => {
    expect(
      rowFix(
        {
          checks: [
            { id: 'firewall', status: 'missing' },
            { id: 'p2p', status: 'failed' },
          ],
        },
        network,
      )?.id,
    ).toBe('firewall');
    expect(rowFix({ checks: [{ id: 'p2p', status: 'failed' }] }, network)).toBeNull();
    expect(rowFix(GREEN, storage)).toBeNull();
  });
});
