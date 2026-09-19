export interface Transfer {
  id: string;
  assetName: string;
  assetType: string;
  direction: 'upload' | 'download';
  peerName: string;
  peerId: string;
  size: number;
  progress: number;
  speed: number;
  eta: number;
  status: 'active' | 'completed' | 'queued' | 'failed';
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  peerCount: number;
}

/** API response shape for GET /api/transfers/stats */
export interface TransferStatsResponse {
  active: number;
  uploading: number;
  downloading: number;
  completed: number;
  failed: number;
  seeding: number;
  library: number;
  totalUp: string;
  totalDown: string;
  totalUpBytes: number;
  totalDownBytes: number;
  shareRatio: number;
  speedUp: number;
  speedDown: number;
}

/** API response shape for GET /api/transfers */
export interface TransfersResponse {
  stats: TransferStatsResponse;
  transfers: Transfer[];
}
