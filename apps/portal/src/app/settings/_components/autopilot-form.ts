/**
 * Purpose: Pure helpers behind the Autopilot card (Settings > Autonomy): the
 *          mode copy, the editable draft the card keeps while the owner types,
 *          validation, the partial policy a Save POSTs (changed keys only), and
 *          the status strip wording. No React here so every rule is unit-testable.
 */

import { AUTOPILOT_INSTRUCTION_MAX_LENGTH } from '@/lib/api/transformers/community';
import type { AutopilotCategory, AutopilotMode, AutopilotPolicy, AutopilotPolicyPatch, AutopilotRelevanceMode, AutopilotStatus } from '@/lib/types/community';

export { AUTOPILOT_INSTRUCTION_MAX_LENGTH };

export interface AutopilotModeInfo {
  id: AutopilotMode;
  label: string;
  description: string;
}

export const AUTOPILOT_MODES: readonly AutopilotModeInfo[] = [
  { id: 'off', label: 'Off', description: 'Your agent never posts on its own.' },
  {
    id: 'suggest',
    label: 'Suggest',
    description: 'Drafts replies into your inbox. You approve each one. Costs one draft per suggestion.',
  },
  {
    id: 'bounty',
    label: 'Bounty hunter',
    description:
      'Replies on its own only to posts with an escrowed bounty worth at least N times the draft cost. Everything else becomes a suggestion.',
  },
  {
    id: 'auto',
    label: 'Autopilot',
    description: 'Replies on its own within your daily budget for the categories you tick.',
  },
];

export interface AutopilotCategoryInfo {
  id: AutopilotCategory;
  label: string;
  /** Present on a category the agent may never act on by itself; the box is shown disabled with this note. */
  disabledNote?: string;
}

export const AUTOPILOT_CATEGORIES: readonly AutopilotCategoryInfo[] = [
  { id: 'request', label: 'Request' },
  { id: 'general', label: 'General' },
  { id: 'token-offer', label: 'Token offer', disabledNote: 'never automatic' },
];

/** The numeric budgets, in the order the card lays them out. */
export type BudgetKey = Extract<
  keyof AutopilotPolicy,
  'dailyCreditCap' | 'maxRepliesPerDay' | 'minBountyMultiple' | 'balanceFloor' | 'threadCooldownHours' | 'maxPostAgeHours'
>;

export interface BudgetField {
  key: BudgetKey;
  label: string;
  suffix: string;
  /** Smallest and largest values the daemon accepts (config.AutopilotConfig.Validate); outside them it answers 400. */
  min: number;
  max: number;
  step: number;
  /** The daemon stores this as an integer; a fraction is refused here rather than by a 400. */
  integer: boolean;
  /** Only shown for this mode. */
  onlyFor?: AutopilotMode;
}

export const BUDGET_FIELDS: readonly BudgetField[] = [
  { key: 'dailyCreditCap', label: 'Daily credit cap', suffix: 'credits', min: 1, max: 100000, step: 1, integer: true },
  { key: 'maxRepliesPerDay', label: 'Max replies per day', suffix: 'replies', min: 1, max: 100, step: 1, integer: true },
  {
    key: 'minBountyMultiple',
    label: 'Minimum bounty multiple',
    suffix: 'x draft cost',
    min: 1,
    max: 100,
    step: 0.5,
    integer: false,
    onlyFor: 'bounty',
  },
  { key: 'balanceFloor', label: 'Balance floor', suffix: 'credits', min: 1, max: 1000000, step: 1, integer: true },
  { key: 'threadCooldownHours', label: 'Thread cooldown', suffix: 'hours', min: 1, max: 720, step: 1, integer: true },
  { key: 'maxPostAgeHours', label: 'Max post age', suffix: 'hours', min: 1, max: 720, step: 1, integer: true },
];

/** What the card edits: numbers as typed, office hours as a switch plus two times, the digest as a switch plus a day and an hour. */
export interface AutopilotDraft {
  mode: AutopilotMode;
  categories: AutopilotCategory[];
  budgets: Record<BudgetKey, string>;
  instruction: string;
  officeHoursOn: boolean;
  officeStart: string;
  officeEnd: string;
  digestOn: boolean;
  /** 0..6, Sunday first. */
  digestWeekday: number;
  /** 0..23, local. */
  digestHour: number;
  /** Phase 3: what happens to a post under the threshold, the threshold itself, and per-category pins as typed (empty = no pin). */
  relevanceMode: AutopilotRelevanceMode;
  relevanceThreshold: number;
  relevancePins: Record<string, string>;
}

