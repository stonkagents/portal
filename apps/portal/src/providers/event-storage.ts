/**
 * Purpose: localStorage persistence helpers for notification events.
 *          Handles read IDs, dismissed IDs, and notification preferences.
 */
import type { NotificationPrefs } from '@/lib/types/claw-event';
import { PRESET_DEFAULTS } from '@/lib/types/claw-event';

/* ── Constants ─────────────────────────────────────────────────────── */

export const MAX_EVENTS = 200;
export const LS_PREFS = 'stonkagents:notification-prefs';
export const LS_READ_IDS = 'stonkagents:event-read-ids';
export const LS_DISMISSED_IDS = 'stonkagents:event-dismissed-ids';

export const DEFAULT_PREFS: NotificationPrefs = {
  preset: 'balanced',
  overrides: { ...PRESET_DEFAULTS.balanced },
};

/* ── localStorage helpers ──────────────────────────────────────────── */

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage full or unavailable — silently degrade
  }
}
