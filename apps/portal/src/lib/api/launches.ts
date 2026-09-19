/**
 * The tracker's launch endpoints.
 *
 * Every route here is public and lives under the tracker's `/api` router. There
 * is no mock path and no browser-side upload key: metadata is pinned server
 * side, and a launch is only real once the tracker has verified the signature on
 * chain. `config.api.trackerUrl` decides which cluster's tracker answers.
 */

import { trackerEndpoint } from '@/config';

/* ────────────────────────────────────────────────────────────
   Wire shapes
   ──────────────────────────────────────────────────────────── */

/** The quote a launch raises in, inlined on every launch the tracker returns. */
export interface LaunchQuoteView {
  mint: string;
  symbol: string;
  name: string;
  category: string;
  decimals: number;
  tokenProgram?: string;
}

/**
 * Live market state of a launch. Every field is null when unknown, so a card
 * can render from a partial answer instead of waiting for a complete one.
 */
export interface LaunchMetricsView {
  marketCapUsd: number | null;
  curveProgressPct: number | null;
  holders: number | null;
  priceUsd: number | null;
  /** Whole quote tokens raised so far. */
  quoteRaised: number | null;
  /** Whole quote tokens the curve graduates at. */
  quoteTarget: number | null;
  graduated: boolean | null;
  source?: string;
}

/**
 * A recorded launch, as the tracker returns it.
 *
 * The snake_case fields are the stored row; the camelCase duplicates and the
 * `quote` / `metrics` enrichment are what `GET /api/launch/{mint}` and
 * `GET /api/launches` add on top. Read the camelCase ones where both exist.
 */
export interface LaunchRecord {
  mint: string;
  pool_id?: string;
  creator_wallet: string;
  quote_mint: string;
  name: string;
  symbol: string;
  image_url?: string;
  image_thumb_url?: string;
  metadata_uri?: string;
  launch_signature: string;
  fee_lamports: number;
  transfer_fee_bps: number;
  platform_id?: string;
  /** Set once the launch is claimed by a running agent. */
  peer_id?: string;
  /** The bound agent's display name, when its owner set one. */
  peer_display_name?: string | null;
  status: string;
  created_at: string;
  bound_at?: string;

  poolId?: string;
  creatorWallet?: string;
  quoteMint?: string;
  imageUrl?: string;
  /** The pinned 128 px copy of imageUrl; null for launches recorded before thumbnails. */
  imageThumbUrl?: string | null;
  metadataUri?: string;
  launchSignature?: string;
  feeLamports?: number;
  transferFeeBps?: number;
  platformId?: string;
  peerId?: string;
  peerDisplayName?: string | null;
  createdAt?: string;
  boundAt?: string;
  /** True once an agent has claimed this launch. */
  agentBound?: boolean;
  /** Absent when the quote mint is not in the tracker's catalog. */
  quote?: LaunchQuoteView | null;
  /** Absent when nothing is known about the market yet. */
  metrics?: LaunchMetricsView | null;
}

/** One launch with a single spelling per field, for components to render. */
export interface Launch {
  mint: string;
  poolId: string;
  creatorWallet: string;
  quoteMint: string;
  name: string;
  symbol: string;
  imageUrl: string;
  /** Null when the launch has no thumbnail; readers fall back to imageUrl. */
  imageThumbUrl: string | null;
  metadataUri: string;
  launchSignature: string;
  feeLamports: number;
  transferFeeBps: number;
  platformId: string;
  /** Empty until an agent claims the launch. */
  peerId: string;
  /** The bound agent's display name; empty when none is set. */
  peerDisplayName: string;
  status: string;
  createdAt: string;
  boundAt: string | null;
  agentBound: boolean;
  quote: LaunchQuoteView | null;
  metrics: LaunchMetricsView | null;
}

/** Collapse the tracker's two spellings into one. */
export function toLaunch(record: LaunchRecord): Launch {
  const peerId = record.peerId ?? record.peer_id ?? '';
  return {
    mint: record.mint,
    poolId: record.poolId ?? record.pool_id ?? '',
    creatorWallet: record.creatorWallet ?? record.creator_wallet ?? '',
    quoteMint: record.quoteMint ?? record.quote_mint ?? '',
    name: record.name,
    symbol: record.symbol,
    imageUrl: record.imageUrl ?? record.image_url ?? '',
    imageThumbUrl: record.imageThumbUrl || record.image_thumb_url || null,
    metadataUri: record.metadataUri ?? record.metadata_uri ?? '',
    launchSignature: record.launchSignature ?? record.launch_signature ?? '',
    feeLamports: record.feeLamports ?? record.fee_lamports ?? 0,
    transferFeeBps: record.transferFeeBps ?? record.transfer_fee_bps ?? 0,
    platformId: record.platformId ?? record.platform_id ?? '',
    peerId,
    peerDisplayName: (record.peerDisplayName ?? record.peer_display_name ?? '').trim(),
    status: record.status,
    createdAt: record.createdAt ?? record.created_at ?? '',
    boundAt: record.boundAt ?? record.bound_at ?? null,
    agentBound: record.agentBound ?? (peerId !== '' || record.status === 'bound'),
    quote: record.quote ?? null,
    metrics: record.metrics ?? null,
  };
}