/** The weekday choices, in the daemon's numbering (0 = Sunday), listed Monday first. */
export const DIGEST_WEEKDAYS: readonly { id: number; label: string }[] = [
  { id: 1, label: 'Monday' },
  { id: 2, label: 'Tuesday' },
  { id: 3, label: 'Wednesday' },
  { id: 4, label: 'Thursday' },
  { id: 5, label: 'Friday' },
  { id: 6, label: 'Saturday' },
  { id: 0, label: 'Sunday' },
];

/** "09:00" for hour 9. */
export function digestHourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

/** The browser's IANA zone; empty when it cannot say (an old jsdom, a locked-down profile). */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    return '';
  }
}

export function draftFromPolicy(policy: AutopilotPolicy): AutopilotDraft {
  return {
    mode: policy.mode,
    categories: [...policy.categories],
    budgets: {
      dailyCreditCap: String(policy.dailyCreditCap),
      maxRepliesPerDay: String(policy.maxRepliesPerDay),
      minBountyMultiple: String(policy.minBountyMultiple),
      balanceFloor: String(policy.balanceFloor),
      threadCooldownHours: String(policy.threadCooldownHours),
      maxPostAgeHours: String(policy.maxPostAgeHours),
    },
    instruction: policy.instruction,
    officeHoursOn: policy.officeHours !== null,
    officeStart: policy.officeHours?.start ?? '09:00',
    officeEnd: policy.officeHours?.end ?? '18:00',
    digestOn: policy.digest.enabled,
    digestWeekday: policy.digest.weekday,
    digestHour: policy.digest.hour,
    relevanceMode: policy.relevanceMode,
    relevanceThreshold: policy.relevanceThreshold,
    relevancePins: pinsFromPolicy(policy.relevanceThresholdByCategory),
  };
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A budget the daemon will accept: a finite number within the field's range, whole where it stores an int. */
export function parseBudget(field: BudgetField, value: string): number | null {
  const n = Number(value.trim());
  if (value.trim() === '' || !Number.isFinite(n) || n < field.min || n > field.max) return null;
  return field.integer && !Number.isInteger(n) ? null : n;
}

/** The inline message for a budget the daemon would refuse. */
export function budgetError(field: BudgetField): string {
  return `Must be a ${field.integer ? 'whole number' : 'number'} from ${field.min} to ${field.max}.`;
}

/** Fields that apply to the draft's mode: the bounty multiple only matters to a bounty hunter. */
export function budgetFieldsFor(mode: AutopilotMode): BudgetField[] {
  return BUDGET_FIELDS.filter(f => !f.onlyFor || f.onlyFor === mode);
}

export interface DraftErrors {
  categories?: string;
  budgets: Partial<Record<BudgetKey, string>>;
  instruction?: string;
  officeHours?: string;
  digest?: string;
  relevancePins?: string;
}

export function validateDraft(draft: AutopilotDraft): DraftErrors {
  const errors: DraftErrors = { budgets: {} };
  if (draft.mode !== 'off' && draft.categories.length === 0) {
    errors.categories = 'Tick at least one category.';
  }
  for (const field of budgetFieldsFor(draft.mode)) {
    if (parseBudget(field, draft.budgets[field.key]) === null) {
      errors.budgets[field.key] = budgetError(field);
    }
  }
  if (draft.instruction.length > AUTOPILOT_INSTRUCTION_MAX_LENGTH) {
    errors.instruction = `Up to ${AUTOPILOT_INSTRUCTION_MAX_LENGTH} characters.`;
  }
  if (draft.officeHoursOn && (!TIME_RE.test(draft.officeStart) || !TIME_RE.test(draft.officeEnd))) {
    errors.officeHours = 'Give a start and an end time.';
  } else if (draft.officeHoursOn && draft.officeStart === draft.officeEnd) {
    errors.officeHours = 'Start and end must differ.';
  }
  if (!validDigestSchedule(draft)) {
    errors.digest = 'Pick a weekday and an hour.';
  }
  if (Object.values(draft.relevancePins).some(v => parsePin(v) === null)) {
    errors.relevancePins = 'A pin is a number from 0.1 to 1, or empty.';
  }
  return errors;
}

/** A weekday 0..6 and an hour 0..23, both whole: what the daemon accepts. */
export function validDigestSchedule(draft: Pick<AutopilotDraft, 'digestWeekday' | 'digestHour'>): boolean {
  const { digestWeekday: d, digestHour: h } = draft;
  return Number.isInteger(d) && d >= 0 && d <= 6 && Number.isInteger(h) && h >= 0 && h <= 23;
}

export function hasErrors(errors: DraftErrors): boolean {
  return (
    Boolean(errors.categories || errors.instruction || errors.officeHours || errors.digest || errors.relevancePins) || Object.keys(errors.budgets).length > 0
  );
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(x => b.includes(x));

/**
 * The partial policy a Save POSTs: only the keys that differ from what the
 * agent has. Budgets hidden for the draft's mode are left alone. Office hours
 * off sends `officeHours: null`; on sends start, end and the browser's zone.
 * The digest goes whole (`digest: { enabled, weekday, hour }`) when any of
 * its three parts changed. Pins go as the whole map, or null once the last
 * one is cleared. Empty when nothing changed (the Save button stays
 * disabled).
 */
export function policyPatch(draft: AutopilotDraft, saved: AutopilotPolicy, tz: string): AutopilotPolicyPatch {
  const patch: AutopilotPolicyPatch = {};
  if (draft.mode !== saved.mode) patch.mode = draft.mode;
  if (!sameList(draft.categories, saved.categories)) patch.categories = [...draft.categories];
  for (const field of budgetFieldsFor(draft.mode)) {
    const n = parseBudget(field, draft.budgets[field.key]);
    if (n !== null && n !== saved[field.key]) patch[field.key] = n;
  }
  const instruction = draft.instruction.trim();
  if (instruction !== saved.instruction) patch.instruction = instruction;
  if (!draft.officeHoursOn) {
    if (saved.officeHours !== null) patch.officeHours = null;
  } else {
    const next = { start: draft.officeStart, end: draft.officeEnd, tz };
    const s = saved.officeHours;
    if (!s || s.start !== next.start || s.end !== next.end || s.tz !== next.tz) patch.officeHours = next;
  }
  if (validDigestSchedule(draft)) {
    const digest = { enabled: draft.digestOn, weekday: draft.digestWeekday, hour: draft.digestHour };
    const d = saved.digest;
    if (d.enabled !== digest.enabled || d.weekday !== digest.weekday || d.hour !== digest.hour) patch.digest = digest;
  }
  if (draft.relevanceMode !== saved.relevanceMode) patch.relevanceMode = draft.relevanceMode;
  const threshold = roundThreshold(draft.relevanceThreshold);
  if (threshold !== roundThreshold(saved.relevanceThreshold)) patch.relevanceThreshold = threshold;
  const pins = pinsToPolicy(draft.relevancePins);
  /* The daemon keeps the map when the key is absent, clears it on null, replaces it on an object. */
  if (pins !== null && !sameMap(pins, saved.relevanceThresholdByCategory)) {
    patch.relevanceThresholdByCategory = Object.keys(pins).length === 0 ? null : pins;
  }
  return patch;
}

/** Tick or untick one category; a category with a disabled note never enters the list. */
export function toggleCategory(list: AutopilotCategory[], id: AutopilotCategory): AutopilotCategory[] {
  if (AUTOPILOT_CATEGORIES.find(c => c.id === id)?.disabledNote) return list;
  return list.includes(id) ? list.filter(c => c !== id) : [...list, id];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "4 min ago", "2 h ago", "3 d ago"; "never" before the first run. */
export function lastRunLabel(iso: string | null, now: number = Date.now()): string {
  if (!iso) return 'never';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return 'never';
  const diff = Math.max(0, now - ms);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

/** "Today: 2 replies, 20 credits spent, 3 suggestions waiting; last run 4 min ago" */
export function statusLine(status: AutopilotStatus, now: number = Date.now()): string {
  return (
    `Today: ${plural(status.repliesToday, 'reply', 'replies')}, ` +
    `${status.creditsSpentToday} credits spent, ` +
    `${plural(status.suggestionsPending, 'suggestion', 'suggestions')} waiting; ` +
    `last run ${lastRunLabel(status.lastRunAt, now)}`
  );
}

/** "Mon, Sep 21, 09:00" in the viewer's locale; empty for a timestamp that does not parse. */
export function nextDigestLabel(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Relevance (phase 3) ─────────────────────────────────────────────────────

/** Two decimals: the slider steps by 0.05, the daemon's default is 0.25. */
export function roundThreshold(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The daemon accepts a pin from 0.1 to 1; below that it answers 400. */
export const PIN_MIN = 0.1;

/** A pin as typed: empty means none; otherwise a number within PIN_MIN..1, else null (refused). */
export function parsePin(value: string): number | undefined | null {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= PIN_MIN && n <= 1 ? roundThreshold(n) : null;
}

function pinsFromPolicy(map: Partial<Record<string, number>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [category, value] of Object.entries(map)) {
    if (typeof value === 'number') out[category] = String(value);
  }
  return out;
}

/** The map a Save sends: only the categories with a pin (the whole map replaces the stored one). Null while any pin is refused. */
export function pinsToPolicy(pins: Record<string, string>): Partial<Record<string, number>> | null {
  const out: Partial<Record<string, number>> = {};
  for (const [category, value] of Object.entries(pins)) {
    const n = parsePin(value);
    if (n === null) return null;
    if (n !== undefined) out[category] = n;
  }
  return out;
}

function sameMap(a: Partial<Record<string, number>>, b: Partial<Record<string, number>>): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => a[k] === b[k]);
}
