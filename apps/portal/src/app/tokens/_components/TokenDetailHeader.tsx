/**
 * Token detail page: the identity card.
 *
 * Image, name, $TICKER, the TICKER / QUOTE pair, curve status, the bound
 * agent, creator, age, contract address, socials and venue links. Price and
 * market cap sit on the right with a quote / USD toggle and flash on a tick.
 * The stats grid renders below it inside the same card.
 */

'use client';

import { Icon } from '@/components/ui';
import { ClawMascot } from '@/components/brand';
import { AGENT_MINT } from '@/lib/agent-token';
import { agentLabel } from '@/lib/agent-name';
import { config, explorerUrl } from '@/config';
import type { LaunchPoolState } from '@/lib/launchlab/pool-state';
import { dexscreenerUrl, raydiumTokenUrl } from '@/lib/launchlab/venues';
import { cn } from '@/lib/utils/cn';
import { formatUsd, truncateAddress, type GalleryToken } from '../_lib/gallery-token';
import { formatDenominated, timeAgo, type Denomination } from '../_lib/detail-format';
import type { TokenMetadata } from '../_lib/use-token-detail-data';
import { Chip, CopyAddress, LinkButton } from './DetailPrimitives';
import { PriceTicker } from './PriceTicker';
import { marketCapUsd } from './TokenDetailStats';

/** Past this share of the curve the status chip reads "Near graduation". */
export const NEAR_GRADUATION_PCT = 90;
/** A launch younger than this gets the "Just launched" chip. */
const JUST_LAUNCHED_MS = 10 * 60_000;

interface TokenDetailHeaderProps {
  token: GalleryToken;
  pool?: LaunchPoolState;
  quoteSymbol: string | null;
  quoteUsd?: number | null;
  metadata?: TokenMetadata | null;
  /** Last traded price off the tape, in quote; the pool's spot price is the fallback. */
  lastPrice?: number | null;
  denomination: Denomination;
  onDenominationChange: (next: Denomination) => void;
  /** The venue the figures come from when it is not this site (stonkfun): named in the platform chip, linked with the venues. */
  venue?: { name: string; href: string } | null;
  children?: React.ReactNode;
}

export function curveStatus(token: GalleryToken, pool?: LaunchPoolState): 'graduated' | 'near' | 'live' {
  if (pool?.graduated ?? token.graduated) return 'graduated';
  const pct = pool?.progressPct ?? token.curveProgressPct ?? 0;
  return pct >= NEAR_GRADUATION_PCT ? 'near' : 'live';
}

/** docs.<brand domain>, so a domain move is a config change. */
export function docsUrl(): string {
  return `https://docs.${config.brand.domain}`;
}

function DenominationToggle({
  value,
  onChange,
  quoteSymbol,
}: {
  value: Denomination;
  onChange: (d: Denomination) => void;
  quoteSymbol: string | null;
}) {
  return (
    <div className="inline-flex rounded-md bg-bg-tertiary p-0.5" role="radiogroup" aria-label="Denomination">
      {(['quote', 'usd'] as const).map(option => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => onChange(option)}
          className={cn(
            'rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase transition-colors',
            value === option ? 'bg-bg-secondary text-text-primary' : 'text-text-tertiary hover:text-text-primary',
          )}
        >
          {option === 'quote' ? (quoteSymbol ?? 'quote') : 'usd'}
        </button>
      ))}
    </div>
  );
}

