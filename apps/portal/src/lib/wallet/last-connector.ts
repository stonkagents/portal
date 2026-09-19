/**
 * Purpose: Remember which connector the visitor last connected with, so a
 *          refresh that ConnectorKit's own autoConnect misses can retry it.
 */

export const LAST_CONNECTOR_STORAGE_KEY = 'stonkagents:last-wallet-connector-id';

export function rememberConnector(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_CONNECTOR_STORAGE_KEY, id);
  } catch {
    /* Storage blocked: the session still works, it just will not auto-reconnect. */
  }
}

export function forgetConnector(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LAST_CONNECTOR_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function rememberedConnector(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(LAST_CONNECTOR_STORAGE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}
