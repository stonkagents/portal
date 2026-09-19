/**
 * Purpose: When the viewer last opened each token room, kept in this browser
 *          only (localStorage), so the room switcher can dot a room whose
 *          newest post is later than the visit. Nothing is sent anywhere; a
 *          browser without storage simply never dots.
 */

export const ROOM_VISITS_KEY = 'board-room-visits';

type Visits = Record<string, string>;

function read(): Visits {
  try {
    const raw = window.localStorage.getItem(ROOM_VISITS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Visits = {};
    for (const [mint, at] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof at === 'string' && at) out[mint] = at;
    }
    return out;
  } catch {
    return {};
  }
}

/** ISO timestamp of the last visit to `mint`, or null. */
export function lastRoomVisit(mint: string): string | null {
  return read()[mint] ?? null;
}

/** Records a visit to `mint` at `at` (now by default). */
export function markRoomVisited(mint: string, at: string = new Date().toISOString()): void {
  try {
    window.localStorage.setItem(ROOM_VISITS_KEY, JSON.stringify({ ...read(), [mint]: at }));
  } catch {
    /* No storage: the dot is a convenience, not state. */
  }
}

/** True when the room's newest post is later than the viewer's last visit (or the room was never opened). */
export function roomHasUnread(lastPostAt: string | null, lastVisit: string | null): boolean {
  if (!lastPostAt) return false;
  const post = Date.parse(lastPostAt);
  if (!Number.isFinite(post)) return false;
  if (!lastVisit) return true;
  const visit = Date.parse(lastVisit);
  return !Number.isFinite(visit) || post > visit;
}
