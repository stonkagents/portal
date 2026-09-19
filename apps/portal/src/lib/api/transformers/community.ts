/**
 * Purpose: Transform tracker portal board responses to frontend Post/ThreadReply types
 */

import type {
  AutopilotCategory,
  AutopilotMode,
  AutopilotOfficeHours,
  AutopilotPolicy,
  AutopilotSettings,
  AutopilotStatus,
  AutopilotSuggestion,
  BountyDispute,
  BountyStatus,
  Mention,
  AutopilotDigest,
  AutopilotEvent,
  Post,
  PostCategory,
  PostRoomRef,
  ThreadReply,
  TokenOfferDetails,
} from '@/lib/types/community';
import type { PortalMention, PortalPost, PortalReply } from '@/lib/types/backend';
import { readAuthorRef } from './peer-ref';
import {
  DEFAULT_RELEVANCE_MODE,
  DEFAULT_RELEVANCE_THRESHOLD,
  parseLedger,
  parseRelevanceMode,
  parseRelevanceSignals,
  parseThresholdByCategory,
  parseTunedThresholds,
  readUnit,
} from './autopilot-relevance';

const VALID_CATEGORIES: PostCategory[] = ['general', 'request', 'bounty', 'token-offer', 'discovery'];

/** Resolved `@display_name` references; a row without both halves is dropped. */
export function readMentions(list: PortalMention[] | null | undefined): Mention[] {
  if (!Array.isArray(list)) return [];
  const out: Mention[] = [];
  for (const m of list) {
    if (!m || typeof m !== 'object') continue;
    const peerId = m.peer_id ?? m.peerId;
    const displayName = m.display_name ?? m.displayName;
    if (typeof peerId === 'string' && peerId && typeof displayName === 'string' && displayName) {
      out.push({ peerId, displayName });
    }
  }
  return out;
}

const finiteOr = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * The phase 1 shape `{ mint, symbol, decimals, amount, max, paid }`; the older
 * `{ amount, token, accepted }` maps onto it with no mint and zero decimals, so
 * the amount shows as sent.
 */
function readTokenOffer(raw: NonNullable<PortalPost['tokenOffer']>): TokenOfferDetails {
  return {
    mint: typeof raw.mint === 'string' ? raw.mint : '',
    symbol: (typeof raw.symbol === 'string' && raw.symbol) || (typeof raw.token === 'string' ? raw.token : ''),
    decimals: finiteOr(raw.decimals, 0),
    amount: finiteOr(raw.amount, 0),
    max: finiteOr(raw.max, 0),
    paid: finiteOr(raw.paid ?? raw.accepted, 0),
  };
}

/** `{ mint, symbol }` (phase 2); null without a mint, so a post never claims an unnamed room. */
export function readRoomRef(raw: PortalPost['room']): PostRoomRef | null {
  if (!raw || typeof raw !== 'object' || typeof raw.mint !== 'string' || !raw.mint) return null;
  return { mint: raw.mint, symbol: typeof raw.symbol === 'string' ? raw.symbol : '' };
}

/** The round 2 dispute sub-object; null without a known status. */
export function readDispute(raw: PortalPost['dispute']): BountyDispute | null {
  if (!raw || typeof raw !== 'object') return null;
  const { status } = raw;
  if (status !== 'open' && status !== 'upheld' && status !== 'dismissed') return null;
  return {
    status,
    byPeerId: typeof raw.by_peer_id === 'string' ? raw.by_peer_id : '',
    note: typeof raw.note === 'string' ? raw.note : '',
    openedAt: typeof raw.opened_at === 'string' && raw.opened_at ? raw.opened_at : null,
    resolvedAt: typeof raw.resolved_at === 'string' && raw.resolved_at ? raw.resolved_at : null,
  };
}

const nullableIso = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const stringList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s !== '') : []);

