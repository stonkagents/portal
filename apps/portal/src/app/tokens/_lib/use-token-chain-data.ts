'use client';

/**
 * More reads for the token detail page: the mint account itself (program,
 * supply, transfer-fee extension), the platform revenue ledger rows that name
 * this mint, and every holder of the mint.
 */

import { useQuery } from '@tanstack/react-query';
import { trackerEndpoint } from '@/config';
import { TOKEN_2022_PROGRAM } from '@/lib/launchlab/constants';
import { getSolanaConnection, loadWeb3 } from '@/lib/solana/connection';
import { resilient } from './query-resilience';
import { fetchTopHolders, withheldOf, type TokenHolder } from './use-token-detail-data';

/* ────────────────────────────────────────────────────────────
   Mint account
   ──────────────────────────────────────────────────────────── */

export interface MintInfo {
  /** Program that owns the mint: Token or Token-2022. */
  program: string;
  isToken2022: boolean;
  decimals: number;
  /** Whole tokens. */
  supply: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  /** Token-2022 transfer fee, when the mint carries one. */
  transferFee: {
    bps: number;
    /** Largest fee one transfer can take, in whole tokens. */
    maxPerTransfer: number;
    /** Collected by the mint and not yet withdrawn, in whole tokens. */
    withheld: number;
    withdrawAuthority: string | null;
  } | null;
}

interface ParsedMint {
  decimals?: number;
  supply?: string;
  mintAuthority?: string | null;
  freezeAuthority?: string | null;
  extensions?: { extension?: string; state?: Record<string, unknown> }[];
}

interface TransferFeeExtension {
  newerTransferFee?: { transferFeeBasisPoints?: number; maximumFee?: number | string };
  withheldAmount?: number | string;
  withdrawWithheldAuthority?: string | null;
}

/** Read what the mint account itself says: program, decimals, supply, transfer fee. */
async function fetchMintInfo(mint: string): Promise<MintInfo> {
  const [connection, { PublicKey }] = await Promise.all([getSolanaConnection(), loadWeb3()]);
  const info = await connection.getParsedAccountInfo(new PublicKey(mint));
  const { value } = info;
  if (!value) throw new Error('The mint is not on this network.');
  const { data } = value;
  const parsed: ParsedMint =
    (data && typeof data === 'object' && 'parsed' in data ? (data as { parsed?: { info?: ParsedMint } }).parsed?.info : null) ?? {};
  const decimals = parsed.decimals ?? 0;
  const program = value.owner.toBase58();

  const feeExt = parsed.extensions?.find(e => e.extension === 'transferFeeConfig')?.state as TransferFeeExtension | undefined;
  const fee = feeExt?.newerTransferFee;

  return {
    program,
    isToken2022: program === TOKEN_2022_PROGRAM,
    decimals,
    supply: Number(parsed.supply ?? 0) / 10 ** decimals,
    mintAuthority: parsed.mintAuthority ?? null,
    freezeAuthority: parsed.freezeAuthority ?? null,
    transferFee: fee
      ? {
          bps: fee.transferFeeBasisPoints ?? 0,
          maxPerTransfer: Number(fee.maximumFee ?? 0) / 10 ** decimals,
          withheld: Number(feeExt?.withheldAmount ?? 0) / 10 ** decimals,
          withdrawAuthority: feeExt?.withdrawWithheldAuthority ?? null,
        }
      : null,
  };
}

const mintInfoKey = (mint: string | null) => ['token', 'mint-info', mint ?? ''] as const;

export function useMintInfo(mint: string | null | undefined) {
  return useQuery({
    queryKey: mintInfoKey(mint ?? null),
    queryFn: () => fetchMintInfo(mint as string),
    enabled: Boolean(mint),
    staleTime: 60_000,
    ...resilient(60_000),
  });
}

/* ────────────────────────────────────────────────────────────
   Platform revenue for this token
   ──────────────────────────────────────────────────────────── */

/** One ledger row from `GET /api/revenue`, as the tracker returns it. */
export interface RevenueEntry {
  id: number;
  kind: string;
  quote_mint?: string;
  amount_raw: number;
  amount_usd: number | null;
  signature?: string;
  mint?: string;
  occurred_at: string;
  explorer_url?: string;
}

export interface TokenRevenue {
  /** Ledger rows for this mint, newest first. */
  entries: RevenueEntry[];
  /** USD totals by kind over those rows. */
  totalsUsd: Record<string, number>;
  counts: Record<string, number>;
  /** The tracker only returns its newest rows, so totals may be a floor. */
  partial: boolean;
}

/** Fold ledger rows into per-kind totals. Pure, so it is tested on its own. */
export function summarizeRevenue(all: readonly RevenueEntry[], mint: string, totalEntries?: number): TokenRevenue {
  const entries = all.filter(e => e.mint === mint);
  const totalsUsd: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const e of entries) {
    totalsUsd[e.kind] = (totalsUsd[e.kind] ?? 0) + (e.amount_usd ?? 0);
    counts[e.kind] = (counts[e.kind] ?? 0) + 1;
  }
  return { entries, totalsUsd, counts, partial: (totalEntries ?? all.length) > all.length };
}

