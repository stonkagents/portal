'use client';
/**
 * Featured $AGENT card — the Network's token, pinned right after the hero on the
 * home page and at the top of the Agent Tokens page. Identity comes from
 * `featuredAgentToken()`; the header row is always four stats in this order:
 * 24h change, market cap, 24h volume, holders. $AGENT trades on a stonk.fun
 * LaunchLab pool the tracker never recorded, so market cap comes off that
 * pool (`useAgentToken`: in USD when the quote has a USD price, else in the
 * quote) and holders off the chain; the 24h pair needs an indexer over the
 * pool and reads "—" until the tracker has one, never a fixture. A pool that
 * cannot be read says so.
 *
 * Under the header row the card is a network-token panel: "Burning $AGENT",
 * read live from the chain and the tracker's burn ledger (`AgentTokenPanel`).
 *
 * With the stonkfun source (`NEXT_PUBLIC_AGENT_SOURCE=stonkfun`) the same
 * four stats come from stonkfun's API, which also names the token, its quote
 * and whether it graduated; the card says "via stonkfun" and "Buy" opens the
 * token page's in-app swap (Jupiter's page stays as a second door).
 *
 * Before the token is live (`NEXT_PUBLIC_AGENT_MINT` empty: `featuredAgentToken()`
 * is null) the card is the "coming soon" preview (`FeaturedAgentComingSoon`):
 * the same frame and header over ghost regions, no buy button, and nothing is
 * read from the chain or the tracker. The frame, mascot, title, pill and stat
 * tile live in `FeaturedAgentFrame` so the two cards share one skeleton.
 */
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { Icon } from '@/components/ui';
import { useToast } from '@/providers/ToastProvider';
import { AGENT_BUY_HREF, AGENT_JUPITER_URL, AGENT_PAIRED_WITH, type FeaturedAgentToken } from '@/lib/agent-token';
import { useAgentToken } from '@/lib/api/hooks/use-agent-token';
import { STONKFUN_NAME, stonkfunTokenUrl } from '@/lib/api/stonkfun';
import { formatQuoteAmount } from '@/app/tokens/_lib/gallery-token';
import { AgentTokenPanel, useAgentNetworkData } from './AgentTokenPanel';
import { describeChainError } from '@/lib/solana/rpc-fetch';
import {
  FEATURED_STAT_LABELS,
  FeaturedFrame,
  FeaturedMascot,
  FeaturedTitle,
  NetworkTokenPill,
  StatTile,
  type FeaturedStatLabel,
} from './FeaturedAgentFrame';
import { FeaturedAgentComingSoon } from './FeaturedAgentComingSoon';

/** What a stat reads before the tracker has answered, or when it has no value. */
export const STAT_PLACEHOLDER = '-';

