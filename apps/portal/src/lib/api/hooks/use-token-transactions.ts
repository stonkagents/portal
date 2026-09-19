/**
 * Token detail: recent trades for a mint, straight from Solana RPC.
 *
 * `getSignaturesForAddress` on the pool (or the mint when the pool is not
 * known) lists the transactions; `getParsedTransaction` on the newest of them
 * gives the pre/post token balances, from which the trader, the side and both
 * legs of the trade are inferred: the trader is the fee payer whose balance of
 * the base mint moved, the base leg is that delta, and the quote leg is the
 * same wallet's delta in the quote mint — its SOL balance when the quote is
 * wrapped SOL, its token balance otherwise.
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import type { Connection, ParsedTransactionWithMeta } from '@solana/web3.js';
import { config } from '@/config';
import { queryKeys } from '@/lib/api/keys';
import { getSolanaConnection, loadWeb3 } from '@/lib/solana/connection';

/** Signatures listed per refresh. */
const DEFAULT_LIMIT = 20;
/** Parsed-tx RPC calls per refresh — keep low to stay under public RPC limits. */
const DEFAULT_ENRICH_LIMIT = 10;
/** Public devnet ratelimits hard; manual "Refresh" still available in UI. */
const REFETCH_MS = 120_000;
const ENRICH_CONCURRENCY = 3;
/** How often a failing refresh is retried in the background. */
const ERROR_REFETCH_MS = 15_000;
const LAMPORTS_PER_SOL = 1e9;

interface TokenBalanceEntry {
  accountIndex?: number;
  mint?: string;
  owner?: string;
  uiTokenAmount?: { uiAmount: number | null; decimals: number };
}

export type TokenTxItem = {
  signature: string;
  blockTime: number | null;
  type: 'buy' | 'sell' | 'unknown';
  /** Quote leg in whole SOL. Only meaningful when the pool's quote is SOL; kept for older callers. */
  amountSol?: number;
  /** Base leg in whole tokens. */
  amountToken?: number;
  /** Quote leg in whole quote tokens, whatever the quote mint is. */
  amountQuote?: number;
  /** Effective price of the trade, in whole quote tokens per base token. */
  price?: number;
  /** The trader's wallet. */
  wallet?: string;
};

export interface UseTokenTransactionsOptions {
  enablePolling?: boolean;
  enabled?: boolean;
  /** The launch's quote mint. Wrapped SOL (or unset) reads the quote leg from lamports. */
  quoteMint?: string | null;
  /** Account to list signatures for; defaults to the mint. The pool id is the tighter choice. */
  address?: string | null;
  /** Signatures to list. */
  limit?: number;
  /** How many of them to parse for sides and amounts. */
  enrichLimit?: number;
}

export type ParsedTx = ParsedTransactionWithMeta;

function accountKeyToBase58(key: unknown): string | null {
  if (typeof key === 'string') return key;
  if (typeof key === 'object' && key !== null && typeof (key as { toBase58?: unknown }).toBase58 === 'function') {
    return (key as { toBase58(): string }).toBase58();
  }
  if (typeof key === 'object' && key !== null && 'pubkey' in key) {
    return accountKeyToBase58((key as { pubkey: unknown }).pubkey);
  }
  return null;
}

function feePayerOf(tx: ParsedTx): string | null {
  const first = tx.transaction?.message?.accountKeys?.[0];
  return first == null ? null : accountKeyToBase58(first);
}

const uiAmount = (entry?: TokenBalanceEntry): number => entry?.uiTokenAmount?.uiAmount ?? 0;

