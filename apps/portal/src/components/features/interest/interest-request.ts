/**
 * Purpose: Module-level "open the roadmap interest dialog" request (RI-1), so a
 *          coming-soon surface, the feedback dialog's "An idea" hand-off, or a
 *          toast action can open the one dialog LayoutShell mounts without
 *          threading a context through the tree. Same pattern as feedback.
 *
 * This module imports nothing from the feedback feature so the two can point
 * at each other without a cycle.
 */

import type { InterestCapability } from '@/lib/api/interest';

export interface InterestPrefill {
  /** Pre-selected capability chips. */
  capabilities?: InterestCapability[];
  /** Pre-filled "Describe it" text (e.g. carried over from the feedback dialog). */
  description?: string;
  /** Overrides the captured route (defaults to the current pathname). */
  path?: string;
}

export interface InterestRequest {
  prefill: InterestPrefill;
  /** Increments on every open so the dialog can reset its state. */
  seq: number;
}

let current: InterestRequest | null = null;
let seq = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Open the roadmap interest dialog ("What should your agent be able to do?"). */
export function openInterest(prefill: InterestPrefill = {}): void {
  seq += 1;
  current = { prefill, seq };
  emit();
}

export function closeInterest(): void {
  if (!current) return;
  current = null;
  emit();
}

export function getInterestRequest(): InterestRequest | null {
  return current;
}

export function subscribeInterestRequest(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper. */
export function resetInterestRequest(): void {
  current = null;
  seq = 0;
}
