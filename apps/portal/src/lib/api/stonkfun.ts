/**
 * stonkfun's public API, read only, for the Network token when the build says
 * `NEXT_PUBLIC_AGENT_SOURCE=stonkfun`.
 *
 *   GET {base}/tokens/{mint}             { data: { token, launch, network }, meta }
 *   GET {base}/tokens/{mint}/burns       { data: { mint, totals, burns[] } }   newest first
 *
 * No auth, CORS open, 300 requests a minute per IP: the hooks cache every
 * answer and poll no faster than every 30 s. The parsers take what the API
 * sends today and tolerate a missing field (null, never a guess), so a field
 * stonkfun drops later blanks one stat instead of the page.
 */

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const str = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? (value as Record<string, unknown>) : {});

/** The stonkfun site, for token pages and the API. */
export const STONKFUN_SITE = 'https://www.stonkfun.xyz';
/** The public API base. */
export const STONKFUN_API_BASE = `${STONKFUN_SITE}/api/public/v1`;
/** How the venue is named in the UI. */
export const STONKFUN_NAME = 'stonkfun';

/** The token's page on stonkfun, where it is bought and its trades are listed. */
export function stonkfunTokenUrl(mint: string): string {
  return `${STONKFUN_SITE}/token/${encodeURIComponent(mint)}`;
}

export interface StonkfunMarket {
  priceUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  /** Percent over 24h. */
  priceChange24h: number | null;
  peakMarketCapUsd: number | null;
}

export interface StonkfunToken {
  mint: string;
  /** The LaunchLab pool the token launched on. */
  pool: string | null;
  name: string;
  symbol: string;
  quote: { mint: string | null; symbol: string | null; name: string | null };
  /** 'launchlab' today. */
  launchpad: string | null;
  /** 'reward' for a token whose transfer tax feeds holders. */
  mode: string | null;
  /** Token-2022 transfer tax on the mint, in basis points. */
  transferFeeBps: number | null;
  /** True while stonkfun's flywheel is buying back and burning. */
  flywheelActive: boolean | null;
  imageUrl: string | null;
  links: { website: string | null; twitter: string | null };
  market: StonkfunMarket;
  /** 'graduated', or whatever stonkfun says the curve is in. */
  status: string | null;
  graduated: boolean;
  /** 0 to 1 along the curve. */
  graduationProgress: number | null;
  graduatedAt: string | null;
  createdAt: string | null;
  /** Wallet that launched the token, from the launch record. */
  creator: string | null;
  /** 'mainnet-beta' or 'devnet'. */
  network: string | null;
}

export interface StonkfunBurn {
  signature: string;
  symbol: string | null;
  /** Whole tokens. */
  amountTokens: number;
  valueUsdAtBurn: number | null;
  /** 'flywheel'. */
  source: string | null;
  /** ISO 8601. */
  burnedAt: string;
}

export interface StonkfunBurns {
  mint: string | null;
  totals: {
    symbol: string | null;
    /** Whole tokens burned, over every burn stonkfun indexed. */
    amountTokens: number;
    valueUsdAtBurn: number | null;
    burnCount: number;
    lastBurnAt: string | null;
  };
  /** The latest burns, newest first. */
  burns: StonkfunBurn[];
}

/** Thrown for anything but a clean answer. */
export class StonkfunApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'StonkfunApiError';
  }
}