/** Net change of each owner's balance of one mint across the transaction. */
function deltasByOwner(tx: ParsedTx, mint: string): Map<string, number> {
  const pre = (tx.meta?.preTokenBalances ?? []) as TokenBalanceEntry[];
  const post = (tx.meta?.postTokenBalances ?? []) as TokenBalanceEntry[];
  const preByIndex = new Map<number, TokenBalanceEntry>();
  const postByIndex = new Map<number, TokenBalanceEntry>();
  for (const b of pre) if (b.mint === mint && b.accountIndex !== undefined) preByIndex.set(b.accountIndex, b);
  for (const b of post) if (b.mint === mint && b.accountIndex !== undefined) postByIndex.set(b.accountIndex, b);

  const out = new Map<string, number>();
  for (const idx of new Set([...preByIndex.keys(), ...postByIndex.keys()])) {
    const before = preByIndex.get(idx);
    const after = postByIndex.get(idx);
    const owner = after?.owner ?? before?.owner;
    if (!owner) continue;
    out.set(owner, (out.get(owner) ?? 0) + (uiAmount(after) - uiAmount(before)));
  }
  return out;
}

function solDeltaOf(tx: ParsedTx, address: string | null): number | null {
  if (!address || !tx.meta?.preBalances || !tx.meta.postBalances) return null;
  const keys = tx.transaction?.message?.accountKeys ?? [];
  const index = keys.findIndex(key => accountKeyToBase58(key) === address);
  if (index < 0) return null;
  const pre = tx.meta.preBalances[index];
  const post = tx.meta.postBalances[index];
  if (pre == null || post == null) return null;
  return (post - pre) / LAMPORTS_PER_SOL;
}

/** The other side of the trade: the owner whose base moved most in the opposite direction to the trader's. */
function counterpartyOf(deltas: Map<string, number>, trader: string, traderDelta: number): { owner: string; delta: number } | null {
  let best: { owner: string; delta: number } | null = null;
  for (const [owner, delta] of deltas) {
    if (owner === trader || Math.sign(delta) === Math.sign(traderDelta) || delta === 0) continue;
    if (!best || Math.abs(delta) > Math.abs(best.delta)) best = { owner, delta };
  }
  return best;
}

/**
 * Read one parsed transaction as a trade of `mint` against `quoteMint`.
 *
 * Pure: takes the parsed transaction and returns the row. The trader is the
 * fee payer when their base balance moved, else the owner with the largest
 * base delta. A transaction with no base movement is `unknown`.
 */
export function readTrade(
  tx: ParsedTx | null,
  signature: string,
  blockTime: number | null,
  mint: string,
  quoteMint?: string | null,
): TokenTxItem {
  const base: TokenTxItem = { signature, blockTime, type: 'unknown' };
  if (!tx?.meta?.preTokenBalances || !tx.meta.postTokenBalances) return base;

  const feePayer = feePayerOf(tx);
  const baseDeltas = deltasByOwner(tx, mint);

  let trader: string | null = null;
  let tokenDelta = 0;
  const payerDelta = feePayer ? (baseDeltas.get(feePayer) ?? 0) : 0;
  if (payerDelta !== 0) {
    trader = feePayer;
    tokenDelta = payerDelta;
  } else {
    for (const [owner, delta] of baseDeltas) {
      if (Math.abs(delta) > Math.abs(tokenDelta)) {
        tokenDelta = delta;
        trader = owner;
      }
    }
  }
  if (tokenDelta === 0 || !trader) return base;

  const quoteIsSol = !quoteMint || quoteMint === config.solana.wrappedSolMint;
  const solDelta = solDeltaOf(tx, trader);
  const quoteDelta = quoteIsSol ? solDelta : (deltasByOwner(tx, quoteMint).get(trader) ?? null);

  const type = tokenDelta > 0 ? 'buy' : 'sell';
  const amountToken = Math.abs(tokenDelta);
  // A buy pays quote out (negative delta); a sell takes quote in. Anything else is not a quote leg.
  const amountQuote =
    quoteDelta != null && quoteDelta !== 0 && (type === 'buy' ? quoteDelta < 0 : quoteDelta > 0) ? Math.abs(quoteDelta) : undefined;

  // The pool prices the trade: what its vaults took and gave, before the trader's
  // Token-2022 transfer fee and the platform fee. Pricing from the trader's own legs
  // puts every buy above the curve and every sell below it by the fee spread, which
  // draws alternating candles that are not price moves. The tracker prices the same way.
  const pool = counterpartyOf(baseDeltas, trader, tokenDelta);
  const poolQuoteDelta = pool
    ? (deltasByOwner(tx, quoteIsSol ? config.solana.wrappedSolMint : (quoteMint as string)).get(pool.owner) ?? null)
    : null;
  const poolPrice =
    pool && poolQuoteDelta != null && poolQuoteDelta !== 0 && (type === 'buy' ? poolQuoteDelta > 0 : poolQuoteDelta < 0)
      ? Math.abs(poolQuoteDelta) / Math.abs(pool.delta)
      : null;

  return {
    ...base,
    type,
    wallet: trader,
    amountToken,
    amountQuote,
    amountSol: quoteIsSol ? amountQuote : solDelta != null ? Math.abs(solDelta) : undefined,
    price: poolPrice ?? (amountQuote != null && amountToken > 0 ? amountQuote / amountToken : undefined),
  };
}