/** The revenue ledger rows that name this mint. */
async function fetchTokenRevenue(mint: string, signal?: AbortSignal): Promise<TokenRevenue> {
  const response = await fetch(trackerEndpoint('/api/revenue'), { headers: { Accept: 'application/json' }, signal });
  if (!response.ok) throw new Error(`The revenue ledger returned ${response.status}`);
  const body = (await response.json()) as { data?: { entries?: RevenueEntry[]; total_entries?: number } };
  return summarizeRevenue(body.data?.entries ?? [], mint, body.data?.total_entries);
}

const tokenRevenueKey = (mint: string | null) => ['token', 'revenue', mint ?? ''] as const;

export function useTokenRevenue(mint: string | null | undefined) {
  return useQuery({
    queryKey: tokenRevenueKey(mint ?? null),
    queryFn: ({ signal }) => fetchTokenRevenue(mint as string, signal),
    enabled: Boolean(mint),
    staleTime: 60_000,
    ...resilient(false),
  });
}

/* ────────────────────────────────────────────────────────────
   Every holder
   ──────────────────────────────────────────────────────────── */

export interface AllHolders {
  /** Every account with a balance, largest first. */
  holders: TokenHolder[];
  supply: number;
  /** True when the RPC refused the full scan and only the largest 20 accounts are listed. */
  capped: boolean;
  /**
   * Token-2022 transfer fees withheld across the listed accounts and not yet
   * harvested, in whole tokens. A floor when `capped`.
   */
  withheldTotal: number;
}

interface ParsedTokenAccount {
  owner?: string;
  tokenAmount?: { uiAmount?: number | null; decimals?: number };
  extensions?: { extension?: string; state?: { withheldAmount?: number | string } }[];
}

/**
 * Every token account of the mint, via a program-account scan; when the RPC
 * refuses that (public endpoints often do), the twenty largest accounts.
 */
/** How long the full account scan may take before the page settles for the top twenty. */
const ALL_HOLDERS_SCAN_TIMEOUT_MS = 15_000;

/**
 * Every holder of a mint. The largest-accounts call answers in milliseconds
 * and returns up to twenty accounts, which is the complete set for most agents
 * on the curve. Only when it comes back full does the slow program-account
 * scan run, and it is capped so the Holders tab never waits on it for long.
 */
async function fetchAllHolders(mint: string, program: string, poolAccounts: readonly string[]): Promise<AllHolders> {
  const top = await fetchTopHolders(mint, poolAccounts);
  if (top.holders.length < 20) return { holders: top.holders, supply: top.supply, capped: false, withheldTotal: top.withheldTotal };

  const [connection, { PublicKey }] = await Promise.all([getSolanaConnection(), loadWeb3()]);
  const poolSet = new Set(poolAccounts);
  const scan = connection.getParsedProgramAccounts(new PublicKey(program), {
    filters: [{ memcmp: { offset: 0, bytes: mint } }],
  });
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('holders scan timed out')), ALL_HOLDERS_SCAN_TIMEOUT_MS),
  );
  try {
    const accounts = await Promise.race([scan, timeout]);
    const holders: TokenHolder[] = [];
    let withheldTotal = 0;
    for (const { pubkey, account } of accounts) {
      const { data } = account;
      const info =
        data && typeof data === 'object' && 'parsed' in data
          ? (data as { parsed?: { info?: ParsedTokenAccount } }).parsed?.info
          : null;
      // Withheld fees sit in the account even after its balance is spent.
      const withheld = withheldOf(info, info?.tokenAmount?.decimals ?? 0);
      withheldTotal += withheld;
      const amount = info?.tokenAmount?.uiAmount ?? 0;
      if (amount <= 0) continue;
      const accountId = pubkey.toBase58();
      const owner = info?.owner ?? accountId;
      holders.push({
        owner,
        account: accountId,
        amount,
        percent: top.supply > 0 ? (amount / top.supply) * 100 : 0,
        isPool: poolSet.has(accountId) || poolSet.has(owner),
        withheld,
      });
    }
    holders.sort((a, b) => b.amount - a.amount);
    return { holders, supply: top.supply, capped: false, withheldTotal };
  } catch {
    return { holders: top.holders, supply: top.supply, capped: true, withheldTotal: top.withheldTotal };
  }
}

const allHoldersKey = (mint: string | null) => ['token', 'all-holders', mint ?? ''] as const;

export function useAllHolders(mint: string | null | undefined, program: string | null | undefined, poolAccounts: readonly string[]) {
  return useQuery({
    queryKey: [...allHoldersKey(mint ?? null), program ?? '', poolAccounts.join(',')] as const,
    queryFn: () => fetchAllHolders(mint as string, program as string, poolAccounts),
    enabled: Boolean(mint && program),
    staleTime: 60_000,
    ...resilient(120_000),
  });
}
