/**
 * Live state of one LaunchLab bonding curve, read straight from Solana.
 *
 * The pool address is a PDA of the program, the base mint and the quote mint,
 * so a recorded launch is enough to find it — no indexer, no venue API. What
 * comes back drives the price, the curve progress and the fee split the trade
 * panel shows, and it is what the buy and sell builders quote against.
 */

import { useQuery } from '@tanstack/react-query';
import type BN from 'bn.js';
import { config } from '@/config';
import { getSolanaConnection, loadWeb3 } from '@/lib/solana/connection';
import { RATE_DENOMINATOR } from './constants';

/** Pool status the program reports. 0 is the only tradable one. */
export const POOL_STATUS_FUND_RAISING = 0;

/** Human labels for the program's enums. */
export const POOL_STATUS_LABELS: Record<number, string> = { 0: 'Fund-raising', 1: 'Migrating', 2: 'Migrated' };
export const CURVE_TYPE_LABELS: Record<number, string> = { 0: 'Constant product', 1: 'Fixed price', 2: 'Linear' };
export const MIGRATE_TYPE_LABELS: Record<number, string> = { 0: 'Raydium AMM v4', 1: 'Raydium CPMM' };

interface PoolFeeRates {
  /** Raydium's cut, in basis points. */
  protocolBps: number;
  /** Our platform cut, in basis points. */
  platformBps: number;
  /** Creator cut, in basis points. Zero on our platform. */
  creatorBps: number;
  /** Everything the curve charges a trade, in basis points. */
  totalBps: number;
}

export interface LaunchPoolState {
  poolId: string;
  programId: string;
  mint: string;
  quoteMint: string;
  baseDecimals: number;
  quoteDecimals: number;
  /** 0 while the curve is trading; anything else means it has left the curve. */
  status: number;
  graduated: boolean;
  /** 0–100 along the bonding curve. */
  progressPct: number;
  /** Quote raised so far, in whole quote tokens. */
  raisedQuote: number;
  /** Raise the curve graduates at, in whole quote tokens. */
  targetQuote: number;
  /** Price of one whole token, in whole quote tokens. */
  priceQuote: number;
  /** Base tokens still unsold on the curve, in whole tokens. */
  remainingBase: number;
  /** Total supply of the base mint, in whole tokens. */
  supplyBase: number;
  /** Base tokens sold off the curve so far, in whole tokens. */
  soldBase: number;
  /** The curve's own token accounts, so a holders list can flag them. */
  vaultBase: string;
  vaultQuote: string;
  /** Wallet that created the pool. */
  creator: string;
  /**
   * The platform config the pool was created under, read off the pool account:
   * ours for a launch from this site, stonk.fun's for $AGENT. The trade
   * instructions name this one, never `LAUNCHPAD_PLATFORM_ID`.
   */
  platformId: string;
  /** The platform's own name from its config account; null when that account could not be read. */
  platformName: string | null;
  /** Raydium's quote config for this pool. */
  configId: string;
  /** Curve shape the program uses: 0 constant product, 1 fixed price, 2 linear. */
  curveType: number;
  /** Where liquidity goes at graduation: 0 AMM v4, 1 CPMM. */
  migrateType: number;
  /** Base tokens locked for the creator's vesting, in whole tokens. */
  totalLockedBase: number;
  /** Fee the program takes at migration, in whole quote tokens. */
  migrateFeeQuote: number;
  /** Raydium's trade fee accrued in the pool and not yet claimed, in whole quote tokens. */
  protocolFeeQuote: number;
  /**
   * Our platform's trade fee accrued in the pool and not yet claimed, in whole
   * quote tokens. Zero on programs that pay the platform per trade instead.
   */
  platformFeeQuote: number;
  /** Wallet the platform's fee is claimed to, from the platform config. */
  platformFeeWallet: string | null;
  /** Live balances of the curve's vaults, in whole tokens. */
  vaultBaseBalance: number;
  vaultQuoteBalance: number;
  fees: PoolFeeRates;
  /** Raw SDK values, kept so the trade builder does not re-read the chain. */
  raw: {
    poolInfo: unknown;
    configInfo: unknown;
    platformInfo: unknown;
    curveType: number;
  };
}

const toNumber = (value: BN | undefined, decimals: number): number => (value ? Number(value.toString()) / 10 ** decimals : 0);

/**
 * LaunchLab stores every rate against a 1,000,000 denominator, so a stored
 * 10,000 is 1%. Basis points are the stored rate divided by a hundred.
 */
const FEE_RATE_DENOMINATOR = RATE_DENOMINATOR * 100;

const rateToBps = (rate: BN): number => Number(rate.toString()) / (FEE_RATE_DENOMINATOR / RATE_DENOMINATOR);

/** The platform's name as its config stores it: a fixed byte field, NUL padded. Exported for tests. */
export function platformNameOf(bytes: ArrayLike<number> | null | undefined): string | null {
  if (!bytes || bytes.length === 0) return null;
  const text = new TextDecoder().decode(Uint8Array.from(bytes)).replace(/\0+$/, '').trim();
  return text.length > 0 ? text : null;
}

export interface PoolStateParams {
  programId: string;
  mint: string;
  quoteMint: string;
  /** Skip the PDA derivation when the pool address is already known. */
  poolId?: string;
}

/**
 * Read a pool and everything the trade panel needs about it.
 *
 * @throws {Error} when the pool account does not exist on this cluster.
 */