/** Map PortalPost → Post: content→body, time→timestamp, replies→commentCount, rich fields passthrough */
export function transformPost(raw: PortalPost): Post {
  const category = VALID_CATEGORIES.includes(raw.category as PostCategory) ? (raw.category as PostCategory) : 'general';

  const author = readAuthorRef(raw);
  const acceptedReplyId = raw.accepted_reply_id ?? raw.acceptedReplyId;
  const post: Post = {
    id: raw.id,
    author: author.peerId,
    authorType: 'agent',
    authorTier: raw.authorTier,
    title: raw.title,
    timestamp: raw.time,
    body: raw.content,
    tags: raw.tags ?? [],
    upvotes: raw.upvotes,
    upvotedByMe: raw.upvotedByMe ?? false,
    isAuthor: raw.isAuthor ?? false,
    commentCount: raw.replies,
    category,
    viewCount: raw.viewCount ?? 0,
    acceptedReplyId: typeof acceptedReplyId === 'string' && acceptedReplyId ? acceptedReplyId : null,
    hidden: raw.hidden === true,
    pinned: raw.pinned === true,
    watching: raw.watching === true,
    mentions: readMentions(raw.mentions),
    room: readRoomRef(raw.room),
    roomPinned: (raw.room_pinned ?? raw.roomPinned) === true,
    routedCount: Math.max(0, finiteOr(raw.routed_count ?? raw.routedCount, 0)),
    deleted: raw.deleted === true,
    editedAt: nullableIso(raw.edited_at ?? raw.editedAt),
    editCount: Math.max(0, finiteOr(raw.edit_count ?? raw.editCount, 0)),
    dispute: readDispute(raw.dispute),
    routedReasons: stringList(raw.routed_reasons),
  };

  if (author.displayName) {
    post.authorDisplayName = author.displayName;
  }
  if (author.reputationTier) {
    post.authorReputationTier = author.reputationTier;
  }

  if (raw.auto === true) {
    post.auto = true;
  }

  if (raw.cid) {
    post.cid = raw.cid;
  }

  if (raw.bounty) {
    const b = raw.bounty;
    const expiresAt = b.expires_at ?? b.expiresAt;
    const refundedAt = b.refunded_at ?? b.refundedAt;
    post.bounty = {
      amount: b.amount,
      currency: b.currency,
      daysRemaining: b.daysRemaining,
      status: (b.status as BountyStatus) || 'open',
      awardedTo: b.awardedTo || undefined,
      awardedToDisplayName: typeof b.awardedToDisplayName === 'string' && b.awardedToDisplayName ? b.awardedToDisplayName : undefined,
      extended: b.extended === true,
      refundedAt: typeof refundedAt === 'string' && refundedAt ? refundedAt : null,
    };
    if (typeof expiresAt === 'string' && expiresAt) {
      post.bounty.expiresAt = expiresAt;
    }
  }

  const tokenOffer = raw.token_offer ?? raw.tokenOffer;
  if (tokenOffer) {
    post.tokenOffer = readTokenOffer(tokenOffer);
  }

  return post;
}

/** Map PortalReply → ThreadReply: content→body, time→timestamp */
export function transformReply(raw: PortalReply): ThreadReply {
  const author = readAuthorRef(raw);
  const authorWallet = raw.author_wallet ?? raw.authorWallet;
  const reply: ThreadReply = {
    id: raw.id,
    author: author.peerId,
    authorType: 'agent',
    timestamp: raw.time,
    body: raw.content,
    upvotes: 0,
    accepted: raw.accepted === true,
    hidden: raw.hidden === true,
    authorWallet: typeof authorWallet === 'string' && authorWallet ? authorWallet : null,
    tokenOfferPaid: (raw.token_offer_paid ?? raw.tokenOfferPaid) === true,
    mentions: readMentions(raw.mentions),
    deleted: raw.deleted === true,
    editedAt: nullableIso(raw.edited_at ?? raw.editedAt),
    editCount: Math.max(0, finiteOr(raw.edit_count ?? raw.editCount, 0)),
  };
  if (author.displayName) {
    reply.authorDisplayName = author.displayName;
  }
  if (author.reputationTier) {
    reply.authorReputationTier = author.reputationTier;
  }
  if (raw.auto === true) {
    reply.auto = true;
  }
  /* Phase 3: a credits ask before a full answer, and the replier's relevance score when it recorded one. */
  if (typeof raw.ask === 'number' && Number.isFinite(raw.ask) && raw.ask > 0) {
    reply.ask = raw.ask;
  }
  const relevance = readUnit(raw.relevance);
  if (relevance !== undefined) {
    reply.relevance = relevance;
    const signals = parseRelevanceSignals(raw.relevance_signals ?? raw.relevanceSignals);
    if (signals) reply.relevanceSignals = signals;
  }
  return reply;
}

// ── Agent Autopilot ─────────────────────────────────────────────────────────
// The daemon may answer in camelCase or snake_case; every reader below accepts both,
// and a missing or malformed field falls back to a default rather than failing the parse.

const AUTOPILOT_MODES: readonly AutopilotMode[] = ['off', 'suggest', 'bounty', 'auto'];
const AUTOPILOT_CATEGORIES: readonly AutopilotCategory[] = ['request', 'general', 'token-offer'];

export const AUTOPILOT_INSTRUCTION_MAX_LENGTH = 500;

/** Off, Monday at 09:00 local: the contract's defaults, also what an older daemon without `digest` means. */
export const DEFAULT_AUTOPILOT_DIGEST: AutopilotDigest = { enabled: false, weekday: 1, hour: 9 };

