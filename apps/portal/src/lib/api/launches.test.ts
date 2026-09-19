import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ConfigModule from '@/config';

vi.mock('@/config', async () => {
  const actual = await vi.importActual<typeof ConfigModule>('@/config');
  return { ...actual, trackerEndpoint: (path: string) => `https://tracker.example${path}` };
});

import {
  LaunchApiError,
  fetchLaunchesByWallet,
  getLaunch,
  getPendingLaunches,
  launchKeys,
  listLaunches,
  recordLaunch,
  toLaunch,
  uploadMetadata,
  type LaunchRecord,
  type RecordLaunchPayload,
  type UploadMetadataPayload,
} from './launches';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** A launch as `GET /api/launch/{mint}` returns it: stored row plus camelCase and enrichment. */
const record: LaunchRecord = {
  mint: 'MintAAA',
  pool_id: 'PoolAAA',
  creator_wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  quote_mint: '6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx',
  name: 'Signal Hound',
  symbol: 'HOUND',
  image_url: 'https://gateway.example/ipfs/img',
  metadata_uri: 'https://gateway.example/ipfs/meta',
  launch_signature: 'sig123',
  fee_lamports: 4901732,
  transfer_fee_bps: 100,
  platform_id: '6SfbLVtLKUWjEBZgXXPwKDwDbnyJYw4dp2aMvxF34qvj',
  status: 'confirmed',
  created_at: '2026-09-12T12:00:00Z',
  poolId: 'PoolAAA',
  creatorWallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  quoteMint: '6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx',
  imageUrl: 'https://gateway.example/ipfs/img',
  metadataUri: 'https://gateway.example/ipfs/meta',
  launchSignature: 'sig123',
  feeLamports: 4901732,
  transferFeeBps: 100,
  createdAt: '2026-09-12T12:00:00Z',
  agentBound: false,
  quote: { mint: '6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx', symbol: 'STONK', name: 'STONK', category: 'custom', decimals: 9 },
  metrics: {
    marketCapUsd: 12000,
    curveProgressPct: 12.5,
    holders: 7,
    priceUsd: 0.000012,
    quoteRaised: 4000,
    quoteTarget: 32230,
    graduated: false,
  },
};

const recordPayload: RecordLaunchPayload = {
  mint: 'MintAAA',
  poolId: 'PoolAAA',
  creatorWallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  quoteMint: '6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx',
  name: 'Signal Hound',
  symbol: 'HOUND',
  imageUrl: 'https://gateway.example/ipfs/img',
  metadataUri: 'https://gateway.example/ipfs/meta',
  launchSignature: 'sig123',
  feeLamports: 4901732,
  transferFeeBps: 100,
};

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => {
  vi.restoreAllMocks();
});

const lastCall = () => fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1] as [string, RequestInit];

describe('uploadMetadata', () => {
  const payload: UploadMetadataPayload = {
    name: 'Signal Hound',
    symbol: 'HOUND',
    description: 'A hound for signals.',
    website: 'https://hound.example',
    twitter: '',
    telegram: '',
    creatorWallet: recordPayload.creatorWallet,
    imageDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
  };

  it('posts the exact JSON body to /api/launch/metadata and returns the pinned URIs', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        data: {
          imageUri: 'https://gateway.example/ipfs/img',
          metadataUri: 'https://gateway.example/ipfs/meta',
          imageCid: 'img',
          metadataCid: 'meta',
          bytes: 10,
          metadataBytes: 200,
          contentType: 'image/png',
        },
      }),
    );
    const result = await uploadMetadata(payload);

    const [url, init] = lastCall();
    expect(url).toBe('https://tracker.example/api/launch/metadata');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual(payload);
    expect(result.metadataUri).toBe('https://gateway.example/ipfs/meta');
    expect(result.imageUri).toBe('https://gateway.example/ipfs/img');
  });

  it('surfaces the tracker error code and message', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ error: { code: 'image_too_large', message: 'image exceeds size limit' } }, 400));
    await expect(uploadMetadata(payload)).rejects.toMatchObject({
      name: 'LaunchApiError',
      status: 400,
      code: 'image_too_large',
      message: 'image exceeds size limit',
    });
  });

  it('rejects a success without a metadata URI', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ data: { imageUri: 'x' } }));
    await expect(uploadMetadata(payload)).rejects.toThrow(/no URI/);
  });
});

