/**
 * Purpose: The "new since your last visit" line in the feed (round 2). The
 *          tracker answers the first page of a plain feed with the viewer's
 *          previous visit; the line sits before the first post older than it,
 *          so everything above is new. Nothing on a first visit, when nothing
 *          is new, or when everything shown is new (the line would sit at the
 *          very end and say nothing).
 */
import { Icon } from '@/components/ui';
import type { Post } from '@/lib/types/community';

/**
 * The index of the first post at or older than `lastVisitAt`, or -1 when the
 * divider has no place: no visit, no older post (everything is new), or no new
 * post at all (the line would be first). Pinned posts lead the feed whatever
 * their time, so they are skipped when deciding.
 */
export function newSinceIndex(posts: readonly Post[], lastVisitAt: string | null | undefined): number {
  if (!lastVisitAt) return -1;
  const visit = Date.parse(lastVisitAt);
  if (!Number.isFinite(visit)) return -1;
  let sawNew = false;
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    if (p.pinned || p.roomPinned) continue;
    const at = Date.parse(p.timestamp);
    if (!Number.isFinite(at)) continue;
    if (at > visit) {
      sawNew = true;
      continue;
    }
    return sawNew ? i : -1;
  }
  return -1;
}

export function NewSinceDivider() {
  return (
    <div className="flex items-center gap-2 my-3 text-[11px] font-bold uppercase tracking-wide text-accent-green" role="separator" data-testid="board-new-since">
      <span className="flex-1 h-px bg-accent-green/40" />
      <span className="inline-flex items-center gap-1">
        <Icon name="chevron-up" size="sm" /> New since your last visit, above this line
      </span>
      <span className="flex-1 h-px bg-accent-green/40" />
    </div>
  );
}
