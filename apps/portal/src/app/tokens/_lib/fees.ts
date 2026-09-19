/**
 * The one fee every Agent token charges per trade, and how it is worded.
 *
 * 2.25% per trade: 0.25% Raydium · 1% StonkAgents · 1% holders. The holders'
 * share is collected by the token itself (Token-2022) on every trade and
 * transfer and paid out in the quote asset. The protocol's 1% is split: half
 * buys back and burns $AGENT, half funds development. There is no creator fee.
 * Rates come from the pool and the mint; `config.fees` only fills in before
 * they have loaded. The launch summary shares these strings.
 */

import { config } from '@/config';
import type { LaunchPoolState } from '@/lib/launchlab/pool-state';
import { bpsToPercent } from '@/lib/launchlab/pricing';
import type { GalleryToken } from './gallery-token';

export interface FeeSplit {
  /** The holders' share, carried by the mint as a Token-2022 transfer fee. */
  holderTaxBps: number;
  platformBps: number;
  protocolBps: number;
  creatorBps: number;
  totalBps: number;
}

/**
 * The split for a token. Our launches carry the holders' tax on the mint and
 * trade under our platform config; a pool under another platform's config
 * (`external`, $AGENT on stonk.fun) has no transfer tax and its platform's
 * own rate, so nothing is filled in from `config.fees` for it.
 */
export function feeSplit(token: GalleryToken, pool?: LaunchPoolState): FeeSplit {
  const external = token.source === 'external';
  const holderTaxBps = token.transferFeeBps ?? (external ? 0 : config.fees.holderTaxBps);
  const platformBps = pool?.fees.platformBps ?? (external ? 0 : config.fees.platformBps);
  const protocolBps = pool?.fees.protocolBps ?? (external ? 0 : config.fees.protocolBps);
  const creatorBps = pool?.fees.creatorBps ?? (external ? 0 : config.fees.creatorBps);
  return { holderTaxBps, platformBps, protocolBps, creatorBps, totalBps: holderTaxBps + platformBps + protocolBps + creatorBps };
}

/** "0.25% Raydium · 1% StonkAgents · 1% holders"; a foreign platform is named by the pool. */
function feeSplitParts(split: FeeSplit, platformName: string = config.brand.name): string {
  const parts = [`${bpsToPercent(split.protocolBps)} Raydium`, `${bpsToPercent(split.platformBps)} ${platformName}`];
  if (split.holderTaxBps > 0) parts.push(`${bpsToPercent(split.holderTaxBps)} holders`);
  if (split.creatorBps > 0) parts.push(`${bpsToPercent(split.creatorBps)} creator`);
  return parts.join(' · ');
}

/** "2.25% fee per trade: 0.25% Raydium · 1% StonkAgents · 1% holders" */
export function feeSplitLine(split: FeeSplit, platformName?: string | null): string {
  return `${bpsToPercent(split.totalBps)} fee per trade: ${feeSplitParts(split, platformName ?? undefined)}`;
}

/** How the holders' share reaches them; null for a token that carries none. */
export function holdersShareLine(split: FeeSplit, quoteSymbol: string | null): string | null {
  if (split.holderTaxBps <= 0) return null;
  const paidIn = quoteSymbol ? `$${quoteSymbol}` : 'the quote asset';
  return `The holders' ${bpsToPercent(split.holderTaxBps)} is collected by the token itself (Token-2022) on every trade and transfer and paid out in ${paidIn}.`;
}

/* ── Where the fees went ────────────────────────────────────────────────
 * All-time destinations of the 2.25%, each row a figure read from the chain
 * or the tracker's ledger, never a claim. A row with nothing readable yet
 * carries null and says why. */

import type { TokenRevenue } from './use-token-chain-data';

type FeesWentRowId = 'holders' | 'protocol' | 'raydium';

interface FeesWentFigure {
  value: number;
  /** Unit the value is in: the token, the quote, or USD. */
  unit: string;
  /** True when only part of the accounts could be read, so the value is a floor. */
  floor?: boolean;
}

export interface FeesWentRow {
  id: FeesWentRowId;
  label: string;
  bps: number;
  /** The all-time figure, or null when nothing readable exists yet. */
  amount: FeesWentFigure | null;
  /** What the figure is, or the honest state when there is none. */
  note: string;
  /** Explorer target for the row. */
  link: { kind: 'token' | 'address'; id: string; label: string } | null;
}