/** $41.2K, $127K, $1.84M, $980 */
export function formatUsdCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${trimZeros((value / 1_000_000).toFixed(2))}M`;
  if (abs >= 100_000) return `$${Math.round(value / 1_000)}K`;
  if (abs >= 1_000) return `$${trimZeros((value / 1_000).toFixed(1))}K`;
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

/** +38% / −6% / 0% (uses a true minus sign). */
export function formatChange(percent: number): string {
  const rounded = Math.round(percent);
  if (rounded === 0) return '0%';
  return rounded > 0 ? `+${rounded}%` : `−${Math.abs(rounded)}%`;
}

/** 4,812 */
export function formatCount(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

/** 7xKd…Qm9A — first 4 and last 4 characters of an address. */
export function truncateMint(mint: string, edge = 4): string {
  if (mint.length <= edge * 2 + 1) return mint;
  return `${mint.slice(0, edge)}…${mint.slice(-edge)}`;
}

function trimZeros(fixed: string): string {
  return fixed.replace(/\.?0+$/, '');
}

/** Copy-address button. Copies the full mint and confirms with a toast. */
export function CopyAddressButton({ mint, symbol, className }: { mint: string; symbol: string; className?: string }) {
  const { addToast } = useToast();
  return (
    <button
      type="button"
      onClick={e => {
        e.preventDefault();
        e.stopPropagation();
        void navigator.clipboard?.writeText(mint);
        addToast({
          title: 'Address copied',
          description: `$${symbol} · ${truncateMint(mint)}`,
          variant: 'success',
          autoDismiss: true,
          duration: 2000,
        });
      }}
      className={cn(
        'inline-flex min-h-[32px] items-center gap-1 rounded border border-border-default bg-bg-tertiary px-2 font-mono text-[11px] tabular-nums text-text-secondary transition-colors hover:border-accent-green/40 hover:text-accent-green',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green',
        className,
      )}
      aria-label={`Copy $${symbol} contract address ${mint}`}
      title={mint}
      data-testid="token-copy-address"
    >
      <Icon name="copy" size="sm" />
      CA
    </button>
  );
}

export interface FeaturedAgentCardProps {
  /** The Network's token ($AGENT): mint and identity. Stats are loaded from the tracker. Null: the token is not live yet. */
  token: FeaturedAgentToken | null;
  /** Where "Buy $AGENT" goes. Defaults to the $AGENT token page's trade panel (or NEXT_PUBLIC_AGENT_BUY_URL). */
  buyHref?: string;
  /** Jupiter's swap page for the pair, offered as a second door when "Buy" stays on the site. Null hides it. */
  swapHref?: string | null;
  /** Tighter vertical padding for use inside another page's flow. */
  compact?: boolean;
  className?: string;
}

/** The pinned card: the live token when the build names one, the "coming soon" notice otherwise. */
export function FeaturedAgentCard({ token, ...rest }: FeaturedAgentCardProps) {
  if (!token) return <FeaturedAgentComingSoon compact={rest.compact} className={rest.className} />;
  return <FeaturedAgentLive token={token} {...rest} />;
}

function FeaturedAgentLive({
  token: configured,
  buyHref = AGENT_BUY_HREF ?? `/tokens/${configured.mint}/`,
  swapHref = AGENT_JUPITER_URL,
  compact = false,
  className,
}: FeaturedAgentCardProps & { token: FeaturedAgentToken }) {
  const { source, stats: live, pool, poolError, isLoading, isError } = useAgentToken(configured.mint);
  // A source that names the token (stonkfun) wins over the configured identity.
  const token: FeaturedAgentToken = live?.symbol
    ? { ...configured, symbol: live.symbol, name: live.name ?? configured.name }
    : configured;
  const network = useAgentNetworkData(token, live, pool);
  const quoteSymbol = live?.quoteSymbol ?? token.quoteSymbol;
  const viaStonkfun = source === 'stonkfun';
  const holders = live?.holders ?? network.holderCount;
  // The network token wears the brand mascot; the tracker image is what wallets and explorers show.
  const image = null;
  void live?.image;

  // USD when the quote has a USD price; otherwise the pool still gives the cap in the quote.
  const mcapQuote = live?.mcapQuote ?? null;
  // Four stats, always in this order; each reads "—" until its source serves it (the 24h pair needs an indexer over the pool).
  const stats: { label: FeaturedStatLabel; value: string; testId: string; tone?: 'up' | 'down' }[] = [
    {
      label: FEATURED_STAT_LABELS[0],
      value: live?.change24h != null ? formatChange(live.change24h) : STAT_PLACEHOLDER,
      testId: 'featured-change',
      tone: live?.change24h == null ? undefined : live.change24h >= 0 ? 'up' : 'down',
    },
    {
      label: FEATURED_STAT_LABELS[1],
      value:
        live?.mcapUsd != null
          ? formatUsdCompact(live.mcapUsd)
          : mcapQuote != null
            ? formatQuoteAmount(mcapQuote, quoteSymbol)
            : STAT_PLACEHOLDER,
      testId: 'featured-mcap',
    },
    {
      label: FEATURED_STAT_LABELS[2],
      value: live?.volume24h != null ? formatUsdCompact(live.volume24h) : STAT_PLACEHOLDER,
      testId: 'featured-volume',
    },
    {
      label: FEATURED_STAT_LABELS[3],
      value: holders != null ? formatCount(holders) : STAT_PLACEHOLDER,
      testId: 'featured-holders',
    },
  ];
  const external = /^https?:\/\//i.test(buyHref);

  return (
    <FeaturedFrame compact={compact} className={className}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* Identity */}
        <div className="flex items-center gap-3">
          {image ? (
            <img src={image} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" data-testid="featured-image" />
          ) : (
            <FeaturedMascot />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <FeaturedTitle symbol={token.symbol} />
              <NetworkTokenPill />
              {live?.graduated && (
                <span
                  className="rounded-full border border-accent-blue/30 bg-accent-blue/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent-blue"
                  data-testid="featured-graduated"
                >
                  Graduated
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
              <span>{token.name}</span>
              <span aria-hidden="true">·</span>
              <span>
                Paired with <span className="font-mono font-bold text-text-primary">${AGENT_PAIRED_WITH}</span>
              </span>
              <CopyAddressButton mint={token.mint} symbol={token.symbol} />
              {viaStonkfun && (
                <a
                  href={stonkfunTokenUrl(token.mint)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-5 items-center gap-1 rounded-[4px] border border-border-default px-1.5 font-mono text-[10px] uppercase tracking-wide text-text-tertiary no-underline transition-colors hover:border-accent-green/40 hover:text-accent-green"
                  title={`${token.symbol} on ${STONKFUN_NAME}`}
                  data-testid="featured-venue"
                >
                  via {STONKFUN_NAME} <span aria-hidden="true">↗</span>
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <dl className="flex flex-wrap gap-x-6 gap-y-3" aria-busy={isLoading} data-testid="featured-stats">
          {stats.map(s => (
            <StatTile key={s.label} label={s.label} value={s.value} tone={s.tone} testId={s.testId} />
          ))}
        </dl>

        {/* Buy: the token page's trade panel (in-app swap via stonkfun), with Jupiter's page as a second door. */}
        <div className="flex shrink-0 flex-col items-stretch gap-1.5 md:items-end">
          <Link
            href={buyHref}
            target={external ? '_blank' : undefined}
            rel={external ? 'noopener noreferrer' : undefined}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-accent-green px-5 text-sm font-bold uppercase tracking-wider text-black no-underline transition-all hover:shadow-[0_0_20px_rgba(0,255,0,0.4)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green"
            data-testid="featured-buy"
          >
            <Icon name="wallet" size="sm" /> Buy ${token.symbol}
          </Link>
          {!external && swapHref && (
            <a
              href={swapHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-center font-mono text-[11px] text-text-tertiary no-underline transition-colors hover:text-accent-green"
              data-testid="featured-swap-external"
            >
              or open on Jupiter <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      </div>

      {isError && (
        <p className="mt-3 font-mono text-[11px] text-accent-red" data-testid="featured-pool-error">
          {viaStonkfun
            ? `Could not reach ${STONKFUN_NAME} for $${token.symbol}`
            : `Could not read the $${token.symbol} pool on this network`}
          {poolError ? `: ${viaStonkfun ? poolError.message : describeChainError(poolError)}` : '.'}
        </p>
      )}
      {/* The burn ledger failing (an outage, or a tracker configured for another mint) is said the same way. */}
      {network.burnPlan.status === 'error' && (
        <p className="mt-3 font-mono text-[11px] text-accent-red" data-testid="featured-ledger-error">
          Could not read the ${token.symbol} burn ledger: {network.burnPlan.error.message}
        </p>
      )}

      <AgentTokenPanel token={token} data={network} className="mt-4 md:mt-5" />
    </FeaturedFrame>
  );
}