describe('recordLaunch', () => {
  it('posts the exact record body and returns the stored launch', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ data: record }, 201));
    const stored = await recordLaunch(recordPayload);

    const [url, init] = lastCall();
    expect(url).toBe('https://tracker.example/api/launch/record');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(recordPayload);
    expect(Object.keys(JSON.parse(init.body as string)).sort()).toEqual(
      [
        'creatorWallet',
        'feeLamports',
        'imageUrl',
        'launchSignature',
        'metadataUri',
        'mint',
        'name',
        'poolId',
        'quoteMint',
        'symbol',
        'transferFeeBps',
      ].sort(),
    );
    expect(stored.mint).toBe('MintAAA');
  });

  it('turns a verification failure into a coded error', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ error: { code: 'FEE_TRANSFER_MISSING', message: 'launch fee transfer missing' } }, 422),
    );
    await expect(recordLaunch(recordPayload)).rejects.toMatchObject({ status: 422, code: 'FEE_TRANSFER_MISSING' });
  });

  it('carries the existing mint out of a 409 LAUNCH_EXISTS', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ error: { code: 'LAUNCH_EXISTS', message: 'creator wallet already has a launch', mint: 'MintOLD' } }, 409),
    );
    const failure = await recordLaunch(recordPayload).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(LaunchApiError);
    expect(failure).toMatchObject({ status: 409, code: 'LAUNCH_EXISTS', mint: 'MintOLD', walletHasLaunch: true });
  });

  it('does not call any other 409 a wallet conflict', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ error: { code: 'MINT_CONFLICT', message: 'mint already recorded' } }, 409));
    const failure = (await recordLaunch(recordPayload).catch((err: unknown) => err)) as LaunchApiError;
    expect(failure.walletHasLaunch).toBe(false);
    expect(failure.mint).toBeUndefined();
  });
});

describe('reads', () => {
  it('getLaunch hits /api/launch/{mint} and throws a 404 as LaunchApiError', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ data: record }));
    const launch = await getLaunch('MintAAA');
    expect(lastCall()[0]).toBe('https://tracker.example/api/launch/MintAAA');
    expect(launch.symbol).toBe('HOUND');

    fetchSpy.mockResolvedValueOnce(jsonResponse({ error: { code: 'NOT_FOUND', message: 'launch not found' } }, 404));
    const failure = await getLaunch('Nope').catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(LaunchApiError);
    expect(failure).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('listLaunches passes cursor, creator and limit and derives the next cursor from meta', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ data: [record], meta: { total: 3, limit: 1, offset: 1 } }));
    const page = await listLaunches({ cursor: 1, creator: record.creator_wallet, limit: 1 });

    const url = new URL(lastCall()[0]);
    expect(url.pathname).toBe('/api/launches');
    expect(url.searchParams.get('cursor')).toBe('1');
    expect(url.searchParams.get('creator')).toBe(record.creator_wallet);
    expect(url.searchParams.get('limit')).toBe('1');
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(3);
    expect(page.nextCursor).toBe(2);
  });

  it('listLaunches ends the cursor on the last page and on an empty list', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ data: [record], meta: { total: 1, limit: 20, offset: 0 } }));
    expect((await listLaunches()).nextCursor).toBeNull();
    expect(lastCall()[0]).toBe('https://tracker.example/api/launches');

    fetchSpy.mockResolvedValueOnce(jsonResponse({ data: [], meta: { total: 0, limit: 20, offset: 0 } }));
    const empty = await listLaunches();
    expect(empty.items).toEqual([]);
    expect(empty.nextCursor).toBeNull();
  });

  it('getPendingLaunches hits /api/launch/pending?wallet=', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ data: [record] }));
    const pending = await getPendingLaunches(record.creator_wallet);
    expect(lastCall()[0]).toBe(`https://tracker.example/api/launch/pending?wallet=${record.creator_wallet}`);
    expect(pending).toHaveLength(1);
  });

  it('fetchLaunchesByWallet hits /api/launch/by-wallet?wallet= and reads the same envelope as /launches', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ data: [{ ...record, peer_id: 'peer-1', agentBound: true }] }));
    const launches = await fetchLaunchesByWallet(record.creator_wallet);
    expect(lastCall()[0]).toBe(`https://tracker.example/api/launch/by-wallet?wallet=${record.creator_wallet}`);
    expect(launches).toHaveLength(1);
    expect(launches[0].agentBound).toBe(true);
  });

  it('fetchLaunchesByWallet reads an empty answer as no launches', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ data: [] }));
    await expect(fetchLaunchesByWallet(record.creator_wallet)).resolves.toEqual([]);
  });
});

