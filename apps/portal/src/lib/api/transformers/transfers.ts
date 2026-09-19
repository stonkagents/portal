/**
 * Purpose: Transform daemon download/upload status to frontend Transfer/TransfersResponse
 */

import type { Transfer, TransfersResponse, TransferStatsResponse } from '@/lib/types/transfer';
import type { DaemonDownload, DaemonUploadDetail, DaemonHistoryRecord } from '@/lib/types/backend';

/** Extract file extension as asset type */
function detectAssetType(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf('.'));
  return ext || 'file';
}

/** Map daemon state string to frontend transfer status */
function mapDaemonState(state: string): Transfer['status'] {
  switch (state) {
    case 'active':
    case 'downloading':
      return 'active';
    case 'completed':
    case 'complete':
      return 'completed';
    case 'queued':
      return 'queued';
    case 'failed':
    case 'error':
      return 'failed';
    default:
      return 'queued';
  }
}

/** Transform a single daemon download to frontend Transfer */
export function transformDownload(raw: DaemonDownload): Transfer {
  return {
    id: raw.cid,
    assetName: raw.filename,
    assetType: detectAssetType(raw.filename),
    direction: 'download',
    peerName: '',
    peerId: '',
    size: raw.total_size,
    progress: Math.round(raw.progress * 100),
    speed: raw.speed_bps / 1_048_576,
    eta: raw.eta_seconds,
    status: mapDaemonState(raw.state),
    startedAt: '',
    completedAt: raw.completed_at,
    errorMessage: raw.error_message,
    peerCount: raw.connected_peers ?? 0,
  };
}

/** History row from GET /downloads/status `recent` — terminal transfers not in visible downloads */
function transformHistoryRecent(raw: DaemonHistoryRecord): Transfer {
  const completed = raw.state === 'completed';
  return {
    id: raw.cid,
    assetName: raw.filename,
    assetType: raw.file_type || detectAssetType(raw.filename),
    direction: raw.direction,
    peerName: '',
    peerId: raw.peer_id ?? '',
    size: raw.total_size,
    progress: completed ? 100 : 0,
    speed: 0,
    eta: 0,
    status: completed ? 'completed' : 'failed',
    startedAt: raw.started_at,
    completedAt: raw.completed_at,
    errorMessage: raw.error_message ?? null,
    peerCount: 0,
  };
}

/** Keep latest history row per CID (by completed_at) when duplicates exist */
export function dedupeHistoryByLatestCid(records: DaemonHistoryRecord[]): DaemonHistoryRecord[] {
  const byCid = new Map<string, DaemonHistoryRecord>();
  for (const r of records) {
    const prev = byCid.get(r.cid);
    if (!prev) {
      byCid.set(r.cid, r);
      continue;
    }
    const prevT = new Date(prev.completed_at ?? 0).getTime();
    const nextT = new Date(r.completed_at ?? 0).getTime();
    if (nextT >= prevT) byCid.set(r.cid, r);
  }
  return [...byCid.values()];
}

/** Transform a single daemon upload detail to frontend Transfer */
function transformUpload(raw: DaemonUploadDetail): Transfer {
  return {
    id: raw.file_cid,
    assetName: raw.filename,
    assetType: detectAssetType(raw.filename),
    direction: 'upload',
    peerName: '',
    peerId: '',
    size: raw.bytes_sent,
    progress: raw.active ? 100 : 0,
    speed: 0,
    eta: 0,
    status: raw.active ? 'active' : 'queued',
    startedAt: '',
    completedAt: null,
    errorMessage: null,
    peerCount: 0,
  };
}

/** Format bytes to compact human-readable string */
export function formatBytesShort(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/** Daemon transfer stats snapshot (from stats repository) */
export interface DaemonTransferStats {
  total_upload: number;
  total_download: number;
  upload_speed_bps: number;
  download_speed_bps: number;
}

/** Merge daemon downloads + uploads + recent history into a single TransfersResponse */
export function mergeTransfers(
  downloads: DaemonDownload[],
  uploadsResponse: { uploads?: (DaemonUploadDetail | unknown)[]; active?: number } | null,
  daemonStats?: DaemonTransferStats | null,
  recentHistory?: DaemonHistoryRecord[] | null,
  /** When set (from GET /library), sidebar "My Library" shows shared file count; else falls back to completed-terminal count */
  libraryFileCount?: number | null,
): TransfersResponse {
  const dlTransfers: Transfer[] = downloads.map(transformDownload);
  const ulTransfers: Transfer[] = (uploadsResponse?.uploads ?? [])
    .filter((u): u is DaemonUploadDetail => u != null && typeof u === 'object' && 'file_cid' in u)
    .map(transformUpload);

  const liveTransfers = [...dlTransfers, ...ulTransfers];
  const liveIds = new Set(liveTransfers.map(t => t.id));

  const recentRaw = recentHistory ?? [];
  const recentDeduped = dedupeHistoryByLatestCid(
    recentRaw.filter((r): r is DaemonHistoryRecord => r != null && typeof r === 'object' && 'cid' in r),
  );
  const historyTransfers: Transfer[] = recentDeduped.map(transformHistoryRecent).filter(t => !liveIds.has(t.id));

  const transfers = [...liveTransfers, ...historyTransfers];

  const active = transfers.filter(t => t.status === 'active').length;
  const completed = transfers.filter(t => t.status === 'completed').length;
  const failed = transfers.filter(t => t.status === 'failed').length;
  const uploading = ulTransfers.filter(t => t.status === 'active').length;
  const downloading = transfers.filter(t => t.direction === 'download' && t.status === 'active').length;

  // Align with Transfers page "Seeding" tab: active transfers at 100% progress (typically active uploads seeding)
  const seeding = transfers.filter(t => t.status === 'active' && t.progress >= 100).length;

  const totalDownBytes = transfers
    .filter(t => t.direction === 'download' && t.status === 'completed')
    .reduce((sum, t) => sum + t.size, 0);
  const totalUpBytes = daemonStats ? daemonStats.total_upload : 0;
  const shareRatio = totalDownBytes > 0 ? totalUpBytes / totalDownBytes : 0;

  const completedTerminal = transfers.filter(t => t.status === 'completed').length;
  const library = libraryFileCount != null && libraryFileCount >= 0 ? libraryFileCount : completedTerminal;

  const stats: TransferStatsResponse = {
    active,
    uploading,
    downloading,
    completed,
    failed,
    seeding,
    library,
    totalUp: daemonStats ? formatBytesShort(daemonStats.total_upload) : '0 B',
    totalDown: daemonStats ? formatBytesShort(daemonStats.total_download) : '0 B',
    totalUpBytes,
    totalDownBytes,
    shareRatio,
    speedUp: daemonStats ? daemonStats.upload_speed_bps / 1_048_576 : 0,
    speedDown: daemonStats
      ? daemonStats.download_speed_bps / 1_048_576
      : transfers.reduce((sum, t) => sum + (t.status === 'active' ? t.speed : 0), 0),
  };

  return { transfers, stats };
}