export function TokenDetailHeader({
  token,
  pool,
  quoteSymbol,
  quoteUsd,
  metadata,
  lastPrice,
  denomination,
  onDenominationChange,
  venue = null,
  children,
}: TokenDetailHeaderProps) {
  const status = curveStatus(token, pool);
  const creator = pool?.creator ?? token.creator;
  const creatorIsWallet = token.source !== 'legacy' && creator.length > 0;
  const launchedAtMs = Date.parse(token.launchedAt);
  // An external pool has no record naming its launch time; the age line is left out rather than guessed.
  const hasLaunchedAt = Number.isFinite(launchedAtMs);
  const justLaunched = hasLaunchedAt && Date.now() - launchedAtMs < JUST_LAUNCHED_MS;
  // A pool under another platform's config (stonk.fun for $AGENT) says so.
  const external = token.source === 'external';
  const priceQuote = lastPrice ?? pool?.priceQuote ?? null;
  const mcap = marketCapUsd(token, pool, quoteUsd);
  // The cap in the quote: from the USD figure at the quote's price, else straight off the pool (no USD price needed).
  const mcapQuote =
    quoteUsd != null && quoteUsd > 0 && mcap != null
      ? mcap / quoteUsd
      : pool && pool.priceQuote > 0 && pool.supplyBase > 0
        ? pool.priceQuote * pool.supplyBase
        : null;
  const poolId = pool?.poolId ?? token.poolId;

  const priceText =
    priceQuote != null
      ? formatDenominated(priceQuote, denomination, quoteSymbol, quoteUsd, 'price')
      : token.priceUsd != null
        ? formatUsd(token.priceUsd)
        : '-';
  const mcapText =
    (denomination === 'usd' && mcap != null) || mcapQuote == null ? formatUsd(mcap) : formatDenominated(mcapQuote, 'quote', quoteSymbol, quoteUsd);

  return (
    <section className="overflow-hidden rounded-xl border border-border-default bg-bg-secondary" data-testid="token-detail-header">
      <div className="flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between md:gap-4 md:p-5">
        <div className="flex min-w-0 items-start gap-4">
          {token.imageUrl && token.mint !== AGENT_MINT ? (
            <img
              src={token.imageThumbUrl ?? token.imageUrl}
              alt={token.symbol}
              width={80}
              height={80}
              decoding="async"
              className="h-14 w-14 shrink-0 rounded-xl border border-border-default object-cover md:h-20 md:w-20"
            />
          ) : (
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border-default bg-bg-void md:h-20 md:w-20"
              data-testid="token-detail-mascot"
            >
              {/* The network token wears the mascot; other agents show their initials until they have an image. */}
              {token.mint === AGENT_MINT ? (
                <ClawMascot variant="online" size="md" className="h-full w-full scale-[1.1]" />
              ) : (
                <span className="text-xl font-bold text-accent-green">{token.symbol.slice(0, 2)}</span>
              )}
            </div>
          )}

          <div className="min-w-0">
            <div className="flex min-w-0 items-baseline gap-2">
              <h1 className="truncate text-xl font-bold tracking-tight text-text-primary md:text-2xl" title={token.name}>
                {token.name}
              </h1>
              <span className="shrink-0 font-mono text-sm font-semibold text-text-secondary md:text-base">${token.symbol}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {quoteSymbol && (
                <span
                  className="rounded-md border border-border-default px-1.5 py-0.5 font-mono text-[11px] text-text-tertiary"
                  data-testid="token-pair"
                >
                  {token.symbol} / {quoteSymbol}
                </span>
              )}
              <Chip
                tone={status === 'graduated' ? 'blue' : status === 'near' ? 'yellow' : 'green'}
                className="uppercase tracking-wide"
              >
                {status === 'graduated' ? 'Graduated' : status === 'near' ? 'Near graduation' : 'On the curve'}
              </Chip>
              {justLaunched && (
                <Chip tone="green" title="Launched in the last ten minutes; market data is still being indexed">
                  <Icon name="sparkles" size="sm" className="h-3.5 w-3.5" /> Just launched
                </Chip>
              )}
              {token.peerId ? (
                <Chip tone="purple" title={`Bound to agent ${token.peerId}`}>
                  <Icon name="bot" size="sm" className="h-3.5 w-3.5" />
                  <span data-testid="token-bound-agent-chip">
                    {token.peerDisplayName ? agentLabel(token.peerDisplayName, token.peerId) : 'Bound agent'}
                  </span>
                </Chip>
              ) : (
                token.source === 'launch' && <Chip tone="neutral">No agent yet</Chip>
              )}
              {external && (
                <span data-testid="token-platform-chip">
                  <Chip tone="neutral" title="A LaunchLab pool under another platform's config; trades go to that pool">
                    {pool?.platformName ? `on ${pool.platformName}` : venue ? `on ${venue.name}` : 'external pool'}
                  </Chip>
                </span>
              )}
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-secondary">
              {quoteSymbol && (
                <span className="inline-flex items-center gap-1" data-testid="token-quote-badge">
                  against <span className="font-semibold text-text-primary">${quoteSymbol}</span>
                </span>
              )}
              {token.quoteCategoryLabel && token.quoteCategory !== 'stonk' && (
                <Chip tone="neutral" className="font-medium">
                  {token.quoteCategoryLabel}
                </Chip>
              )}
              {creator && (
                <>
                  <span className="hidden text-text-tertiary md:inline">·</span>
                  <span className="hidden items-center gap-1 md:inline-flex">
                    by{' '}
                    {creatorIsWallet ? (
                      <CopyAddress
                        value={creator}
                        label={truncateAddress(creator)}
                        href={explorerUrl('address', creator)}
                        title="Creator wallet"
                        className="h-6"
                      />
                    ) : (
                      <span className="font-mono text-xs">{truncateAddress(creator)}</span>
                    )}
                  </span>
                </>
              )}
              {hasLaunchedAt && (
                <>
                  <span className="hidden text-text-tertiary md:inline">·</span>
                  <span title={token.launchedAt} data-testid="token-age">
                    launched {timeAgo(token.launchedAt)}
                  </span>
                </>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <CopyAddress
                value={token.mint}
                tag="CA"
                label={truncateAddress(token.mint)}
                href={explorerUrl('token', token.mint)}
                title="Open the mint on Solscan"
              />
              {metadata?.description && (
                <p className="w-full text-xs leading-5 text-text-tertiary line-clamp-2" title={metadata.description}>
                  {metadata.description}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-start gap-3 md:items-end">
          {/* Price and market cap side by side; the toggle drops to its own line on a phone when the figures need the width. */}
          <div className="flex w-full flex-wrap items-end gap-x-5 gap-y-2 md:w-auto md:flex-nowrap md:items-start">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Price</p>
              <PriceTicker
                value={priceQuote}
                text={priceText}
                className="whitespace-nowrap text-base font-semibold text-text-primary md:text-lg"
                data-testid="header-price"
              />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Market cap</p>
              <PriceTicker
                value={mcap ?? mcapQuote}
                text={mcapText}
                className="whitespace-nowrap text-base font-semibold text-text-primary md:text-lg"
                data-testid="header-mcap"
              />
            </div>
            <div className="ml-auto md:ml-0">
              <DenominationToggle value={denomination} onChange={onDenominationChange} quoteSymbol={quoteSymbol} />
            </div>
          </div>

          <div
            className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:justify-end md:px-0 md:pb-0"
            data-testid="token-venue-links"
          >
            {metadata?.website && (
              <LinkButton href={metadata.website}>
                <Icon name="globe" size="sm" /> Website
              </LinkButton>
            )}
            {metadata?.twitter && (
              <LinkButton href={metadata.twitter} label="Open X profile">
                <Icon name="x-twitter" size="sm" />
              </LinkButton>
            )}
            {metadata?.telegram && (
              <LinkButton href={metadata.telegram} label="Open Telegram">
                <Icon name="send" size="sm" />
              </LinkButton>
            )}
            {venue && (
              <span data-testid="token-venue-source">
                <LinkButton href={venue.href}>
                  {venue.name} <span aria-hidden>↗</span>
                </LinkButton>
              </span>
            )}
            <LinkButton href={explorerUrl('address', poolId ?? token.mint)}>
              Solscan <span aria-hidden>↗</span>
            </LinkButton>
            <a
              href={raydiumTokenUrl(token.mint)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-border-default bg-bg-tertiary px-3 text-sm font-semibold text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary"
              data-testid="token-venue-link"
            >
              Raydium <span aria-hidden>↗</span>
            </a>
            <LinkButton href={dexscreenerUrl(poolId ?? token.mint)}>
              DexScreener <span aria-hidden>↗</span>
            </LinkButton>
            <LinkButton href={docsUrl()}>
              Docs <span aria-hidden>↗</span>
            </LinkButton>
          </div>
        </div>
      </div>

      {children}
    </section>
  );
}
