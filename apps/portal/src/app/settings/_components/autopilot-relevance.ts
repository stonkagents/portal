/**
 * Purpose: Pure helpers behind the relevance section and the 30-day strip of
 *          the Autopilot card (phase 3): the mode copy, the counter line, the
 *          tuned-threshold wording next to the slider, and the day grid the
 *          strip draws from the ledger. No React here so every rule is unit-testable.
 */

import type { AutopilotLedgerDay, AutopilotRelevanceMode, AutopilotStatus, AutopilotTunedThreshold } from '@/lib/types/community';

export interface RelevanceModeInfo {
  id: AutopilotRelevanceMode;
  label: string;
  description: string;
}

export const RELEVANCE_MODES: readonly RelevanceModeInfo[] = [
  { id: 'off', label: 'Off', description: 'Every post is drafted, relevant or not.' },
  { id: 'skip', label: 'Skip', description: 'Posts under the threshold are skipped; no draft, no credits.' },
  { id: 'note', label: 'Note', description: 'Drafts anyway and records the score, so you can see what a threshold would skip.' },
];

/** The slider's range: 0.1 to 1, what the daemon accepts, in 0.05 steps so the 0.25 default stays selectable. */
export const RELEVANCE_SLIDER = { min: 0.1, max: 1, step: 0.05 } as const;

/** The board categories a pin can name, in the order the card lays them out. */
export const PIN_CATEGORIES: readonly string[] = ['general', 'request', 'bounty', 'token-offer', 'discovery'];

/** Category labels for the tuned list and the pins; a category the card does not know is shown as sent. */
const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  request: 'Requests',
  general: 'General',
  bounty: 'Bounties',
  'token-offer': 'Token offers',
  discovery: 'Discovery',
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

/** "0.25", "0.4": trailing zeros dropped, two decimals at most. */
export function thresholdLabel(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** "0.25", "0.40": the slider's current value, always two decimals. */
export function sliderValueLabel(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

/** "12%" from a 0..1 rate. */
export function percentLabel(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** "Skipped 12, drafted 3 this month". */
export function relevanceCountersLine(relevance: AutopilotStatus['relevance']): string {
  return `Skipped ${relevance.skipped}, drafted ${relevance.drafted} this month`;
}

/**
 * "Requests: 0.35 (tuned up, 10% hit rate)" next to the slider. Up or down is
 * the daemon's `direction`, or against the policy threshold when it sent none;
 * "pinned" when the owner fixed that category.
 */
export function tunedLine(category: string, tuned: AutopilotTunedThreshold, policyThreshold: number, pinned: boolean): string {
  const value = thresholdLabel(tuned.threshold);
  if (pinned) return `${categoryLabel(category)}: ${value} (pinned)`;
  const moved = tuned.direction || (tuned.threshold > policyThreshold ? 'up' : tuned.threshold < policyThreshold ? 'down' : '');
  const direction = moved ? `tuned ${moved}` : 'unchanged';
  const rate = tuned.hitRate === null ? '' : `, ${percentLabel(tuned.hitRate)} hit rate`;
  return `${categoryLabel(category)}: ${value} (${direction}${rate})`;
}

/** "YYYY-MM-DD" in UTC, the key the ledger rows carry. */
function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The strip's 30 columns, oldest first, ending today: one per calendar day,
 * zeros where the ledger has no row. Rows on the same day are summed.
 */
export function ledgerDays(days: readonly AutopilotLedgerDay[], now: number = Date.now(), count = 30): AutopilotLedgerDay[] {
  const byDate = new Map<string, AutopilotLedgerDay>();
  for (const d of days) {
    const prev = byDate.get(d.date);
    byDate.set(d.date, prev ? { date: d.date, drafts: prev.drafts + d.drafts, hits: prev.hits + d.hits } : { ...d });
  }
  const out: AutopilotLedgerDay[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const date = dayKey(now - i * DAY_MS);
    out.push(byDate.get(date) ?? { date, drafts: 0, hits: 0 });
  }
  return out;
}

/** "Sep 15: 2 drafts, 1 hit" for a column's tooltip. */
export function ledgerDayTitle(day: AutopilotLedgerDay): string {
  const ms = Date.parse(`${day.date}T00:00:00Z`);
  const when = Number.isFinite(ms) ? new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }) : day.date;
  return `${when}: ${day.drafts} ${day.drafts === 1 ? 'draft' : 'drafts'}, ${day.hits} ${day.hits === 1 ? 'hit' : 'hits'}`;
}