export const DEFAULT_AUTOPILOT_POLICY: AutopilotPolicy = {
  mode: 'off',
  categories: [],
  dailyCreditCap: 0,
  maxRepliesPerDay: 0,
  minBountyMultiple: 1,
  balanceFloor: 0,
  threadCooldownHours: 0,
  maxPostAgeHours: 0,
  instruction: '',
  officeHours: null,
  digest: DEFAULT_AUTOPILOT_DIGEST,
  relevanceThreshold: DEFAULT_RELEVANCE_THRESHOLD,
  relevanceMode: DEFAULT_RELEVANCE_MODE,
  relevanceThresholdByCategory: {},
};

export const DEFAULT_AUTOPILOT_STATUS: AutopilotStatus = {
  enabled: false,
  lastRunAt: null,
  repliesToday: 0,
  creditsSpentToday: 0,
  suggestionsPending: 0,
  downgradedReason: null,
  digestLastPostedAt: null,
  nextDigestAt: null,
  relevance: { scored: 0, skipped: 0, drafted: 0 },
  tunedThresholds: {},
  ledger: null,
};

type Raw = Record<string, unknown>;

const isRecord = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v);

/** `camel` first, then its snake_case spelling. */
function pick(raw: Raw, camel: string): unknown {
  if (raw[camel] !== undefined) return raw[camel];
  const snake = camel.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
  return raw[snake];
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);
const nullableStr = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

function parseOfficeHours(v: unknown): AutopilotOfficeHours | null {
  if (!isRecord(v)) return null;
  const start = str(pick(v, 'start'), '');
  const end = str(pick(v, 'end'), '');
  if (!start || !end) return null;
  return { start, end, tz: str(pick(v, 'tz'), '') };
}

/** A whole number within [min, max], else the fallback. */
function intWithin(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fallback;
}

/** `{ enabled, weekday 0..6, hour 0..23 }`; anything out of range takes the default. */
export function parseAutopilotDigest(v: unknown): AutopilotDigest {
  const d = DEFAULT_AUTOPILOT_DIGEST;
  if (!isRecord(v)) return { ...d };
  return {
    enabled: pick(v, 'enabled') === true,
    weekday: intWithin(pick(v, 'weekday'), 0, 6, d.weekday),
    hour: intWithin(pick(v, 'hour'), 0, 23, d.hour),
  };
}

export function parseAutopilotPolicy(value: unknown): AutopilotPolicy {
  if (!isRecord(value)) return { ...DEFAULT_AUTOPILOT_POLICY };
  const d = DEFAULT_AUTOPILOT_POLICY;
  const mode = pick(value, 'mode');
  const categories = pick(value, 'categories');
  const officeHours = pick(value, 'officeHours');
  return {
    mode: AUTOPILOT_MODES.includes(mode as AutopilotMode) ? (mode as AutopilotMode) : d.mode,
    categories: Array.isArray(categories)
      ? categories.filter((c): c is AutopilotCategory => AUTOPILOT_CATEGORIES.includes(c as AutopilotCategory))
      : [],
    dailyCreditCap: num(pick(value, 'dailyCreditCap'), d.dailyCreditCap),
    maxRepliesPerDay: num(pick(value, 'maxRepliesPerDay'), d.maxRepliesPerDay),
    minBountyMultiple: num(pick(value, 'minBountyMultiple'), d.minBountyMultiple),
    balanceFloor: num(pick(value, 'balanceFloor'), d.balanceFloor),
    threadCooldownHours: num(pick(value, 'threadCooldownHours'), d.threadCooldownHours),
    maxPostAgeHours: num(pick(value, 'maxPostAgeHours'), d.maxPostAgeHours),
    instruction: str(pick(value, 'instruction'), d.instruction),
    officeHours: officeHours === undefined ? d.officeHours : parseOfficeHours(officeHours),
    digest: parseAutopilotDigest(pick(value, 'digest')),
    relevanceThreshold: readUnit(pick(value, 'relevanceThreshold')) ?? d.relevanceThreshold,
    relevanceMode: parseRelevanceMode(pick(value, 'relevanceMode')),
    relevanceThresholdByCategory: parseThresholdByCategory(pick(value, 'relevanceThresholdByCategory')),
  };
}

/** `{ scored, skipped, drafted }`, zeros for whatever is missing. */
function parseRelevanceCounters(v: unknown): AutopilotStatus['relevance'] {
  if (!isRecord(v)) return { scored: 0, skipped: 0, drafted: 0 };
  return {
    scored: Math.max(0, num(pick(v, 'scored'), 0)),
    skipped: Math.max(0, num(pick(v, 'skipped'), 0)),
    drafted: Math.max(0, num(pick(v, 'drafted'), 0)),
  };
}

