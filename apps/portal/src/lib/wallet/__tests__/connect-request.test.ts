import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isConnectRequested, requestConnect, resolveConnect, subscribeConnectRequest } from '../connect-request';

describe('connect request', () => {
  beforeEach(() => {
    resolveConnect(false);
  });

  it('opens on request, notifies subscribers, and resolves with the outcome', async () => {
    const listener = vi.fn();
    subscribeConnectRequest(listener);
    expect(isConnectRequested()).toBe(false);

    const p = requestConnect();
    expect(isConnectRequested()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    resolveConnect(true);
    expect(isConnectRequested()).toBe(false);
    await expect(p).resolves.toBe(true);
  });

  it('shares one prompt between concurrent callers', async () => {
    const a = requestConnect();
    const b = requestConnect();
    expect(a).toBe(b);
    resolveConnect(false);
    await expect(a).resolves.toBe(false);
  });

  it('ignores a resolve with nothing pending', () => {
    expect(() => resolveConnect(true)).not.toThrow();
  });
});