export async function getPoolState(params: PoolStateParams): Promise<LaunchPoolState> {
  const [sdk, connection, { PublicKey }] = await Promise.all([
    import('@raydium-io/raydium-sdk-v2'),
    getSolanaConnection(),
    loadWeb3(),
  ]);
  const programId = new PublicKey(params.programId);

  const poolId = params.poolId
    ? new PublicKey(params.poolId)
    : sdk.getPdaLaunchpadPoolId(programId, new PublicKey(params.mint), new PublicKey(params.quoteMint)).publicKey;

  const raydium = await sdk.Raydium.load({
    connection,
    cluster: config.cluster === 'mainnet' ? 'mainnet' : 'devnet',
    disableLoadToken: true,
    disableFeatureCheck: true,
  });

  const poolInfo = await raydium.launchpad.getRpcPoolInfo({ poolId });
  const { configInfo } = poolInfo;

  const [platformAccount, vaultA, vaultB] = await Promise.all([
    connection.getAccountInfo(poolInfo.platformId),
    connection.getTokenAccountBalance(poolInfo.vaultA).catch(() => null),
    connection.getTokenAccountBalance(poolInfo.vaultB).catch(() => null),
  ]);
  const platformInfo = platformAccount ? sdk.PlatformConfig.decode(platformAccount.data) : null;
  const platformName = platformInfo ? platformNameOf(platformInfo.name) : null;

  const baseDecimals = poolInfo.mintDecimalsA;
  const quoteDecimals = poolInfo.mintDecimalsB;

  const raisedQuote = toNumber(poolInfo.realB, quoteDecimals);
  const targetQuote = toNumber(poolInfo.totalFundRaisingB, quoteDecimals);
  const soldBase = toNumber(poolInfo.realA, baseDecimals);
  const totalSellBase = toNumber(poolInfo.totalSellA, baseDecimals);

  const price = sdk.Curve.getPrice({
    poolInfo,
    curveType: configInfo.curveType,
    decimalA: baseDecimals,
    decimalB: quoteDecimals,
  });

  const protocolBps = rateToBps(configInfo.tradeFeeRate);
  const platformBps = platformInfo ? rateToBps(platformInfo.feeRate) : config.fees.platformBps;
  const creatorBps = platformInfo?.creatorFeeRate ? rateToBps(platformInfo.creatorFeeRate) : 0;

  return {
    poolId: poolId.toBase58(),
    programId: params.programId,
    mint: poolInfo.mintA.toBase58(),
    quoteMint: poolInfo.mintB.toBase58(),
    baseDecimals,
    quoteDecimals,
    status: poolInfo.status,
    graduated: poolInfo.status !== POOL_STATUS_FUND_RAISING,
    progressPct: targetQuote > 0 ? Math.min(100, Math.max(0, (raisedQuote / targetQuote) * 100)) : 0,
    raisedQuote,
    targetQuote,
    priceQuote: Number(price.toString()),
    remainingBase: Math.max(0, totalSellBase - soldBase),
    supplyBase: toNumber(poolInfo.supply, baseDecimals),
    soldBase,
    vaultBase: poolInfo.vaultA.toBase58(),
    vaultQuote: poolInfo.vaultB.toBase58(),
    creator: poolInfo.creator.toBase58(),
    platformId: poolInfo.platformId.toBase58(),
    platformName,
    configId: poolInfo.configId.toBase58(),
    curveType: configInfo.curveType,
    migrateType: poolInfo.migrateType,
    totalLockedBase: toNumber(poolInfo.vestingSchedule?.totalLockedAmount, baseDecimals),
    migrateFeeQuote: toNumber(poolInfo.migrateFee, quoteDecimals),
    protocolFeeQuote: toNumber(poolInfo.protocolFee, quoteDecimals),
    platformFeeQuote: toNumber(poolInfo.platformFee, quoteDecimals),
    platformFeeWallet: platformInfo?.platformClaimFeeWallet?.toBase58() ?? null,
    vaultBaseBalance: vaultA?.value.uiAmount ?? 0,
    vaultQuoteBalance: vaultB?.value.uiAmount ?? raisedQuote,
    fees: {
      protocolBps,
      platformBps,
      creatorBps,
      totalBps: protocolBps + platformBps + creatorBps,
    },
    raw: { poolInfo, configInfo, platformInfo, curveType: configInfo.curveType },
  };
}

/** Query key for one pool's live state. Shared with `useExternalPoolState`, so a page reading both ways makes one read. */
export const poolStateKey = (mint: string | null, quoteMint: string | null) => ['launchlab', 'pool', mint ?? '', quoteMint ?? ''] as const;

/** How often the curve is re-read while a detail page is open. */
export const POOL_POLL_MS = 15_000;

/**
 * Live pool state as React state. Disabled until the mint, the quote and the
 * program are all known, which is only after the launch record has loaded.
 */
export function usePoolState(params: Partial<PoolStateParams> & { enabled?: boolean }) {
  const { programId, mint, quoteMint, poolId, enabled = true } = params;
  const ready = Boolean(programId && mint && quoteMint && enabled);

  return useQuery({
    queryKey: poolStateKey(mint ?? null, quoteMint ?? null),
    queryFn: () => getPoolState({ programId: programId!, mint: mint!, quoteMint: quoteMint!, poolId }),
    enabled: ready,
    staleTime: POOL_POLL_MS,
    // Back off through an RPC blip and keep the last pool state on screen,
    // retrying quietly while the read is in error.
    retry: 3,
    retryDelay: attempt => Math.min(1_000 * 2 ** attempt, 8_000),
    refetchInterval: query => (query.state.status === 'error' ? 15_000 : POOL_POLL_MS),
    refetchOnWindowFocus: false,
  });
}
