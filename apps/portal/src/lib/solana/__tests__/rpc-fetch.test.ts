import { describe, expect, it, vi } from 'vitest';
import { createFailoverFetch, publicRpcFor, responseLooksBroken } from '../rpc-fetch';

const PRIMARY = 'https://primary.example/v2/key';
const FALLBACK = 'https://api.devnet.solana.com';
const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAccountInfo', params: ['x'] });
const ok = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });

describe('createFailoverFetch', () => {
  it('returns the primary answer when it is healthy', async () => {
    const fetchImpl = vi.fn(async () => ok({ jsonrpc: '2.0', id: 1, result: { value: null } }));
    const f = createFailoverFetch({ primary: PRIMARY, fallback: FALLBACK, fetchImpl });
    const res = await f(PRIMARY, { method: 'POST', body });
    expect((await res.json()).result).toEqual({ value: null });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('replays the request on the fallback when the provider says it cannot complete it', async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      seen.push(String(url));
      return String(url) === PRIMARY
        ? ok({ jsonrpc: '2.0', id: 1, error: { code: -32001, message: 'Unable to complete request at this time.' } })
        : ok({ jsonrpc: '2.0', id: 1, result: 'from-fallback' });
    });
    const onFailover = vi.fn();
    const f = createFailoverFetch({ primary: PRIMARY, fallback: FALLBACK, fetchImpl, onFailover });
    const res = await f(PRIMARY, { method: 'POST', body });
    expect((await res.json()).result).toBe('from-fallback');
    expect(seen).toEqual([PRIMARY, FALLBACK]);
    expect(onFailover).toHaveBeenCalledWith(expect.stringContaining('-32001'));
    // The identical body reached the fallback.
    const second = fetchImpl.mock.calls[1] as unknown as [RequestInfo | URL, RequestInit | undefined];
    expect(second[1]?.body).toBe(body);
  });

  it('fails over on a network error and on 5xx, but not on a normal RPC error', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      calls++;
      if (String(url) === PRIMARY) {
        if (calls === 1) throw new TypeError('Failed to fetch');
        if (calls === 3) return ok({}, 503);
        return ok({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'Invalid params' } });
      }
      return ok({ jsonrpc: '2.0', id: 1, result: 'fallback' });
    });
    const f = createFailoverFetch({ primary: PRIMARY, fallback: FALLBACK, fetchImpl });
    expect((await (await f(PRIMARY, { body })).json()).result).toBe('fallback'); // network error -> fallback
    expect((await (await f(PRIMARY, { body })).json()).result).toBe('fallback'); // 503 -> fallback
    const normal = await (await f(PRIMARY, { body })).json(); // a request error is the caller's
    expect(normal.error.code).toBe(-32602);
  });

  it('times out the primary and moves on', async () => {
    const fetchImpl = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url) === PRIMARY) {
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        });
      }
      return Promise.resolve(ok({ jsonrpc: '2.0', id: 1, result: 'late-but-fine' }));
    });
    const f = createFailoverFetch({ primary: PRIMARY, fallback: FALLBACK, fetchImpl, timeoutMs: 20 });
    expect((await (await f(PRIMARY, { body })).json()).result).toBe('late-but-fine');
  });

  it('passes other URLs straight through and does nothing without a fallback', async () => {
    const fetchImpl = vi.fn(async () =>
      ok({ jsonrpc: '2.0', id: 1, error: { code: -32001, message: 'Unable to complete request at this time.' } }),
    );
    const f = createFailoverFetch({ primary: PRIMARY, fallback: null, fetchImpl });
    const res = await f(PRIMARY, { body });
    expect((await res.json()).error.code).toBe(-32001);
    await createFailoverFetch({ primary: PRIMARY, fallback: FALLBACK, fetchImpl })('https://other.example', { body });
    expect(fetchImpl).toHaveBeenLastCalledWith('https://other.example', expect.anything());
  });
});

describe('responseLooksBroken', () => {
  it('flags provider faults and leaves request errors alone', async () => {
    expect((await responseLooksBroken(ok({ error: { code: -32603, message: 'Internal error' } }))).broken).toBe(true);
    expect(
      (await responseLooksBroken(ok({ error: { code: -32000, message: 'Unable to complete request at this time.' } }))).broken,
    ).toBe(true);
    expect((await responseLooksBroken(ok({ error: { code: -32602, message: 'Invalid params' } }))).broken).toBe(false);
    expect((await responseLooksBroken(ok({ result: 1 }))).broken).toBe(false);
    expect((await responseLooksBroken(ok({}, 429))).broken).toBe(true);
  });
});

describe('publicRpcFor', () => {
  it('names the cluster public RPCs', () => {
    expect(publicRpcFor('devnet')).toBe('https://api.devnet.solana.com');
    expect(publicRpcFor('mainnet')).toBe('https://api.mainnet-beta.solana.com');
  });
});

describe('describeChainError', () => {
  it('turns an unreachable RPC into one sentence and keeps other messages', async () => {
    const { describeChainError } = await import('../rpc-fetch');
    expect(describeChainError(new Error('failed to get info for multiple accounts, RPC_ERROR, Failed to fetch'))).toBe(
      'the Solana RPC could not be reached. Retrying.',
    );
    expect(describeChainError(new Error('429 Too Many Requests'))).toBe('the Solana RPC could not be reached. Retrying.');
    expect(describeChainError(new Error('Account does not exist'))).toBe('Account does not exist');
    expect(describeChainError(null)).toBe('unknown error');
  });
});