async function enrichTransaction(
  connection: Connection,
  signature: string,
  blockTime: number | null,
  mint: string,
  quoteMint?: string | null,
) {
  try {
    // "confirmed" returns the freshest; fall back to "finalized" for older ones.
    let tx = await connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
    if (!tx) {
      tx = await connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: 'finalized' });
    }
    return readTrade(tx, signature, blockTime, mint, quoteMint);
  } catch {
    return readTrade(null, signature, blockTime, mint, quoteMint);
  }
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

interface FetchTransactionsParams {
  mint: string;
  quoteMint?: string | null;
  address?: string | null;
  limit?: number;
  enrichLimit?: number;
}

async function fetchTransactions(params: FetchTransactionsParams): Promise<TokenTxItem[]> {
  const { mint, quoteMint, limit = DEFAULT_LIMIT, enrichLimit = DEFAULT_ENRICH_LIMIT } = params;
  const [connection, { PublicKey }] = await Promise.all([getSolanaConnection(), loadWeb3()]);
  const sigs = await connection.getSignaturesForAddress(new PublicKey(params.address || mint), { limit });
  const enriched = await mapWithConcurrency(sigs.slice(0, enrichLimit), ENRICH_CONCURRENCY, s =>
    enrichTransaction(connection, s.signature, s.blockTime ?? null, mint, quoteMint),
  );
  const rest: TokenTxItem[] = sigs
    .slice(enrichLimit)
    .map(s => ({ signature: s.signature, blockTime: s.blockTime ?? null, type: 'unknown' as const }));
  return [...enriched, ...rest];
}

export function useTokenTransactions(contract: string | null, options?: UseTokenTransactionsOptions) {
  const enablePolling = options?.enablePolling ?? false;
  const enabled = options?.enabled ?? true;
  const { quoteMint = null, address = null, limit, enrichLimit } = options ?? {};

  return useQuery({
    queryKey: [
      ...queryKeys.tokens.detail(contract ?? ''),
      'transactions',
      quoteMint ?? '',
      address ?? '',
      limit ?? 0,
      enrichLimit ?? 0,
    ] as const,
    queryFn: () => fetchTransactions({ mint: contract!, quoteMint, address, limit, enrichLimit }),
    enabled: !!contract && enabled,
    staleTime: 10_000,
    // A rate-limited RPC fails a whole refresh; back off through it and keep
    // the last tape on screen, retrying quietly while in error.
    retry: 3,
    retryDelay: attempt => Math.min(1_000 * 2 ** attempt, 8_000),
    refetchInterval: query => (query.state.status === 'error' ? ERROR_REFETCH_MS : enablePolling ? REFETCH_MS : false),
    refetchOnWindowFocus: false,
  });
}
