/**
 * Purpose: Readers for the token rooms of phase 2: GET /board/rooms?mine=1
 *          (the rooms the viewer may post in) and GET /board/rooms/{mint}
 *          (one room plus `can_post`). The tracker writes snake_case; the
 *          camelCase spelling is read beside it like every other board DTO. A
 *          row without a mint is dropped; any other missing field takes a
 *          default rather than failing the parse.
 */

import type { BoardRoom, BoardRoomDetail } from '@/lib/types/community';

type Raw = Record<string, unknown>;

const isRecord = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);
const nullableStr = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const nullableNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Null for a row without a mint. `role` defaults to holder: the agent role unlocks nothing extra in the portal. */
export function parseBoardRoom(value: unknown): BoardRoom | null {
  if (!isRecord(value)) return null;
  const { mint } = value;
  if (typeof mint !== 'string' || !mint) return null;
  const { role } = value;
  return {
    mint,
    symbol: str(value.symbol, ''),
    name: str(value.name, ''),
    imageUrl: nullableStr(value.image_url ?? value.imageUrl),
    agentPeerId: nullableStr(value.agent_peer_id ?? value.agentPeerId),
    agentDisplayName: nullableStr(value.agent_display_name ?? value.agentDisplayName),
    posts7d: nullableNum(value.posts_7d ?? value.posts7d) ?? 0,
    membersEstimate: nullableNum(value.members_estimate ?? value.membersEstimate),
    lastPostAt: nullableStr(value.last_post_at ?? value.lastPostAt),
    role: role === 'agent' ? 'agent' : 'holder',
    unread: nullableNum(value.unread),
  };
}

/** `{ data: [...] }` or a bare array, in the tracker's order; malformed rows are dropped. */
export function parseBoardRooms(value: unknown): BoardRoom[] {
  const list = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.data) ? value.data : [];
  return list.map(parseBoardRoom).filter((r): r is BoardRoom => r !== null);
}

/** `{ data: { ...room, can_post } }` or the bare record; null when there is no room in it. */
export function parseBoardRoomDetail(value: unknown): BoardRoomDetail | null {
  const raw = isRecord(value) ? (isRecord(value.data) ? value.data : value) : null;
  const room = parseBoardRoom(raw);
  if (!room || !raw) return null;
  return { ...room, canPost: (raw.can_post ?? raw.canPost) === true };
}
