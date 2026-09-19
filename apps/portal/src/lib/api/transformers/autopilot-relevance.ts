/**
 * Purpose: Readers for the phase 3 autopilot fields (relevance scoring, the
 *          tuned thresholds and the outcome ledger). Like the other autopilot
 *          readers, the daemon may spell keys camelCase or snake_case, and a
 *          missing or malformed field falls back to a default rather than
 *          failing the parse.
 */

import type {
  AutopilotLedger,
  AutopilotLedgerDay,
  AutopilotLedgerTotals,
  AutopilotRelevanceMode,
  AutopilotRelevanceSignals,
  AutopilotTunedThreshold,
} from '@/lib/types/community';

type Raw = Record<string, unknown>;

const isRecord = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v);

/** `camel` first, then its snake_case spelling. */
function pick(raw: Raw, camel: string): unknown {
  if (raw[camel] !== undefined) return raw[camel];
  const snake = camel.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
  return raw[snake];
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const count = (v: unknown): number => Math.max(0, num(v, 0));

export const RELEVANCE_MODES: readonly AutopilotRelevanceMode[] = ['off', 'skip', 'note'];
/** The contract's defaults (phase 3, section 1). */
export const DEFAULT_RELEVANCE_THRESHOLD = 0.25;
export const DEFAULT_RELEVANCE_MODE: AutopilotRelevanceMode = 'skip';

/** A score or threshold, clamped to 0..1; undefined for anything that is not a number. */
export function readUnit(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  return Math.min(1, Math.max(0, v));
}

export function parseRelevanceMode(v: unknown): AutopilotRelevanceMode {
  return RELEVANCE_MODES.includes(v as AutopilotRelevanceMode) ? (v as AutopilotRelevanceMode) : DEFAULT_RELEVANCE_MODE;
}

/** `{ library, history, instruction, routed }`, each 0..1; undefined when nothing usable was sent. */
export function parseRelevanceSignals(v: unknown): AutopilotRelevanceSignals | undefined {
  if (!isRecord(v)) return undefined;
  const signals = {
    library: readUnit(v.library),
    history: readUnit(v.history),
    instruction: readUnit(v.instruction),
    routed: readUnit(v.routed),
  };
  if (Object.values(signals).every(s => s === undefined)) return undefined;
  return { library: signals.library ?? 0, history: signals.history ?? 0, instruction: signals.instruction ?? 0, routed: signals.routed ?? 0 };
}

/** `{ "<category>": 0.4 }`; a value outside 0..1 or not a number is dropped. */
export function parseThresholdByCategory(v: unknown): Partial<Record<string, number>> {
  if (!isRecord(v)) return {};
  const out: Partial<Record<string, number>> = {};
  for (const [category, value] of Object.entries(v)) {
    const t = readUnit(value);
    if (t !== undefined && category) out[category] = t;
  }
  return out;
}

/**
 * `{ "<category>": { threshold, hitRate, posted, direction } }` (`samples` read
 * beside `posted`); a bare number per category is read as a threshold with no
 * rate. A hit rate over 1 is taken as a percent.
 */
export function parseTunedThresholds(v: unknown): Record<string, AutopilotTunedThreshold> {
  if (!isRecord(v)) return {};
  const out: Record<string, AutopilotTunedThreshold> = {};
  for (const [category, value] of Object.entries(v)) {
    if (!category) continue;
    if (typeof value === 'number') {
      const t = readUnit(value);
      if (t !== undefined) out[category] = { threshold: t, hitRate: null, samples: 0, direction: '' };
      continue;
    }
    if (!isRecord(value)) continue;
    const threshold = readUnit(pick(value, 'threshold'));
    if (threshold === undefined) continue;
    const rawRate = pick(value, 'hitRate');
    const rate = typeof rawRate === 'number' && Number.isFinite(rawRate) ? (rawRate > 1 ? rawRate / 100 : rawRate) : null;
    const direction = pick(value, 'direction');
    out[category] = {
      threshold,
      hitRate: rate === null ? null : Math.min(1, Math.max(0, rate)),
      samples: count(pick(value, 'posted') ?? pick(value, 'samples')),
      direction: direction === 'up' || direction === 'down' ? direction : '',
    };
  }
  return out;
}

export const EMPTY_LEDGER_TOTALS: AutopilotLedgerTotals = { drafted: 0, posted: 0, hits: 0, hitRate: 0, creditsSpent: 0, creditsWon: 0 };

function parseLedgerTotals(v: unknown): AutopilotLedgerTotals {
  if (!isRecord(v)) return { ...EMPTY_LEDGER_TOTALS };
  const rawRate = pick(v, 'hitRate');
  const rate = typeof rawRate === 'number' && Number.isFinite(rawRate) ? (rawRate > 1 ? rawRate / 100 : rawRate) : 0;
  return {
    drafted: count(pick(v, 'drafted')),
    posted: count(pick(v, 'posted')),
    hits: count(pick(v, 'hits')),
    hitRate: Math.min(1, Math.max(0, rate)),
    creditsSpent: count(pick(v, 'creditsSpent')),
    creditsWon: count(pick(v, 'creditsWon')),
  };
}

/** `{ date, drafts, hits }` (also `day` and `drafted`); null without a date the strip can place. */
export function parseLedgerDay(v: unknown): AutopilotLedgerDay | null {
  if (!isRecord(v)) return null;
  const raw = pick(v, 'date') ?? pick(v, 'day');
  if (typeof raw !== 'string' || raw.length < 10) return null;
  const date = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return { date, drafts: count(pick(v, 'drafts') ?? pick(v, 'drafted')), hits: count(pick(v, 'hits')) };
}

/** `{ last30, days }`; null when the daemon sent neither half (an agent without a ledger). */
export function parseLedger(v: unknown): AutopilotLedger | null {
  if (!isRecord(v)) return null;
  const last30 = pick(v, 'last30');
  const days = pick(v, 'days');
  if (!isRecord(last30) && !Array.isArray(days)) return null;
  return {
    last30: parseLedgerTotals(last30),
    days: Array.isArray(days) ? days.map(parseLedgerDay).filter((d): d is AutopilotLedgerDay => d !== null) : [],
  };
}