/** Shape a `GET /tokens/{mint}` answer. Null when no mint is named. Exported for tests. */
export function parseStonkfunToken(body: unknown): StonkfunToken | null {
  const data = obj(obj(body).data);
  const token = obj(data.token);
  const launch = obj(data.launch);
  const mint = str(token.mint) ?? str(launch.mint);
  if (!mint) return null;
  const quote = obj(token.quote ?? launch.quote);
  const market = obj(token.market);
  const links = obj(token.links);
  const status = str(token.status);
  const progress = num(token.graduationProgress);
  return {
    mint,
    pool: str(token.pool) ?? str(launch.pool),
    name: str(token.name) ?? str(launch.name) ?? '',
    symbol: str(token.symbol) ?? str(launch.symbol) ?? '',
    quote: { mint: str(quote.mint), symbol: str(quote.symbol), name: str(quote.name) },
    launchpad: str(token.launchpad) ?? str(launch.launchpad),
    mode: str(token.mode) ?? str(launch.mode),
    transferFeeBps: num(obj(token.transferFee ?? launch.transferFee).bps),
    flywheelActive: typeof obj(token.flywheel).active === 'boolean' ? (obj(token.flywheel).active as boolean) : null,
    imageUrl: str(token.imageUrl) ?? str(launch.logoUrl),
    links: { website: str(links.website), twitter: str(links.twitter) },
    market: {
      priceUsd: num(market.priceUsd),
      marketCapUsd: num(market.marketCapUsd),
      fdvUsd: num(market.fdvUsd),
      volume24hUsd: num(market.volume24hUsd),
      liquidityUsd: num(market.liquidityUsd),
      priceChange24h: num(market.priceChange24h),
      peakMarketCapUsd: num(market.peakMarketCapUsd),
    },
    status,
    graduated: status === 'graduated' || Boolean(str(token.graduatedAt)) || (progress != null && progress >= 1),
    graduationProgress: progress,
    graduatedAt: str(token.graduatedAt),
    createdAt: str(token.createdAt) ?? str(launch.createdAt),
    creator: str(launch.creator),
    network: str(data.network),
  };
}

/** Shape a `GET /tokens/{mint}/burns` answer, dropping any burn without a signature. Exported for tests. */
export function parseStonkfunBurns(body: unknown): StonkfunBurns {
  const data = obj(obj(body).data);
  const totals = obj(data.totals);
  const burns = (Array.isArray(data.burns) ? data.burns : [])
    .map(entry => obj(entry))
    .filter(entry => str(entry.signature) && str(entry.burnedAt))
    .map(entry => ({
      signature: str(entry.signature) as string,
      symbol: str(entry.symbol),
      amountTokens: num(entry.amountTokens) ?? 0,
      valueUsdAtBurn: num(entry.valueUsdAtBurn),
      source: str(entry.source),
      burnedAt: str(entry.burnedAt) as string,
    }));
  return {
    mint: str(data.mint),
    totals: {
      symbol: str(totals.symbol),
      amountTokens: num(totals.amountTokens) ?? burns.reduce((sum, burn) => sum + burn.amountTokens, 0),
      valueUsdAtBurn: num(totals.valueUsdAtBurn),
      burnCount: num(totals.burnCount) ?? burns.length,
      lastBurnAt: str(totals.lastBurnAt) ?? burns[0]?.burnedAt ?? null,
    },
    burns,
  };
}

async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`${STONKFUN_API_BASE}${path}`, { headers: { Accept: 'application/json' }, signal });
  if (!response.ok) throw new StonkfunApiError(`stonkfun returned ${response.status} for ${path}.`, response.status);
  const body: unknown = await response.json().catch(() => null);
  if (body == null) throw new StonkfunApiError(`stonkfun returned nothing for ${path}.`, response.status);
  return body;
}

/** The token as stonkfun lists it. Throws `StonkfunApiError`, 404 included: a mint stonkfun does not know is a configuration error. */
export async function fetchStonkfunToken(mint: string, signal?: AbortSignal): Promise<StonkfunToken> {
  const path = `/tokens/${encodeURIComponent(mint)}`;
  const token = parseStonkfunToken(await getJson(path, signal));
  if (!token) throw new StonkfunApiError(`stonkfun named no token for ${path}.`, 200);
  return token;
}

/** Burns stonkfun indexed for the mint, newest first. A 404 is an empty ledger. */
export async function fetchStonkfunBurns(mint: string, limit = 25, signal?: AbortSignal): Promise<StonkfunBurns> {
  const path = `/tokens/${encodeURIComponent(mint)}/burns?limit=${limit}`;
  try {
    return parseStonkfunBurns(await getJson(path, signal));
  } catch (error) {
    if (error instanceof StonkfunApiError && error.status === 404) return parseStonkfunBurns({ data: { mint } });
    throw error;
  }
}
