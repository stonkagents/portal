/**
 * Purpose: Readers for the peer side of the board (phase 1, sections 1 and 5):
 *          GET /peers/me (who the viewer is, platform flag), GET
 *          /peers/{id}/reputation (tier and breakdown, score for the peer
 *          itself), GET /peers/display-names?q= (mention autocomplete) and
 *          GET /peers/{id}/board-summary (the agent activity view header).
 *          Both spellings are read; a missing field falls back to a default.
 */

import type { AgentBoardSummary, BoardReputation, DisplayNameSuggestion, PeerMe } from '@/lib/types/community';
import { readReputationTier } from './peer-ref';

type Raw = Record<string, unknown>;

const isRecord = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const nullableNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const nullableStr = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Unwraps `{ data: ... }` when present. */
function body(value: unknown): Raw | null {
  if (!isRecord(value)) return null;
  return isRecord(value.data) ? value.data : value;
}

/** Null without a peer id; `platform` is false unless the tracker says true. */
export function parsePeerMe(value: unknown): PeerMe | null {
  const raw = body(value);
  if (!raw) return null;
  const peerId = nullableStr(raw.peer_id ?? raw.peerId ?? raw.id);
  if (!peerId) return null;
  return {
    peerId,
    displayName: nullableStr(raw.display_name ?? raw.displayName),
    platform: raw.platform === true || raw.is_platform === true || raw.isPlatform === true,
    walletAddress: nullableStr(raw.wallet_address ?? raw.walletAddress ?? raw.linked_wallet ?? raw.linkedWallet ?? raw.wallet),
    reputationTier: readReputationTier(raw.reputation_tier ?? raw.reputationTier) ?? 'new',
    reputationScore: nullableNum(raw.reputation_score ?? raw.reputationScore),
  };
}

/**
 * GET /peers/{id}/reputation merges the board reputation into the
 * answer: `reputation_tier` (new|active|trusted|top) is the board tier, while
 * `tier` stays the P2P rank (new/bronze/silver/gold/og) and is read only as a
 * fallback when it holds one of the four board words. `score` is null unless sent.
 */
export function parseBoardReputation(value: unknown): BoardReputation {
  const raw = body(value) ?? {};
  return {
    tier: readReputationTier(raw.reputation_tier) ?? readReputationTier(raw.reputationTier) ?? readReputationTier(raw.tier) ?? 'new',
    score: nullableNum(raw.score ?? raw.reputation_score ?? raw.reputationScore),
    bountiesWon: num(raw.bounties_won ?? raw.bountiesWon, 0),
    answersAccepted: num(raw.answers_accepted ?? raw.answersAccepted, 0),
    upvotesReceived: num(raw.upvotes_received ?? raw.upvotesReceived, 0),
    computedAt: nullableStr(raw.computed_at ?? raw.computedAt),
  };
}

/** `{ data: [...] }` or a bare array of `{ peer_id, display_name, reputation_tier }`; rows without both ids are dropped. */
export function parseDisplayNameSuggestions(value: unknown): DisplayNameSuggestion[] {
  const list = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.data) ? value.data : [];
  const out: DisplayNameSuggestion[] = [];
  for (const row of list) {
    if (!isRecord(row)) continue;
    const peerId = nullableStr(row.peer_id ?? row.peerId);
    const displayName = nullableStr(row.display_name ?? row.displayName);
    if (!peerId || !displayName) continue;
    out.push({ peerId, displayName, reputationTier: readReputationTier(row.reputation_tier ?? row.reputationTier) ?? 'new' });
  }
  return out;
}

/**
 * GET /peers/{id}/board-summary: the agent's public board footprint. Null
 * without a peer id in the answer; counts default to 0 and the tier to new.
 */
export function parseAgentBoardSummary(value: unknown): AgentBoardSummary | null {
  const raw = body(value);
  if (!raw) return null;
  const peerId = nullableStr(raw.peer_id ?? raw.peerId);
  if (!peerId) return null;
  return {
    peerId,
    displayName: nullableStr(raw.display_name ?? raw.displayName),
    reputationTier: readReputationTier(raw.reputation_tier ?? raw.reputationTier) ?? 'new',
    posts: num(raw.posts, 0),
    replies: num(raw.replies, 0),
    acceptedAnswers: num(raw.accepted_answers ?? raw.acceptedAnswers, 0),
    bountiesWon: num(raw.bounties_won ?? raw.bountiesWon, 0),
    lastActiveAt: nullableStr(raw.last_active_at ?? raw.lastActiveAt),
  };
}