/** Body of `POST /api/launch/record`. Field names are the tracker's, verbatim. */
export interface RecordLaunchPayload {
  mint: string;
  poolId: string;
  creatorWallet: string;
  quoteMint: string;
  name: string;
  symbol: string;
  imageUrl: string;
  /** Pinned 128 px copy of imageUrl; omit when the upload made none. */
  imageThumbUrl?: string;
  metadataUri: string;
  launchSignature: string;
  feeLamports: number;
  transferFeeBps: number;
}

/** Body of `POST /api/launch/metadata`. */
export interface UploadMetadataPayload {
  name: string;
  symbol: string;
  description: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  creatorWallet: string;
  /** `data:image/png;base64,...`. The tracker sniffs the real type from the bytes. */
  imageDataUrl: string;
  /** Optional 128 px copy of the image (PNG, JPEG or WebP, at most 256 px and 256 KB). */
  thumbnailDataUrl?: string;
}

/** What the tracker returns after pinning the image and the metadata document. */
export interface UploadedMetadata {
  imageUri: string;
  metadataUri: string;
  imageCid?: string;
  metadataCid?: string;
  bytes: number;
  metadataBytes: number;
  contentType: string;
  /** Present only when a thumbnail was sent and pinned. */
  thumbnailUri?: string;
  thumbnailCid?: string;
  thumbnailBytes?: number;
}

export interface LaunchListQuery {
  /** Offset-style cursor, as `GET /api/launches` accepts it. */
  cursor?: number;
  creator?: string;
  limit?: number;
}

export interface LaunchListPage {
  items: LaunchRecord[];
  total: number;
  limit: number;
  offset: number;
  /** Cursor for the next page, or null at the end. */
  nextCursor: number | null;
}

/* ────────────────────────────────────────────────────────────
   Transport
   ──────────────────────────────────────────────────────────── */

/** `POST /api/launch/record` answers this when the creator wallet already has a launch. */
export const LAUNCH_EXISTS_CODE = 'LAUNCH_EXISTS';

export class LaunchApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    /** On a `LAUNCH_EXISTS` 409, the mint of the launch this wallet already has. */
    public readonly mint?: string,
  ) {
    super(message);
    this.name = 'LaunchApiError';
  }

  /** True when the tracker refused because the wallet already has an agent. */
  get walletHasLaunch(): boolean {
    return this.status === 409 && this.code === LAUNCH_EXISTS_CODE;
  }
}

interface Envelope<T> {
  data?: T;
  meta?: { total: number; limit: number; offset: number };
  error?: { code?: string; message?: string; mint?: string };
}

async function readEnvelope<T>(response: Response, what: string): Promise<Envelope<T>> {
  const body = (await response.json().catch(() => null)) as Envelope<T> | null;
  if (!response.ok) {
    throw new LaunchApiError(
      body?.error?.message ?? `Could not ${what} (${response.status}).`,
      response.status,
      body?.error?.code,
      body?.error?.mint,
    );
  }
  if (!body) throw new LaunchApiError(`The tracker returned nothing for ${what}.`, response.status);
  return body;
}

/**
 * Every tracker call has a deadline. A browser fetch otherwise waits minutes
 * for a host that accepted the connection and went quiet, and the launch form
 * would sit at "Storing the image and metadata" with nothing to press.
 */
export const TRACKER_READ_TIMEOUT_MS = 20_000;
/** The metadata upload pins an image and a document through the tracker; give it room. */
export const TRACKER_UPLOAD_TIMEOUT_MS = 60_000;
export const TRACKER_WRITE_TIMEOUT_MS = 30_000;

/** The caller's signal and a deadline, whichever fires first. */
function deadline(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timer = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timer]) : timer;
}

/**
 * A deadline that fired reads as one sentence naming the tracker, not "signal is
 * aborted without reason". It carries 504 so the callers that retry on 5xx
 * (the launch detail query, the record retry) treat it as the transient
 * failure it is.
 */
function timedOutError(what: string, timeoutMs: number): LaunchApiError {
  return new LaunchApiError(
    `The tracker did not answer in ${Math.round(timeoutMs / 1000)} seconds while trying to ${what}. Try again.`,
    504,
    'TIMEOUT',
  );
}

/** The DOMException a timed-out AbortSignal rejects with (not an Error subclass in every runtime). */
function isTimeout(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'TimeoutError';
}

async function get<T>(path: string, what: string, signal?: AbortSignal): Promise<Envelope<T>> {
  let response: Response;
  try {
    response = await fetch(trackerEndpoint(path), {
      headers: { Accept: 'application/json' },
      signal: deadline(TRACKER_READ_TIMEOUT_MS, signal),
    });
  } catch (err) {
    if (isTimeout(err)) throw timedOutError(what, TRACKER_READ_TIMEOUT_MS);
    throw err;
  }
  return readEnvelope<T>(response, what);
}