export interface FeesWentInput {
  split: FeeSplit;
  tokenSymbol: string;
  mint: string;
  quoteSymbol: string | null;
  pool: LaunchPoolState | undefined;
  /** Fallback pool address when the pool state has not loaded. */
  poolId?: string | null;
  /** Transfer fees withheld in token accounts and not yet harvested, in whole tokens. Null until read. */
  withheldInAccounts: number | null;
  /** True when only the largest twenty accounts were read. */
  withheldFloor?: boolean;
  /** Transfer fees harvested to the mint and not yet withdrawn, in whole tokens. Null until read. */
  withheldOnMint: number | null;
  /** The tracker's ledger rows for this mint, when it has any. */
  ledger?: TokenRevenue | null;
}

/** Quote volume the pool's Raydium accrual implies, while Raydium has not claimed it. */
export function impliedVolumeQuote(pool: LaunchPoolState | undefined): number | null {
  if (!pool || pool.fees.protocolBps <= 0 || pool.protocolFeeQuote <= 0) return null;
  return pool.protocolFeeQuote / (pool.fees.protocolBps / 10_000);
}

/** The three destinations as rows. Pure, so it is tested on its own. */
export function feesWentRows(input: FeesWentInput): FeesWentRow[] {
  const { split, tokenSymbol, mint, quoteSymbol, pool, ledger } = input;
  const quote = quoteSymbol ?? 'quote';
  const poolAddress = pool?.poolId ?? input.poolId ?? null;

  /* Holders: the mint's Token-2022 fee, withheld in accounts until the keeper harvests and pays it out. */
  const withheld =
    input.withheldInAccounts == null && input.withheldOnMint == null
      ? null
      : (input.withheldInAccounts ?? 0) + (input.withheldOnMint ?? 0);
  const paidCount = ledger?.counts.holder_distribution ?? 0;
  const paidUsd = ledger?.totalsUsd.holder_distribution ?? 0;
  const holdersNote =
    withheld == null
      ? 'Reading the mint.'
      : paidCount > 0
        ? `Paid out ${paidCount}× so far (${formatUsdShort(paidUsd)}); the rest is withheld by the mint until the next payout.`
        : withheld > 0
          ? `Accrued to holders: withheld by the mint on every trade, paid out in $${quote} by the keeper.`
          : 'Nothing withheld yet. The mint collects it on every trade.';

  /* Protocol: LaunchLab pays the platform per trade, so the pool holds nothing; the ledger is the record. */
  const claimedCount = ledger?.counts.platform_fee_claim ?? 0;
  const claimedUsd = ledger?.totalsUsd.platform_fee_claim ?? 0;
  const protocolAmount: FeesWentFigure | null =
    pool && pool.platformFeeQuote > 0
      ? { value: pool.platformFeeQuote, unit: quote }
      : claimedCount > 0
        ? { value: claimedUsd, unit: 'USD' }
        : null;
  const protocolNote =
    pool && pool.platformFeeQuote > 0
      ? 'Accrued in the pool, unclaimed. Half buys back and burns $AGENT, half funds development.'
      : claimedCount > 0
        ? `Claimed ${claimedCount}×, from the ledger. Half buys back and burns $AGENT, half funds development.`
        : 'Paid per trade to the platform fee wallet. Half buys back and burns $AGENT, half funds development. The ledger starts with the keeper.';

  /* Raydium: accrues in the pool until Raydium claims it. */
  const volume = impliedVolumeQuote(pool);
  const raydiumNote = !pool
    ? 'Reading the pool.'
    : pool.protocolFeeQuote > 0
      ? `Accrued in the pool, unclaimed${volume != null ? ` · implies ≈ ${formatQuoteShort(volume)} ${quote} traded` : ''}.`
      : 'Nothing accrued yet.';

  return [
    {
      id: 'holders',
      label: 'Holders',
      bps: split.holderTaxBps,
      amount: withheld == null ? null : { value: withheld, unit: tokenSymbol, floor: input.withheldFloor },
      note: holdersNote,
      link: { kind: 'token', id: mint, label: 'mint' },
    },
    {
      id: 'protocol',
      label: 'Protocol',
      bps: split.platformBps,
      amount: protocolAmount,
      note: protocolNote,
      link: pool?.platformFeeWallet
        ? { kind: 'address', id: pool.platformFeeWallet, label: 'fee wallet' }
        : poolAddress
          ? { kind: 'address', id: poolAddress, label: 'pool' }
          : null,
    },
    {
      id: 'raydium',
      label: 'Raydium',
      bps: split.protocolBps,
      amount: pool ? { value: pool.protocolFeeQuote, unit: quote } : null,
      note: raydiumNote,
      link: poolAddress ? { kind: 'address', id: poolAddress, label: 'pool' } : null,
    },
  ];
}

function formatUsdShort(value: number): string {
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function formatQuoteShort(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: value >= 100 ? 0 : value >= 1 ? 2 : 4 });
}
