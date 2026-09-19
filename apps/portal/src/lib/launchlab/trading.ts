/**
 * Buying and selling on a LaunchLab bonding curve, in the app.
 *
 * Quotes come from Raydium's own `Curve` maths against the live pool, using the
 * fee rates the pool and its platform config actually carry (the platform is
 * whatever the pool account names: ours, or stonk.fun's for $AGENT), so the
 * number a trader reads is the number the program computes. The wallet signs;
 * we send on our RPC. Nothing here touches a venue API.
 */

import type { Transaction, VersionedTransaction } from '@solana/web3.js';
import type BN from 'bn.js';
import { config } from '@/config';
import { DEFAULT_SLIPPAGE_BPS, RATE_DENOMINATOR } from './constants';
import type { LaunchPoolState } from './pool-state';
import { getSolanaConnection, loadWeb3 } from '@/lib/solana/connection';

export interface TradeQuote {
  /** What the trader pays, in whole tokens of the input asset. */
  amountIn: number;
  /** What the trader receives before slippage, in whole tokens of the output asset. */
  amountOut: number;
  /** The worst output the transaction will accept. */
  minAmountOut: number;
  /** Total curve fee on this trade, in whole quote tokens. */
  feeQuote: number;
  /** Effective price per token, in whole quote tokens. */
  priceQuote: number;
  /** How far the trade moves the curve, in percent. */
  priceImpactPct: number;
}

const pow10 = (n: number): number => 10 ** n;

async function bn() {
  const mod = await import('bn.js');
  return mod.default;
}

function toRaw(amount: number, decimals: number): string {
  return BigInt(Math.max(0, Math.round(amount * pow10(decimals)))).toString();
}

function applySlippage(amount: number, slippageBps: number): number {
  return amount * (1 - slippageBps / RATE_DENOMINATOR);
}

interface CurveArgs {
  poolInfo: unknown;
  protocolFeeRate: unknown;
  platformFeeRate: unknown;
  creatorFeeRate: unknown;
  curveType: number;
  shareFeeRate: unknown;
  transferFeeConfigA: undefined;
  transferFeeConfigB: undefined;
  slot: number;
}

async function curveArgs(pool: LaunchPoolState): Promise<CurveArgs> {
  const BN = await bn();
  const platform = pool.raw.platformInfo as { feeRate?: unknown; creatorFeeRate?: unknown } | null;
  const cfg = pool.raw.configInfo as { tradeFeeRate: unknown };
  return {
    poolInfo: pool.raw.poolInfo,
    protocolFeeRate: cfg.tradeFeeRate,
    platformFeeRate: platform?.feeRate ?? new BN(0),
    creatorFeeRate: platform?.creatorFeeRate ?? new BN(0),
    curveType: pool.raw.curveType,
    shareFeeRate: new BN(0),
    transferFeeConfigA: undefined,
    transferFeeConfigB: undefined,
    slot: 0,
  };
}

/**
 * What a buy of `quoteAmount` lands.
 *
 * @param quoteAmount - Amount to spend, in whole quote tokens.
 */
export async function quoteBuy(
  pool: LaunchPoolState,
  quoteAmount: number,
  slippageBps: number = DEFAULT_SLIPPAGE_BPS,
): Promise<TradeQuote> {
  const sdk = await import('@raydium-io/raydium-sdk-v2');
  const BN = await bn();
  const args = await curveArgs(pool);

  const amountB = new BN(toRaw(quoteAmount, pool.quoteDecimals));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = sdk.Curve.buyExactIn({ ...(args as any), amountB });

  const amountOut = Number(res.amountA.amount.toString()) / pow10(pool.baseDecimals);
  const fee = res.splitFee;
  const feeRaw = Number(fee.protocolFee.toString()) + Number(fee.platformFee.toString()) + Number(fee.creatorFee.toString());

  return {
    amountIn: quoteAmount,
    amountOut,
    minAmountOut: applySlippage(amountOut, slippageBps),
    feeQuote: feeRaw / pow10(pool.quoteDecimals),
    priceQuote: amountOut > 0 ? quoteAmount / amountOut : 0,
    priceImpactPct: impact(pool, amountOut > 0 ? quoteAmount / amountOut : 0),
  };
}

/**
 * What a sale of `tokenAmount` returns.
 *
 * @param tokenAmount - Amount to sell, in whole base tokens.
 */
export async function quoteSell(
  pool: LaunchPoolState,
  tokenAmount: number,
  slippageBps: number = DEFAULT_SLIPPAGE_BPS,
): Promise<TradeQuote> {
  const sdk = await import('@raydium-io/raydium-sdk-v2');
  const BN = await bn();
  const args = await curveArgs(pool);

  const amountA = new BN(toRaw(tokenAmount, pool.baseDecimals));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = sdk.Curve.sellExactIn({ ...(args as any), amountA });

  const amountOut = Number(res.amountB.toString()) / pow10(pool.quoteDecimals);
  const fee = res.splitFee;
  const feeRaw = Number(fee.protocolFee.toString()) + Number(fee.platformFee.toString()) + Number(fee.creatorFee.toString());

  return {
    amountIn: tokenAmount,
    amountOut,
    minAmountOut: applySlippage(amountOut, slippageBps),
    feeQuote: feeRaw / pow10(pool.quoteDecimals),
    priceQuote: tokenAmount > 0 ? amountOut / tokenAmount : 0,
    priceImpactPct: impact(pool, tokenAmount > 0 ? amountOut / tokenAmount : 0),
  };
}

