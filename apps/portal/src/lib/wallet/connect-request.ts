/**
 * Purpose: The one connect request. Every "connect wallet" tap in the portal
 *          lands here; the shared ConnectPrompt (rendered once by
 *          SolanaProvider) opens while a request is pending and resolves it
 *          with the outcome. Module-level, not React state, so the promise a
 *          caller awaits survives ConnectorKit mounting underneath it.
 */

type Listener = () => void;

let pending: { promise: Promise<boolean>; resolve: (ok: boolean) => void } | null = null;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach(l => l());
}

/** Open the connect prompt (or join the one already open) and resolve with whether a wallet connected. */
export function requestConnect(): Promise<boolean> {
  if (pending) return pending.promise;
  let resolve: (ok: boolean) => void = () => undefined;
  const promise = new Promise<boolean>(res => {
    resolve = res;
  });
  pending = { promise, resolve };
  emit();
  return promise;
}

/** Settle the open request: true after a connector connected, false when the prompt was dismissed. */
export function resolveConnect(ok: boolean): void {
  if (!pending) return;
  const { resolve } = pending;
  pending = null;
  emit();
  resolve(ok);
}

export function isConnectRequested(): boolean {
  return pending !== null;
}

/** useSyncExternalStore-compatible subscription. */
export function subscribeConnectRequest(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
