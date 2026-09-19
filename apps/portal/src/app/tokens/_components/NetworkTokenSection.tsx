/**
 * The $AGENT detail page's "Network token" section: the burn panel — the
 * supply ring beside the burn chart and its four facts — under the launch-buy
 * line. Every figure is a chain or ledger read; nothing is rendered from a
 * default. Holders live in the Holders tab and the header's stat row.
 */

'use client';

import { AGENT_BURN_SCHEDULE, AGENT_LAUNCH_BUY_PCT, AGENT_VESTING } from '@/lib/agent-token';
import type { BurnPlan, LedgerState } from '@/lib/api/hooks/use-agent-ledgers';
import type { GalleryToken } from '../_lib/gallery-token';
import { SectionCard } from './DetailPrimitives';
import { BurnPanel } from './BurnPanel';
import { MonoTag } from './NetworkTokenPrimitives';

/**
 * "Launch buy 20% of supply: 15% to burn, 5% vested" — each clause only from
 * what the environment states; null when it states no launch buy at all.
 */
export function launchBuyLine(): string | null {
  if (AGENT_LAUNCH_BUY_PCT == null) return null;
  const parts: string[] = [];
  if (AGENT_BURN_SCHEDULE) parts.push(`${AGENT_BURN_SCHEDULE.totalPct}% to burn`);
  if (AGENT_VESTING) parts.push(`${AGENT_VESTING.teamPct}% vested`);
  return `Launch buy ${AGENT_LAUNCH_BUY_PCT}% of supply${parts.length > 0 ? `: ${parts.join(', ')}` : ''}`;
}

/** Whole tokens the team holds under the configured plan, or null without a plan or a supply. */
export function teamAllocationTokens(createdSupply: number | null): number | null {
  if (!AGENT_VESTING || createdSupply == null) return null;
  return (createdSupply * AGENT_VESTING.teamPct) / 100;
}

export interface NetworkTokenSectionProps {
  token: GalleryToken;
  /** Whole tokens the mint was created with, off the pool. Null until read. */
  createdSupply: number | null;
  currentSupply: number | null;
  burnPlan: LedgerState<BurnPlan>;
  /** The venue the figures come from, when it is not this site (stonkfun), as a small tag with its link. */
  venue?: { name: string; href: string } | null;
}

export function NetworkTokenSection({ token, createdSupply, currentSupply, burnPlan, venue = null }: NetworkTokenSectionProps) {
  const buyLine = launchBuyLine();
  const aside =
    buyLine || venue ? (
      <span className="hidden items-center gap-2 sm:inline-flex">
        {buyLine && <MonoTag testId="agent-launch-buy">{buyLine}</MonoTag>}
        {venue && (
          <a
            href={venue.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-5 items-center gap-1 rounded-[4px] border border-border-default px-1.5 font-mono text-[10px] uppercase tracking-wide text-text-tertiary no-underline transition-colors hover:border-accent-green/40 hover:text-accent-green"
            data-testid="network-token-venue"
          >
            via {venue.name} <span aria-hidden="true">↗</span>
          </a>
        )}
      </span>
    ) : undefined;

  return (
    <SectionCard title="Network token" aside={aside} data-testid="network-token-section">
      <BurnPanel
        symbol={token.symbol}
        totalSupply={createdSupply}
        currentSupply={currentSupply}
        plan={burnPlan}
        schedule={AGENT_BURN_SCHEDULE}
        launchedAt={token.launchedAt || null}
      />
    </SectionCard>
  );
}