describe('toLaunch', () => {
  it('collapses both spellings into one, preferring camelCase', () => {
    const launch = toLaunch(record);
    expect(launch).toMatchObject({
      mint: 'MintAAA',
      poolId: 'PoolAAA',
      creatorWallet: record.creator_wallet,
      quoteMint: record.quote_mint,
      feeLamports: 4901732,
      transferFeeBps: 100,
      peerId: '',
      agentBound: false,
      boundAt: null,
    });
    expect(launch.quote?.symbol).toBe('STONK');
    expect(launch.metrics?.curveProgressPct).toBe(12.5);
  });

  it('reads the snake_case row when the camelCase mirror is absent', () => {
    const bare: LaunchRecord = {
      mint: 'M',
      creator_wallet: 'W',
      quote_mint: 'Q',
      name: 'N',
      symbol: 'S',
      launch_signature: 'sig',
      fee_lamports: 1,
      transfer_fee_bps: 100,
      peer_id: 'peer-1',
      status: 'bound',
      created_at: '2026-09-12T12:00:00Z',
    };
    const launch = toLaunch(bare);
    expect(launch.creatorWallet).toBe('W');
    expect(launch.quoteMint).toBe('Q');
    expect(launch.peerId).toBe('peer-1');
    expect(launch.agentBound).toBe(true);
    expect(launch.poolId).toBe('');
    expect(launch.quote).toBeNull();
    expect(launch.metrics).toBeNull();
  });
});

describe('deadlines', () => {
  it('every tracker call carries an abort signal so a silent host cannot hold the launch form forever', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ data: { imageUri: 'i', metadataUri: 'm' } }));
    await uploadMetadata({ name: 'n', symbol: 's', description: '', creatorWallet: 'w', imageDataUrl: 'data:' });
    expect(lastCall()[1].signal).toBeInstanceOf(AbortSignal);
    fetchSpy.mockResolvedValueOnce(jsonResponse({ data: record }));
    await getLaunch('MintAAA');
    expect(lastCall()[1].signal).toBeInstanceOf(AbortSignal);
  });

  it('a fired deadline becomes a retryable 504 LaunchApiError naming the tracker and the step', async () => {
    const timeout = new DOMException('signal timed out', 'TimeoutError');
    fetchSpy.mockRejectedValueOnce(timeout);
    const err = await recordLaunch(recordPayload).catch(e => e);
    expect(err).toBeInstanceOf(LaunchApiError);
    expect(err.status).toBe(504);
    expect(err.code).toBe('TIMEOUT');
    expect(err.message).toBe('The tracker did not answer in 30 seconds while trying to record the launch. Try again.');
  });

  it('passes every other transport failure through untouched', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(getLaunch('MintAAA')).rejects.toThrow('Failed to fetch');
  });
});

describe('launchKeys', () => {
  it('scopes every key under launches', () => {
    expect(launchKeys.all).toEqual(['launches']);
    expect(launchKeys.detail('m')[0]).toBe('launches');
    expect(launchKeys.pending('w')[0]).toBe('launches');
    expect(launchKeys.byWallet('w')).toEqual(['launches', 'by-wallet', 'w']);
    expect(launchKeys.list({ creator: 'c', cursor: 2 })).toEqual(['launches', 'list', 'c', 2, 0]);
  });
});

describe('toLaunch peerDisplayName', () => {
  it('is empty when the tracker sends none', () => {
    expect(toLaunch(record).peerDisplayName).toBe('');
  });

  it('reads either spelling, trimmed, preferring camelCase', () => {
    expect(toLaunch({ ...record, peer_display_name: ' Hound Bot ' }).peerDisplayName).toBe('Hound Bot');
    expect(toLaunch({ ...record, peer_display_name: 'old', peerDisplayName: 'new' }).peerDisplayName).toBe('new');
    expect(toLaunch({ ...record, peerDisplayName: null }).peerDisplayName).toBe('');
  });
});
