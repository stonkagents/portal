'use client';

/**
 * The extra reads the token detail page makes beyond the launch record and the pool:
 * the quote's USD price (for the USD hints), the off-chain metadata document
 * (description and socials), and the top holders straight from the RPC.
 */

import { useQuery } from '@tanstack/react-query';
import { getPricesUsd } from '@/lib/api/price';
import { getSolanaConnection, loadWeb3 } from '@/lib/solana/connection';
import { resilient } from './query-resilience';

/* ────────────────────────────────────────────────────────────
   Quote USD price
   ──────────────────────────────────────────────────────────── */

const quoteUsdKey = (mint: string | null) => ['price', 'usd', mint ?? ''] as const;

/** USD price of one whole quote token, or null when the feed does not know it. */
export function useQuoteUsd(quoteMint: string | null | undefined) {
  return useQuery({
    queryKey: quoteUsdKey(quoteMint ?? null),
    queryFn: async (): Promise<number | null> => {
      const prices = await getPricesUsd([quoteMint as string]);
      return prices[quoteMint as string] ?? null;
    },
    enabled: Boolean(quoteMint),
    staleTime: 60_000,
    ...resilient(60_000),
  });
}

/* ────────────────────────────────────────────────────────────
   Off-chain metadata
   ──────────────────────────────────────────────────────────── */

export interface TokenMetadata {
  description: string | null;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
}

const IPFS_GATEWAY = 'https://ipfs.io/ipfs/';

/** Turn an `ipfs://` URI into a gateway URL; pass anything else through. */
export function metadataHttpUrl(uri: string): string {
  return uri.startsWith('ipfs://') ? `${IPFS_GATEWAY}${uri.slice('ipfs://'.length)}` : uri;
}

const readString = (doc: Record<string, unknown>, key: string): string | null => {
  const value = doc[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

/** Only http(s) links are rendered as socials; anything else is dropped. */
function safeHref(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

async function fetchTokenMetadata(uri: string, signal?: AbortSignal): Promise<TokenMetadata> {
  const response = await fetch(metadataHttpUrl(uri), { headers: { Accept: 'application/json' }, signal });
  if (!response.ok) throw new Error(`Metadata returned ${response.status}`);
  const doc = (await response.json()) as Record<string, unknown>;
  return {
    description: readString(doc, 'description'),
    website: safeHref(readString(doc, 'website')),
    twitter: safeHref(readString(doc, 'twitter')),
    telegram: safeHref(readString(doc, 'telegram')),
  };
}

const tokenMetadataKey = (uri: string | null) => ['token', 'metadata', uri ?? ''] as const;

/** The metadata document behind a launch. Disabled when the launch has none. */
export function useTokenMetadata(uri: string | null | undefined) {
  return useQuery({
    queryKey: tokenMetadataKey(uri ?? null),
    queryFn: ({ signal }) => fetchTokenMetadata(uri as string, signal),
    enabled: Boolean(uri),
    staleTime: Infinity,
    ...resilient(false),
  });
}

/* ────────────────────────────────────────────────────────────
   Top holders
   ──────────────────────────────────────────────────────────── */

export interface TokenHolder {
  /** Wallet that owns the token account, or the token account itself when the owner is unknown. */
  owner: string;
  /** The token account holding the balance. */
  account: string;
  /** Whole tokens held. */
  amount: number;
  /** Share of the total supply, 0–100. */
  percent: number;
  /** True for the bonding curve's own vault. */
  isPool: boolean;
  /** Token-2022 transfer fee withheld in this account and not yet harvested, in whole tokens. Absent for legacy rows. */
  withheld?: number;
}

export interface TopHolders {
  holders: TokenHolder[];
  /** Whole tokens in circulation, as the mint reports it. */
  supply: number;
  /** Transfer fees withheld across the listed accounts, in whole tokens. */
  withheldTotal: number;
}

interface ParsedTokenAccountInfo {
  owner?: string;
  extensions?: { extension?: string; state?: { withheldAmount?: number | string } }[];
}

/** The transfer fee a token account is holding for the mint, in whole tokens. */
export function withheldOf(info: ParsedTokenAccountInfo | null | undefined, decimals: number): number {
  const ext = info?.extensions?.find(e => e.extension === 'transferFeeAmount');
  const raw = Number(ext?.state?.withheldAmount ?? 0);
  return Number.isFinite(raw) && raw > 0 ? raw / 10 ** decimals : 0;
}

/**
 * The largest token accounts and who owns them.
 *
 * Three RPC calls: the largest accounts, the supply, and one batched read that
 * resolves each account to its owner. A vault the pool owns is flagged, whether
 * by its address or by the pool's authority owning it.
 */
export async function fetchTopHolders(mint: string, poolAccounts: readonly string[]): Promise<TopHolders> {
  const [connection, { PublicKey }] = await Promise.all([getSolanaConnection(), loadWeb3()]);
  const mintKey = new PublicKey(mint);

  const [largest, supplyInfo] = await Promise.all([connection.getTokenLargestAccounts(mintKey), connection.getTokenSupply(mintKey)]);
  const supply = supplyInfo.value.uiAmount ?? Number(supplyInfo.value.amount) / 10 ** supplyInfo.value.decimals;
  const top = largest.value;
  if (top.length === 0) return { holders: [], supply, withheldTotal: 0 };

  const parsed = await connection.getMultipleParsedAccounts(top.map(entry => entry.address));
  const poolSet = new Set(poolAccounts);

  const holders = top.map((entry, index) => {
    const account = entry.address.toBase58();
    const info = parsed.value[index];
    const data = info?.data;
    const parsedInfo =
      data && typeof data === 'object' && 'parsed' in data
        ? (data as { parsed?: { info?: ParsedTokenAccountInfo } }).parsed?.info
        : undefined;
    const owner = parsedInfo?.owner ?? account;
    const amount = entry.uiAmount ?? Number(entry.amount) / 10 ** entry.decimals;
    return {
      owner,
      account,
      amount,
      percent: supply > 0 ? (amount / supply) * 100 : 0,
      isPool: poolSet.has(account) || poolSet.has(owner),
      withheld: withheldOf(parsedInfo, entry.decimals),
    };
  });

  return { holders, supply, withheldTotal: holders.reduce((sum, h) => sum + (h.withheld ?? 0), 0) };
}