/** How far an effective price sits from the pool's spot price, in percent. */
function impact(pool: LaunchPoolState, effectivePrice: number): number {
  if (pool.priceQuote <= 0 || effectivePrice <= 0) return 0;
  return Math.abs(effectivePrice / pool.priceQuote - 1) * 100;
}

export interface TradeParams {
  pool: LaunchPoolState;
  /** Base58 address of the trader, who pays and signs. */
  wallet: string;
  /** Buy: whole quote tokens in. Sell: whole base tokens in. */
  amount: number;
  slippageBps?: number;
}

async function loadRaydium(wallet: string) {
  const [sdk, connection, { PublicKey }] = await Promise.all([
    import('@raydium-io/raydium-sdk-v2'),
    getSolanaConnection(),
    loadWeb3(),
  ]);
  return sdk.Raydium.load({
    connection,
    owner: new PublicKey(wallet),
    cluster: config.cluster === 'mainnet' ? 'mainnet' : 'devnet',
    disableLoadToken: true,
    disableFeatureCheck: true,
  });
}

/**
 * The platform fee rate the pool's own platform config carries, for the SDK's
 * builders. The SDK reads the platform account named by `poolInfo.platformId`
 * for the instruction either way; handing it the rate we already decoded
 * keeps the quote and the built trade on the same number, whichever
 * platform (ours, or stonk.fun's for $AGENT) the pool was created under.
 */
function platformFeeRateOf(pool: LaunchPoolState) {
  const platform = pool.raw.platformInfo as { feeRate?: unknown } | null;
  return platform?.feeRate as BN | undefined;
}

/** Build the buy transaction for the trader to sign. */
export async function buildBuy(params: TradeParams): Promise<VersionedTransaction | Transaction> {
  const { pool } = params;
  const sdk = await import('@raydium-io/raydium-sdk-v2');
  const [BN, raydium, { PublicKey }] = await Promise.all([bn(), loadRaydium(params.wallet), loadWeb3()]);

  const built = await raydium.launchpad.buyToken({
    programId: new PublicKey(pool.programId),
    mintA: new PublicKey(pool.mint),
    mintB: new PublicKey(pool.quoteMint),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    poolInfo: pool.raw.poolInfo as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    configInfo: pool.raw.configInfo as any,
    platformFeeRate: platformFeeRateOf(pool),
    buyAmount: new BN(toRaw(params.amount, pool.quoteDecimals)),
    slippage: new BN(params.slippageBps ?? DEFAULT_SLIPPAGE_BPS),
    txVersion: sdk.TxVersion.V0,
    feePayer: new PublicKey(params.wallet),
  });

  return built.transaction;
}

/** Build the sell transaction for the trader to sign. */
export async function buildSell(params: TradeParams): Promise<VersionedTransaction | Transaction> {
  const { pool } = params;
  const sdk = await import('@raydium-io/raydium-sdk-v2');
  const [BN, raydium, { PublicKey }] = await Promise.all([bn(), loadRaydium(params.wallet), loadWeb3()]);

  const built = await raydium.launchpad.sellToken({
    programId: new PublicKey(pool.programId),
    mintA: new PublicKey(pool.mint),
    mintB: new PublicKey(pool.quoteMint),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    poolInfo: pool.raw.poolInfo as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    configInfo: pool.raw.configInfo as any,
    platformFeeRate: platformFeeRateOf(pool),
    sellAmount: new BN(toRaw(params.amount, pool.baseDecimals)),
    slippage: new BN(params.slippageBps ?? DEFAULT_SLIPPAGE_BPS),
    txVersion: sdk.TxVersion.V0,
    feePayer: new PublicKey(params.wallet),
  });

  return built.transaction;
}

/** A trade error turned into something a trader can act on. */
export function classifyTradeError(err: unknown): string {
  if (!(err instanceof Error)) return 'The trade failed. Try again.';
  const msg = err.message.toLowerCase();

  if (msg.includes('user rejected') || msg.includes('user denied')) return 'You rejected the transaction in your wallet.';
  if (msg.includes('insufficient') || msg.includes('not enough')) return 'Not enough balance for this trade and network gas.';
  if (msg.includes('slippage') || msg.includes('exceeded')) return 'The price moved past your slippage. Try again.';
  if (msg.includes('status') || msg.includes('migrat')) return 'This token has left the curve. Trade it on Raydium.';
  if (msg.includes('blockhash') || msg.includes('block height')) return 'The transaction expired before it landed. Try again.';
  if (err.message.length > 10) return err.message;
  return 'The trade failed. Try again.';
}
