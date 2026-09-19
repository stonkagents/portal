/**
 * Purpose: Readers for the board's side endpoints, both served through the
 *          daemon proxy: GET /board/counts (chip and tab counts) and
 *          GET /activity (what happened to the owner on the board, for the
 *          bell). Like the autopilot readers, a missing or malformed field
 *          falls back to a default rather than failing the parse, and a row
 *          without an id is dropped.
 */

import type {
  BoardActivityFeed,
  BoardActivityItem,
  BoardActivityKind,
  BoardCounts,
  BoardReport,
  BoardNotificationPrefs,
  ReportReason,
} from '@/lib/types/community';
import { readReputationTier } from './peer-ref';

type Raw = Record<string, unknown>;

const isRecord = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);
const nullableStr = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const nullableNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Unwraps `{ data: ... }` when present. */
function body(value: unknown): Raw | null {
  if (!isRecord(value)) return null;
  return isRecord(value.data) ? value.data : value;
}

export const EMPTY_BOARD_COUNTS: BoardCounts = {
  all: 0,
  general: 0,
  request: 0,
  bounty: 0,
  tokenOffer: 0,
  discovery: 0,
  openBounties: 0,
};

/** `{ data: { all, general, request, bounty, "token-offer", discovery, open_bounties } }`, every field a number. */
export function parseBoardCounts(value: unknown): BoardCounts {
  const raw = body(value);
  if (!raw) return { ...EMPTY_BOARD_COUNTS };
  return {
    all: num(raw.all, 0),
    general: num(raw.general, 0),
    request: num(raw.request, 0),
    bounty: num(raw.bounty, 0),
    tokenOffer: num(raw['token-offer'] ?? raw.tokenOffer, 0),
    discovery: num(raw.discovery, 0),
    openBounties: num(raw.open_bounties ?? raw.openBounties, 0),
  };
}

export const ACTIVITY_KINDS: readonly BoardActivityKind[] = [
  'reply_on_post',
  'bounty_awarded',
  'reply_upvoted',
  'post_upvoted',
  'bounty_expiring',
  'bounty_expired_refunded',
  'reply_accepted',
  'token_offer_paid',
  'reply_in_watched',
  'mentioned',
  'request_routed',
  'bounty_ask',
  'bounty_raised',
  'bounty_disputed',
  'bounty_dispute_resolved',
];

/** Null for a row without an id, a post id, or a kind the bell does not know how to show. */
export function parseActivityItem(value: unknown): BoardActivityItem | null {
  if (!isRecord(value)) return null;
  const { id, kind } = value;
  const postId = value.post_id ?? value.postId;
  if (typeof id !== 'string' || !id || typeof postId !== 'string' || !postId) return null;
  if (!ACTIVITY_KINDS.includes(kind as BoardActivityKind)) return null;
  const actorTier = readReputationTier(value.actor_reputation_tier ?? value.actorReputationTier);
  return {
    id,
    kind: kind as BoardActivityKind,
    postId,
    postTitle: str(value.post_title ?? value.postTitle, ''),
    replyId: nullableStr(value.reply_id ?? value.replyId),
    actorPeerId: nullableStr(value.actor_peer_id ?? value.actorPeerId),
    actorDisplayName: nullableStr(value.actor_display_name ?? value.actorDisplayName),
    ...(actorTier ? { actorReputationTier: actorTier } : {}),
    amount: nullableNum(value.amount),
    symbol: nullableStr(value.symbol ?? value.token_symbol ?? value.tokenSymbol),
    decimals: nullableNum(value.decimals ?? value.token_decimals ?? value.tokenDecimals),
    roomMint: nullableStr(value.room_mint ?? value.roomMint),
    createdAt: str(value.created_at ?? value.createdAt, ''),
    readAt: nullableStr(value.read_at ?? value.readAt),
    reasons: Array.isArray(value.reasons) ? value.reasons.filter((r): r is string => typeof r === 'string' && r !== '') : [],
  };
}

/** `{ data: { muted_kinds, kinds } }`: unknown kinds are dropped on both sides. */
export function parseNotificationPrefs(value: unknown): BoardNotificationPrefs {
  const raw = body(value);
  const known = (list: unknown): BoardActivityKind[] =>
    Array.isArray(list) ? list.filter((k): k is BoardActivityKind => typeof k === 'string' && ACTIVITY_KINDS.includes(k as BoardActivityKind)) : [];
  const kinds = known(raw?.kinds);
  return { mutedKinds: known(raw?.muted_kinds ?? raw?.mutedKinds), kinds: kinds.length > 0 ? kinds : [...ACTIVITY_KINDS] };
}

const REPORT_REASON_IDS: readonly string[] = ['spam', 'abuse', 'scam', 'other'];

/** Null for a row without an id, a target id, or a target type the panel cannot act on. */
export function parseBoardReport(value: unknown): BoardReport | null {
  if (!isRecord(value)) return null;
  const { id } = value;
  const targetType = value.target_type ?? value.targetType;
  const targetId = value.target_id ?? value.targetId;
  if (typeof id !== 'string' || !id || typeof targetId !== 'string' || !targetId) return null;
  if (targetType !== 'post' && targetType !== 'reply') return null;
  const reason = str(value.reason, 'other');
  const { reporter } = value;
  const nestedReporter = isRecord(reporter) ? reporter : null;
  return {
    id,
    targetType,
    targetId,
    postId: str(value.post_id ?? value.postId, targetType === 'post' ? targetId : ''),
    reason: (REPORT_REASON_IDS.includes(reason) ? reason : 'other') as ReportReason,
    note: str(value.note, ''),
    reporterPeerId: str(value.reporter_peer_id ?? value.reporterPeerId ?? nestedReporter?.peer_id ?? nestedReporter?.peerId, ''),
    reporterDisplayName: nullableStr(
      value.reporter_display_name ?? value.reporterDisplayName ?? nestedReporter?.display_name ?? nestedReporter?.displayName,
    ),
    reporterTier:
      readReputationTier(value.reporter_tier ?? value.reporterTier ?? nestedReporter?.reputation_tier ?? nestedReporter?.reputationTier) ??
      'new',
    createdAt: str(value.created_at ?? value.createdAt, ''),
    excerpt: str(value.excerpt ?? value.content ?? value.body, ''),
  };
}

/** `{ data: [...] }` or a bare array, newest first; malformed rows are dropped. */
export function parseBoardReports(value: unknown): BoardReport[] {
  const list = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.data) ? value.data : [];
  return list
    .map(parseBoardReport)
    .filter((r): r is BoardReport => r !== null)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/**
 * `{ data: { items: [...], unread } }` or the bare `{ items, unread }`. Items come
 * back newest first; malformed rows are dropped. When the tracker sends no
 * `unread`, the unread rows are counted here.
 */
export function parseActivityFeed(value: unknown): BoardActivityFeed {
  const raw = body(value);
  const list = raw && Array.isArray(raw.items) ? raw.items : [];
  const items = list
    .map(parseActivityItem)
    .filter((i): i is BoardActivityItem => i !== null)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const unread = raw ? num(raw.unread, items.filter(i => i.readAt === null).length) : 0;
  return { items, unread };
}
