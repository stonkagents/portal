/**
 * Purpose: Transform tracker portal /api/gallery/search response to frontend GalleryResponse
 */

import type { PortalGalleryResponse, PortalPack } from '@/lib/types/backend';

/** Frontend gallery response shape (defined inline in use-gallery.ts) */
export interface GalleryResponse {
  results: {
    cid: string;
    name: string;
    type: string;
    size: string;
    seeds: number;
    downloads: number;
    author: string;
    rep: number;
    verified: boolean;
  }[];
  stats: {
    uploadSpeed: number;
    downloadSpeed: number;
    activePeers: number;
    totalShared: string;
  };
  packs: {
    name: string;
    description: string;
    count: number;
    icon: string;
    color: string;
  }[];
  activity: {
    msg: string;
    time: string;
    color: string;
  }[];
}

/** Format bytes to human-readable string */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0 || !Number.isFinite(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(1)} ${units[i]}`;
}

/** Transform portal gallery response — builds results from items, defaults for stats/packs/activity */
export function transformGalleryResponse(raw: PortalGalleryResponse): GalleryResponse {
  return {
    results: raw.items.map(item => ({
      cid: item.cid,
      name: item.name,
      type: item.type,
      size: formatBytes(item.size),
      seeds: item.peers,
      downloads: item.download_count ?? 0,
      author: item.author_peer_id ?? '',
      rep: item.peer_rep ?? 0,
      verified: false,
    })),
    stats: {
      uploadSpeed: 0,
      downloadSpeed: 0,
      activePeers: 0,
      totalShared: formatBytes(raw.total_size_bytes ?? 0),
    },
    packs: [],
    activity: [],
  };
}

/** One entry of a curated pack (GET /api/packs items[]). */
export interface TransformedPackItem {
  /** The install id the daemon takes and returns. Empty on a catalog that predates the install path. */
  id: string;
  filename: string;
  type: string;
  title: string;
  description: string;
  version: string;
  /** The pinned content address. Empty means the catalog carries no bundle for it yet. */
  cid: string;
  /** The bundle's size in bytes; 0 when the catalog does not say. */
  size: number;
  /** The catalog's own sentence naming what installing it writes. */
  touches: string;
  /** The pack this item is listed under, so a lone item can still say where it comes from. */
  packId: string;
  packTitle: string;
}

/**
 * Frontend pack shape matching CuratedPacks component. The catalog is a static list on the
 * tracker: it carries no install counts or byte sizes, so none are invented here.
 */
export interface TransformedPack {
  id: string;
  icon: string;
  color: 'green' | 'blue' | 'purple' | 'red';
  title: string;
  description: string;
  assets: number;
  items: TransformedPackItem[];
}

const PACK_COLORS: TransformedPack['color'][] = ['green', 'blue', 'purple', 'red'];

/** Transform backend packs to frontend CuratedPacks shape */
export function transformPacks(raw: PortalPack[]): TransformedPack[] {
  return raw.map((pack, i) => ({
    id: pack.id,
    icon: pack.icon,
    color: PACK_COLORS[i % PACK_COLORS.length],
    title: pack.name,
    description: pack.description,
    assets: pack.item_count,
    items: pack.items.map(item => ({
      /* An item with no id cannot be installed; the card says so rather than sending a request that cannot work. */
      id: item.id ?? '',
      filename: item.filename,
      type: item.type,
      title: item.title,
      description: item.description,
      version: item.version ?? '',
      cid: item.cid ?? '',
      size: item.size ?? 0,
      touches: item.touches ?? '',
      packId: pack.id,
      packTitle: pack.name,
    })),
  }));
}
