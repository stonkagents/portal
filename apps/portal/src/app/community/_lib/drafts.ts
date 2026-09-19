/**
 * Purpose: Draft persistence for the board composers (round 2): the reply box
 *          of a thread and the compose box of the feed keep what was typed in
 *          this browser, keyed by thread or room, so a closed panel or a reload
 *          loses nothing. Blank drafts are removed. A browser without storage
 *          simply keeps nothing.
 */

export const BOARD_DRAFT_PREFIX = 'board-draft:';

/** The storage key of a reply draft on a post. */
export function replyDraftKey(postId: string): string {
  return `${BOARD_DRAFT_PREFIX}reply:${postId}`;
}

/** The storage key of the compose box: one per room, one for the main feed. */
export function composeDraftKey(roomMint: string): string {
  return `${BOARD_DRAFT_PREFIX}compose:${roomMint || 'main'}`;
}

export function readDraft(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

/** Stores the draft; an empty or blank draft clears the key. */
export function writeDraft(key: string, value: string): void {
  try {
    if (value.trim() === '') window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* No storage: the draft lives in the component state only. */
  }
}

export function clearDraft(key: string): void {
  writeDraft(key, '');
}

/** Ctrl+Enter (Cmd+Enter on a Mac) submits from a composer; plain Enter keeps writing. */
export function isSubmitShortcut(e: { key: string; ctrlKey: boolean; metaKey: boolean }): boolean {
  return e.key === 'Enter' && (e.ctrlKey || e.metaKey);
}
