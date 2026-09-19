/**
 * Purpose: TDD tests for transfer transformer — stats integration, upload merging, gallery fields
 */
import { describe, it, expect } from 'vitest';
import { mergeTransfers, formatBytesShort, transformDownload, dedupeHistoryByLatestCid } from '../transfers';
import type { DaemonDownload, DaemonUploadDetail, DaemonHistoryRecord } from '@/lib/types/backend';

const sampleDownload: DaemonDownload = {
  cid: 'QmTestCid123',
  filename: 'test.claw-skill',
  state: 'active',
  total_size: 1024000,
  total_chunks: 10,
  completed_chunks: 5,
  downloaded_bytes: 512000,
  speed_bps: 100000,
  progress: 0.5,
  eta_seconds: 60,
  completed_at: null,
  error_message: null,
};

describe('formatBytesShort', () => {
  it('formats 0', () => expect(formatBytesShort(0)).toBe('0 B'));
  it('formats KB', () => expect(formatBytesShort(1536)).toBe('1.5 KB'));
  it('formats MB', () => expect(formatBytesShort(5_242_880)).toBe('5.0 MB'));
  it('formats GB', () => expect(formatBytesShort(2_147_483_648)).toBe('2.0 GB'));
});

describe('mergeTransfers stats integration', () => {
  it('uses daemon stats for totalUp, totalDown, speedUp, speedDown when provided', () => {
    const daemonStats = {
      total_upload: 5_000_000,
      total_download: 10_000_000,
      upload_speed_bps: 500_000,
      download_speed_bps: 1_200_000,
    };
    const result = mergeTransfers([sampleDownload], null, daemonStats);
    expect(result.stats.totalUp).toBe('4.8 MB');
    expect(result.stats.totalDown).toBe('9.5 MB');
    expect(result.stats.speedUp).toBeCloseTo(0.48, 1);
    expect(result.stats.speedDown).toBeCloseTo(1.14, 1);
  });

  it('falls back to zero when no daemon stats provided', () => {
    const result = mergeTransfers([sampleDownload], null);
    expect(result.stats.totalUp).toBe('0 B');
    expect(result.stats.totalDown).toBe('0 B');
    expect(result.stats.speedUp).toBe(0);
  });
});

const sampleUpload: DaemonUploadDetail = {
  file_cid: 'QmUploadCid456',
  filename: 'shared-model.claw-memory',
  bytes_sent: 2_097_152,
  requests_served: 5,
  active: true,
};

describe('mergeTransfers with uploads', () => {
  it('includes uploads in the transfer list as direction=upload', () => {
    const result = mergeTransfers([sampleDownload], { uploads: [sampleUpload], active: 1 });
    expect(result.transfers).toHaveLength(2);
    const upload = result.transfers.find(t => t.direction === 'upload');
    expect(upload).toBeDefined();
    expect(upload!.id).toBe('QmUploadCid456');
    expect(upload!.assetName).toBe('shared-model.claw-memory');
    expect(upload!.direction).toBe('upload');
    expect(upload!.status).toBe('active');
  });

  it('sets upload progress to 100 when active (seeding)', () => {
    const result = mergeTransfers([], { uploads: [sampleUpload], active: 1 });
    const upload = result.transfers[0];
    expect(upload.progress).toBe(100);
  });

  it('counts uploads in stats.uploading from real data', () => {
    const inactive: DaemonUploadDetail = { ...sampleUpload, file_cid: 'Qm2', active: false };
    const result = mergeTransfers([], { uploads: [sampleUpload, inactive], active: 1 });
    expect(result.stats.uploading).toBe(1);
  });
});

/** gallery sidebar fields */
function makeDl(overrides: Partial<DaemonDownload> = {}): DaemonDownload {
  return {
    cid: 'cid-1',
    filename: 'model.vec',
    total_size: 1024,
    downloaded_bytes: 1024,
    progress: 1,
    speed_bps: 0,
    eta_seconds: 0,
    state: 'completed',
    total_chunks: 1,
    completed_chunks: 1,
    completed_at: null,
    error_message: null,
    ...overrides,
  };
}