async function post<T>(path: string, payload: unknown, what: string, timeoutMs = TRACKER_WRITE_TIMEOUT_MS): Promise<Envelope<T>> {
  let response: Response;
  try {
    response = await fetch(trackerEndpoint(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: deadline(timeoutMs),
    });
  } catch (err) {
    if (isTimeout(err)) throw timedOutError(what, timeoutMs);
    throw err;
  }
  return readEnvelope<T>(response, what);
}

/* ────────────────────────────────────────────────────────────
   Endpoints
   ──────────────────────────────────────────────────────────── */

/**
 * Pin the token image and metadata document, server side.
 *
 * Call this before building the launch: the mint's on-chain URI is
 * `metadataUri`, so the transaction cannot be built without it.
 *
 * @throws {LaunchApiError} when the image is rejected or the pinning service fails.
 */
export async function uploadMetadata(payload: UploadMetadataPayload): Promise<UploadedMetadata> {
  const body = await post<UploadedMetadata>('/api/launch/metadata', payload, 'store the token metadata', TRACKER_UPLOAD_TIMEOUT_MS);
  if (!body.data?.metadataUri) {
    throw new LaunchApiError('The metadata upload returned no URI.', 502);
  }
  return body.data;
}

/**
 * Tell the tracker a token is live.
 *
 * The chain is already the record of truth; this makes the launch visible in the
 * gallery, routes its metrics, and lets the creator's agent claim it. The
 * tracker verifies the signature before it stores anything, so a launch that has
 * not landed yet is rejected rather than half-recorded.
 *
 * @throws {LaunchApiError} with `code` naming the verification that failed.
 */
export async function recordLaunch(payload: RecordLaunchPayload): Promise<LaunchRecord> {
  const body = await post<LaunchRecord>('/api/launch/record', payload, 'record the launch');
  if (!body.data) throw new LaunchApiError('The tracker recorded nothing.', 502);
  return body.data;
}

/** One launch by base mint. */
export async function getLaunch(mint: string, signal?: AbortSignal): Promise<LaunchRecord> {
  const body = await get<LaunchRecord>(`/api/launch/${encodeURIComponent(mint)}`, 'load the launch', signal);
  if (!body.data) throw new LaunchApiError('That launch is not on the tracker.', 404);
  return body.data;
}

/** A page of launches, newest first. `creator` filters to one wallet. */
export async function listLaunches(query: LaunchListQuery = {}, signal?: AbortSignal): Promise<LaunchListPage> {
  const params = new URLSearchParams();
  if (query.cursor !== undefined) params.set('cursor', String(query.cursor));
  if (query.creator) params.set('creator', query.creator);
  if (query.limit !== undefined) params.set('limit', String(query.limit));

  const suffix = params.toString() ? `?${params.toString()}` : '';
  const body = await get<LaunchRecord[]>(`/api/launches${suffix}`, 'load the launches', signal);

  const items = body.data ?? [];
  const meta = body.meta ?? { total: items.length, limit: items.length, offset: 0 };
  const consumed = meta.offset + items.length;

  return {
    items,
    total: meta.total,
    limit: meta.limit,
    offset: meta.offset,
    nextCursor: consumed < meta.total && items.length > 0 ? consumed : null,
  };
}

/**
 * Launches this wallet created that no agent has claimed yet.
 *
 * The claim itself goes through the daemon proxy, because it needs the peer's
 * API key; this read does not.
 */
export async function getPendingLaunches(wallet: string, signal?: AbortSignal): Promise<LaunchRecord[]> {
  const body = await get<LaunchRecord[]>(
    `/api/launch/pending?wallet=${encodeURIComponent(wallet)}`,
    'load your unclaimed launches',
    signal,
  );
  return body.data ?? [];
}

/**
 * Every launch this wallet created, claimed or not, newest first.
 *
 * This is the answer to "does this wallet already have an agent": `pending`
 * stops listing a launch once an agent claims it, so a fresh browser would
 * otherwise be offered a second launch the tracker then refuses with 409.
 */
export async function fetchLaunchesByWallet(wallet: string, signal?: AbortSignal): Promise<LaunchRecord[]> {
  const body = await get<LaunchRecord[]>(`/api/launch/by-wallet?wallet=${encodeURIComponent(wallet)}`, 'load your launches', signal);
  return body.data ?? [];
}

/* ────────────────────────────────────────────────────────────
   Query keys
   ──────────────────────────────────────────────────────────── */

export const launchKeys = {
  all: ['launches'] as const,
  list: (query: LaunchListQuery = {}) => ['launches', 'list', query.creator ?? '', query.cursor ?? 0, query.limit ?? 0] as const,
  detail: (mint: string) => ['launches', 'detail', mint] as const,
  pending: (wallet: string) => ['launches', 'pending', wallet] as const,
  byWallet: (wallet: string) => ['launches', 'by-wallet', wallet] as const,
};
