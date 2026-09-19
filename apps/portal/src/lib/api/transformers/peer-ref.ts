/**
 * Purpose: Read a peer reference (peer id + optional display name) from the
 *          tracker's several spellings. The display name ships beside every
 *          public peer id; agents that predate names leave it absent, and a
 *          nested `{ peer_id, display_name }` object is accepted where the
 *          DTO nests it.
 */

import type { PortalPeerRef } from '@/lib/types/backend';
import type { ReputationTier } from '@/lib/types/community';

export interface PeerRef {
  peerId: string;
  /** Undefined when the owner has not set a name (or the field is absent). */
  displayName?: string;
  /** Undefined when the tracker predates board reputation or sends a tier we do not know. */
  reputationTier?: ReputationTier;
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

const REPUTATION_TIERS: readonly ReputationTier[] = ['new', 'active', 'trusted', 'top'];

/** The tracker's tier word, lower-cased, when it is one we know; undefined otherwise. */
export function readReputationTier(value: unknown): ReputationTier | undefined {
  const tier = nonEmpty(value)?.toLowerCase();
  return REPUTATION_TIERS.includes(tier as ReputationTier) ? (tier as ReputationTier) : undefined;
}

/**
 * `author` may be the peer id string or a nested reference; the flat
 * `authorDisplayName` / `author_display_name` fields win when present. The
 * reputation tier rides beside the display name in the same spellings.
 */
export function readAuthorRef(raw: {
  author: string | PortalPeerRef | null | undefined;
  authorDisplayName?: string;
  author_display_name?: string;
  reputation_tier?: string;
  reputationTier?: string;
  author_reputation_tier?: string;
  authorReputationTier?: string;
}): PeerRef {
  const flatName = nonEmpty(raw.authorDisplayName) ?? nonEmpty(raw.author_display_name);
  const flatTier =
    readReputationTier(raw.author_reputation_tier) ??
    readReputationTier(raw.authorReputationTier) ??
    readReputationTier(raw.reputation_tier) ??
    readReputationTier(raw.reputationTier);
  if (typeof raw.author === 'string' || raw.author == null) {
    return { peerId: raw.author ?? '', displayName: flatName, reputationTier: flatTier };
  }
  const nested = raw.author;
  return {
    peerId: nonEmpty(nested.peerId) ?? nonEmpty(nested.peer_id) ?? '',
    displayName: flatName ?? nonEmpty(nested.displayName) ?? nonEmpty(nested.display_name),
    reputationTier: flatTier ?? readReputationTier(nested.reputation_tier) ?? readReputationTier(nested.reputationTier),
  };
}

/** The display name from any of its spellings on a flat record, or undefined. */
export function readDisplayName(raw: {
  display_name?: string | null;
  displayName?: string | null;
  peer_display_name?: string | null;
  peerDisplayName?: string | null;
}): string | undefined {
  return (
    nonEmpty(raw.displayName) ?? nonEmpty(raw.display_name) ?? nonEmpty(raw.peerDisplayName) ?? nonEmpty(raw.peer_display_name)
  );
}

/** The tracker's own masking of a peer id (geo.MaskPeerID), used to tell a name from a masked id. */
export function trackerMaskedPeerId(peerId: string): string {
  if (peerId.length <= 12) return peerId;
  if (peerId.length <= 13) return `${peerId.slice(0, 6)}...${peerId.slice(7)}`;
  return `${peerId.slice(0, 6)}...${peerId.slice(-6)}`;
}

/**
 * The owner-chosen name of a portal peer, or undefined. The list's `name` is
 * already "display name, else masked id"; an explicit display-name field wins
 * when the tracker sends one, otherwise a `name` that is not the masked id is
 * the display name.
 */
export function portalPeerDisplayName(peer: {
  name: string;
  peerId: string;
  displayName?: string | null;
  display_name?: string | null;
}): string | undefined {
  const explicit = readDisplayName(peer);
  if (explicit) return explicit;
  if (peer.displayName === '' || peer.display_name === '') return undefined;
  const name = nonEmpty(peer.name);
  if (!name || name === peer.peerId || name === trackerMaskedPeerId(peer.peerId)) return undefined;
  return name;
}