const historyDl = (overrides: Partial<DaemonHistoryRecord> = {}): DaemonHistoryRecord => ({
  id: 1,
  cid: 'QmHist1',
  filename: 'past.claw-skill',
  file_type: '.claw-skill',
  direction: 'download',
  total_size: 2048,
  state: 'completed',
  started_at: '2026-01-01T00:00:00Z',
  completed_at: '2026-01-01T00:05:00Z',
  ...overrides,
});

describe('mergeTransfers with recent history', () => {
  it('appends recent completed downloads not in live list', () => {
    const result = mergeTransfers([sampleDownload], null, null, [historyDl()]);
    expect(result.transfers.some(t => t.id === 'QmHist1' && t.status === 'completed')).toBe(true);
    expect(result.transfers.some(t => t.id === 'QmTestCid123')).toBe(true);
  });

  it('skips recent row when same cid exists in live downloads', () => {
    const hist: DaemonHistoryRecord = historyDl({ cid: 'QmTestCid123' });
    const result = mergeTransfers([sampleDownload], null, null, [hist]);
    const qm = result.transfers.filter(t => t.id === 'QmTestCid123');
    expect(qm).toHaveLength(1);
    expect(qm[0].status).toBe('active');
  });

  it('dedupes multiple history rows for same cid keeping latest completed_at', () => {
    const rows: DaemonHistoryRecord[] = [
      historyDl({ id: 1, cid: 'QmX', completed_at: '2026-01-01T00:00:00Z' }),
      historyDl({ id: 2, cid: 'QmX', completed_at: '2026-02-01T00:00:00Z' }),
    ];
    expect(dedupeHistoryByLatestCid(rows)).toHaveLength(1);
    expect(dedupeHistoryByLatestCid(rows)[0].id).toBe(2);
  });

  it('uses libraryFileCount for stats.library when provided', () => {
    const result = mergeTransfers([], null, null, [], 12);
    expect(result.stats.library).toBe(12);
  });
});

describe('mergeTransfers gallery fields', () => {
  it('returns seeding count from active uploads at 100% progress', () => {
    const result = mergeTransfers([], { uploads: [sampleUpload], active: 1 });
    expect(result.stats.seeding).toBe(1);
  });

  it('returns library count from completed downloads', () => {
    const downloads = [
      makeDl({ cid: 'a', state: 'completed' }),
      makeDl({ cid: 'b', state: 'completed' }),
      makeDl({ cid: 'c', state: 'active', progress: 0.5 }),
    ];
    const result = mergeTransfers(downloads, null);
    expect(result.stats.library).toBe(2);
  });

  it('calculates shareRatio from daemonStats totalUpBytes / completed download sizes', () => {
    const downloads = [
      makeDl({ cid: 'a', total_size: 1000, state: 'completed' }),
      makeDl({ cid: 'b', total_size: 500, state: 'completed' }),
    ];
    const daemonStats = {
      total_upload: 750,
      total_download: 0,
      upload_speed_bps: 0,
      download_speed_bps: 0,
    };
    const result = mergeTransfers(downloads, null, daemonStats);
    expect(result.stats.totalDownBytes).toBe(1500);
    expect(result.stats.totalUpBytes).toBe(750);
    expect(result.stats.shareRatio).toBe(0.5);
  });

  it('returns shareRatio 0 when no downloads exist', () => {
    const result = mergeTransfers([], null);
    expect(result.stats.shareRatio).toBe(0);
    expect(result.stats.totalDownBytes).toBe(0);
  });

  it('still returns completed and failed counts for backward compat', () => {
    const downloads = [makeDl({ cid: 'a', state: 'completed' }), makeDl({ cid: 'b', state: 'failed' })];
    const result = mergeTransfers(downloads, null);
    expect(result.stats.completed).toBe(1);
    expect(result.stats.failed).toBe(1);
  });
});

describe('transformDownload peer count', () => {
  it('maps connected_peers to peerCount on Transfer', () => {
    const dl: DaemonDownload = {
      ...sampleDownload,
      connected_peers: 5,
    };
    const transfer = transformDownload(dl);
    expect(transfer.peerCount).toBe(5);
  });

  it('defaults peerCount to 0 when connected_peers is missing', () => {
    const transfer = transformDownload(sampleDownload);
    expect(transfer.peerCount).toBe(0);
  });
});
