/**
 * Purpose: One switch for "Hide auto posts and replies", shared by the thread
 *          panel (where it is toggled; the tracker leaves auto replies out with
 *          `hide_auto=1`) and the feed (which drops posts an autopilot wrote,
 *          the weekly digest among them). Kept in this browser: a reader who
 *          hides them once means it.
 */
'use client';

import { useSyncExternalStore } from 'react';

export const HIDE_AUTO_KEY = 'board-hide-auto';

let value: boolean | null = null;
const listeners = new Set<() => void>();

function read(): boolean {
  if (value === null) {
    try {
      value = window.localStorage.getItem(HIDE_AUTO_KEY) === '1';
    } catch {
      value = false;
    }
  }
  return value;
}

export function setHideAuto(next: boolean): void {
  value = next;
  try {
    window.localStorage.setItem(HIDE_AUTO_KEY, next ? '1' : '0');
  } catch {
    /* No storage: the switch still holds for this session. */
  }
  listeners.forEach(l => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const readServer = () => false;

/** The switch as React state; `[hideAuto, setHideAuto]`. */
export function useHideAuto(): [boolean, (next: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, readServer);
  return [on, setHideAuto];
}
