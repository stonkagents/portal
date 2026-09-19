/**
 * Purpose: Module-level "open the feedback dialog" request (FB-1), so any
 *          surface (the footer link, a coming-soon panel, a toast action) can
 *          open the one dialog LayoutShell mounts without threading a context
 *          through the tree. Same pattern as the wallet connect request.
 */

import type { FeedbackKind } from '@/lib/api/feedback';

export interface FeedbackPrefill {
  /** Pre-selects the chip. 'wanted' is the coming-soon kind (no chip; shown as its own prompt). */
  kind?: FeedbackKind;
  /** Pre-filled message text. */
  message?: string;
  /** Overrides the captured route (defaults to the current pathname). */
  path?: string;
}

export interface FeedbackRequest {
  prefill: FeedbackPrefill;
  /** Increments on every open so the dialog can reset its state. */
  seq: number;
}

let current: FeedbackRequest | null = null;
let seq = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Open the feedback dialog. `kind` 'wanted' is for coming-soon surfaces ("Tell us what you wanted"). */
export function openFeedback(kind?: FeedbackKind, prefill: Omit<FeedbackPrefill, 'kind'> = {}): void {
  seq += 1;
  current = { prefill: { ...prefill, ...(kind ? { kind } : {}) }, seq };
  emit();
}

export function closeFeedback(): void {
  if (!current) return;
  current = null;
  emit();
}

export function getFeedbackRequest(): FeedbackRequest | null {
  return current;
}

export function subscribeFeedbackRequest(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