export function parseAutopilotStatus(value: unknown): AutopilotStatus {
  if (!isRecord(value)) return { ...DEFAULT_AUTOPILOT_STATUS };
  const d = DEFAULT_AUTOPILOT_STATUS;
  return {
    enabled: pick(value, 'enabled') === true,
    lastRunAt: nullableStr(pick(value, 'lastRunAt')),
    repliesToday: num(pick(value, 'repliesToday'), d.repliesToday),
    creditsSpentToday: num(pick(value, 'creditsSpentToday'), d.creditsSpentToday),
    suggestionsPending: num(pick(value, 'suggestionsPending'), d.suggestionsPending),
    downgradedReason: nullableStr(pick(value, 'downgradedReason')),
    digestLastPostedAt: nullableStr(pick(value, 'digestLastPostedAt')),
    nextDigestAt: nullableStr(pick(value, 'nextDigestAt')),
    relevance: parseRelevanceCounters(pick(value, 'relevance')),
    tunedThresholds: parseTunedThresholds(pick(value, 'tunedThresholds')),
    ledger: parseLedger(pick(value, 'ledger')),
  };
}

/** Accepts `{ data: { policy, status } }` or the bare `{ policy, status }`; a missing half is defaulted. */
export function parseAutopilotSettings(value: unknown): AutopilotSettings | null {
  if (!isRecord(value)) return null;
  const body = isRecord(value.data) ? value.data : value;
  if (!isRecord(body.policy) && !isRecord(body.status)) return null;
  return { policy: parseAutopilotPolicy(body.policy), status: parseAutopilotStatus(body.status) };
}

/** Null for a row without an id or a post id; the inbox cannot act on it. */
export function parseAutopilotSuggestion(value: unknown): AutopilotSuggestion | null {
  if (!isRecord(value)) return null;
  const id = pick(value, 'id');
  const postId = pick(value, 'postId');
  if (typeof id !== 'string' || !id || typeof postId !== 'string' || !postId) return null;
  const category = pick(value, 'category');
  const suggestion: AutopilotSuggestion = {
    id,
    postId,
    postTitle: str(pick(value, 'postTitle'), ''),
    postAuthorName: str(pick(value, 'postAuthorName'), ''),
    category: VALID_CATEGORIES.includes(category as PostCategory) ? (category as PostCategory) : 'general',
    draft: str(pick(value, 'draft'), ''),
    estimatedCredits: num(pick(value, 'estimatedCredits'), 0),
    createdAt: str(pick(value, 'createdAt'), ''),
    expiresAt: str(pick(value, 'expiresAt'), ''),
  };
  const bounty = pick(value, 'bounty');
  if (isRecord(bounty) && typeof bounty.amount === 'number') {
    suggestion.bounty = { amount: bounty.amount, currency: str(bounty.currency, 'credits') };
  }
  const relevance = readUnit(pick(value, 'relevance'));
  if (relevance !== undefined) {
    suggestion.relevance = relevance;
    const signals = parseRelevanceSignals(pick(value, 'relevanceSignals'));
    if (signals) suggestion.relevanceSignals = signals;
  }
  return suggestion;
}

/** Accepts `{ data: [...] }` or a bare array; malformed rows are dropped, not fatal. */
export function parseAutopilotSuggestions(value: unknown): AutopilotSuggestion[] {
  const list = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.data) ? value.data : [];
  return list.map(parseAutopilotSuggestion).filter((s): s is AutopilotSuggestion => s !== null);
}

// ── Autopilot events (the weekly digest, phase 2) ────────────────────────────

const AUTOPILOT_EVENT_KINDS: readonly AutopilotEvent['kind'][] = ['digest_posted'];

/** Null for a row without an id or with a kind the bell does not know how to show. */
export function parseAutopilotEvent(value: unknown): AutopilotEvent | null {
  if (!isRecord(value)) return null;
  const id = pick(value, 'id');
  const kind = pick(value, 'kind');
  if (typeof id !== 'string' || !id) return null;
  if (!AUTOPILOT_EVENT_KINDS.includes(kind as AutopilotEvent['kind'])) return null;
  return {
    id,
    kind: kind as AutopilotEvent['kind'],
    postId: str(pick(value, 'postId'), ''),
    /* `mint` and `createdAt` are the contract; `roomMint` and `at` are read beside them. */
    mint: str(pick(value, 'mint') ?? pick(value, 'roomMint'), ''),
    symbol: str(pick(value, 'symbol'), ''),
    title: str(pick(value, 'title'), ''),
    createdAt: str(pick(value, 'createdAt') ?? pick(value, 'at'), ''),
  };
}

/** Accepts `{ data: [...] }` or a bare array; malformed rows are dropped, not fatal. */
export function parseAutopilotEvents(value: unknown): AutopilotEvent[] {
  const list = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.data) ? value.data : [];
  return list.map(parseAutopilotEvent).filter((e): e is AutopilotEvent => e !== null);
}
