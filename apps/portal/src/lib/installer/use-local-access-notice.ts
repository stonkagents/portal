/**
 * Purpose: State behind the "This site needs permission to reach your agent"
 *          banner on agent-dependent surfaces (chat, settings, transfers, every
 *          control behind AgentRequiredNotice). Two hooks: the browser's local
 *          network permission read live (a change on the PermissionStatus,
 *          which the browser fires when the user answers its prompt or edits
 *          the site settings, updates it on the spot), and a page-wide slot so
 *          that however many surfaces mount the banner, one shows: the highest
 *          priority instance (a page top over an inline control), earliest
 *          mounted among equals.
 */
'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { permissionsApiPresent, queryLocalAccessPermission } from './local-network-access';

/** `unknown` while the first query is out; `unsupported` when the browser has no such permission. */
export type LocalAccessState = 'unknown' | 'granted' | 'prompt' | 'denied' | 'unsupported';

function asState(state: PermissionState | string): LocalAccessState {
  return state === 'granted' ? 'granted' : state === 'denied' ? 'denied' : 'prompt';
}

/**
 * The local network permission as the browser reports it now. Never prompts;
 * the gate does that. Re-queried whenever the status reports a change, so the
 * banner clears itself the moment the user allows access.
 */
export function useLocalAccessState(): LocalAccessState {
  const [state, setState] = useState<LocalAccessState>(() => (permissionsApiPresent() ? 'unknown' : 'unsupported'));
  useEffect(() => {
    if (!permissionsApiPresent()) {
      setState('unsupported');
      return;
    }
    let cancelled = false;
    let status: PermissionStatus | null = null;
    const onChange = () => {
      if (!cancelled && status) setState(asState(status.state));
    };
    queryLocalAccessPermission()
      .then(found => {
        if (cancelled) return;
        if (!found) {
          setState('unsupported');
          return;
        }
        status = found;
        setState(asState(found.state));
        found.addEventListener?.('change', onChange);
      })
      .catch(() => {
        if (!cancelled) setState('unsupported');
      });
    return () => {
      cancelled = true;
      status?.removeEventListener?.('change', onChange);
    };
  }, []);
  return state;
}

/** Whether the permission stands in the way: the browser has it and it is not granted. */
export function localAccessBlocked(state: LocalAccessState): boolean {
  return state === 'prompt' || state === 'denied';
}

/* ---- One banner per page ---- */

interface SlotHolder {
  id: symbol;
  priority: number;
  order: number;
}

let holders: SlotHolder[] = [];
let nextOrder = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The instance that renders: highest priority, then earliest mounted. */
function currentHolder(): symbol | null {
  let best: SlotHolder | null = null;
  for (const holder of holders) {
    if (!best || holder.priority > best.priority || (holder.priority === best.priority && holder.order < best.order)) best = holder;
  }
  return best?.id ?? null;
}

/**
 * Claims a place in the page's banner slot; true for the one instance that
 * should render. `priority` lets a page-top banner win over the inline ones
 * mounted by controls (children mount before parents, so order alone would
 * pick the control).
 */
export function useLocalAccessNoticeSlot(priority = 0): boolean {
  const id = useRef<symbol | null>(null);
  if (id.current === null) id.current = Symbol('local-access-notice');
  useEffect(() => {
    const holder: SlotHolder = { id: id.current!, priority, order: nextOrder++ };
    holders = [...holders, holder];
    notify();
    return () => {
      holders = holders.filter(h => h !== holder);
      notify();
    };
  }, [priority]);
  return useSyncExternalStore(
    subscribe,
    () => currentHolder() === id.current,
    () => false,
  );
}

/** Tests only: forget every mounted instance. */
export function resetLocalAccessNoticeSlot(): void {
  holders = [];
  nextOrder = 0;
  notify();
}
