/**
 * Purpose: The weekly digest rows of the bell: the daemon's events list (last
 *          50, refetched every 30 s) joined with a read state kept in this
 *          browser (localStorage, try/catch), so the rows survive a reload
 *          with their read marks. A browser with no read state yet takes
 *          every event but the newest as read, so a first load lights the
 *          badge for one digest, not fifty.
 */
'use client';

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { AutopilotEvent } from '@/lib/types/community';

export const DIGEST_READ_KEY = 'autopilot-digest-read';
const DIGEST_READ_MAX = 100;

export interface DigestRow extends AutopilotEvent {
  read: boolean;
}

let cache: Set<string> | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function load(): Set<string> | null {
  try {
    const raw = window.localStorage.getItem(DIGEST_READ_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return null;
  }
}

function save(ids: Set<string>): void {
  try {
    window.localStorage.setItem(DIGEST_READ_KEY, JSON.stringify([...ids].slice(-DIGEST_READ_MAX)));
  } catch {
    /* No storage: the read marks still hold for this session. */
  }
}

/** The read ids; null until something was stored or seeded (a fresh browser). */
export function readDigestReadIds(): Set<string> | null {
  if (!loaded) {
    cache = load();
    loaded = true;
  }
  return cache;
}

/** A new set each time, so subscribers see a new snapshot. */
function commit(next: Set<string>): void {
  cache = next;
  loaded = true;
  save(next);
  listeners.forEach(l => l());
}

export function markDigestsRead(ids: string[]): void {
  const next = new Set(readDigestReadIds() ?? []);
  let changed = false;
  for (const id of ids) {
    if (!next.has(id)) {
      next.add(id);
      changed = true;
    }
  }
  if (changed) commit(next);
}

/** Test hook: forget the cached read state so the next read comes from storage. */
export function resetDigestReadCache(): void {
  cache = null;
  loaded = false;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getServerSnapshot = (): Set<string> | null => null;

/** The digest events as bell rows with their read state, the unread count, and the read actions. */
export function useDigestRows(events: AutopilotEvent[] | undefined) {
  const stored = useSyncExternalStore(subscribe, readDigestReadIds, getServerSnapshot);
  const list = useMemo(() => (events ?? []).filter(e => e.kind === 'digest_posted'), [events]);

  /* First sight of the list in this browser: everything but the newest is old news. */
  const read = useMemo(() => stored ?? new Set(list.slice(1).map(e => e.id)), [stored, list]);
  useEffect(() => {
    if (stored === null && list.length > 0) commit(read);
  }, [stored, list, read]);

  const rows = useMemo<DigestRow[]>(() => list.map(e => ({ ...e, read: read.has(e.id) })), [list, read]);

  const unread = useMemo(() => rows.filter(r => !r.read).length, [rows]);
  const markRead = useCallback((id: string) => markDigestsRead([id]), []);
  const markAllRead = useCallback(() => markDigestsRead(rows.map(r => r.id)), [rows]);

  return { rows, unread, markRead, markAllRead };
}
