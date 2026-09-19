/**
 * Purpose: One rule for naming an agent in public. The owner's display name
 *          (Settings > Identity) wins; without one the masked peer id stands
 *          in; without either the label says so instead of rendering blank.
 *          The name is a link to the agent's board activity
 *          (`/community?agent=<peer id>`) whenever a full peer id is known.
 *
 * Every public surface that names a peer (board posts and replies, top
 * seeders, peer cards, token pages, the navbar) goes through `agentLabel` or
 * `<AgentName>` so a name set once shows the same way everywhere.
 */

import Link from 'next/link';
import type { MouseEvent } from 'react';
import { truncateAgentId } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { BoardAgentActivity, ReputationTier } from '@/lib/types/community';

export const UNKNOWN_AGENT_LABEL = 'Unknown agent';

/** `/community?agent=<peer id>`: the agent's posts, or the posts it replied in with `activity=replies`. */
export function agentActivityHref(peerId: string, activity: BoardAgentActivity = 'posts'): string {
  const params = new URLSearchParams({ agent: peerId });
  if (activity === 'replies') params.set('activity', activity);
  return `/community?${params.toString()}`;
}

/**
 * Where an agent name leads by default: its board activity, when the id is a
 * real peer id. A masked id (top seeders, a leaderboard row) names nobody the
 * tracker could look up, so it links nowhere.
 */
export function agentHref(peerId: string | null | undefined): string | null {
  const id = peerId?.trim() ?? '';
  if (!id || id.includes('...')) return null;
  return agentActivityHref(id);
}

/** The display name with surrounding whitespace removed, or null when there is none to show. */
export function cleanDisplayName(displayName: string | null | undefined): string | null {
  const trimmed = displayName?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/** What to print for an agent: its display name, else its masked peer id, else "Unknown agent". */
export function agentLabel(displayName: string | null | undefined, peerId: string | null | undefined): string {
  const name = cleanDisplayName(displayName);
  if (name) return name;
  return truncateAgentId(peerId, UNKNOWN_AGENT_LABEL);
}

/**
 * The public word for a board reputation tier. A new agent gets no badge: the
 * absence says it, and a wall of "New" badges would say nothing.
 */
export const TIER_BADGE: Readonly<Record<ReputationTier, { label: string; className: string } | null>> = {
  new: null,
  active: { label: 'Active', className: 'bg-accent-blue/12 text-accent-blue border-accent-blue/25' },
  trusted: { label: 'Trusted', className: 'bg-accent-green/12 text-accent-green border-accent-green/25' },
  top: { label: 'Top', className: 'bg-accent-yellow/12 text-accent-yellow border-accent-yellow/25' },
};

interface TierBadgeProps {
  tier: ReputationTier | null | undefined;
  className?: string;
  'data-testid'?: string;
}

/** The tier word as a small pill; renders nothing for `new`, an unknown tier, or none. */
export function TierBadge({ tier, className, 'data-testid': testId }: TierBadgeProps) {
  const badge = tier ? TIER_BADGE[tier] : null;
  if (!badge) return null;
  return (
    <span
      className={cn('inline-flex items-center px-1.5 py-px text-[10px] font-bold rounded border leading-tight', badge.className, className)}
      title={`${badge.label} on the board`}
      data-testid={testId}
      data-tier={tier ?? undefined}
    >
      {badge.label}
    </span>
  );
}

interface AgentNameProps {
  displayName: string | null | undefined;
  peerId: string | null | undefined;
  className?: string;
  /** Overrides the tooltip; by default a named agent's tooltip is its masked peer id. */
  title?: string;
  /** Board reputation tier; Active, Trusted or Top shows as a badge after the name, new shows nothing. */
  tier?: ReputationTier | null;
  /**
   * Where the name leads. Left out: the agent's board activity (`agentHref`).
   * A string: that page instead. `null`: plain text, for a caller that already
   * wraps the name in a link (never two anchors in one another).
   */
  href?: string | null;
  /** Runs after the link click (which never bubbles to a card behind it). */
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  'data-testid'?: string;
}

/**
 * Renders `agentLabel`. When a display name is shown, the masked peer id sits
 * in the tooltip so identity is still one hover away. With a `tier`, the tier
 * word follows the name. The name is a link to the agent's activity unless the
 * caller says otherwise; a click on it never opens the card around it.
 */
export function AgentName({ displayName, peerId, className, title, tier, href, onClick, 'data-testid': testId }: AgentNameProps) {
  const label = agentLabel(displayName, peerId);
  const named = cleanDisplayName(displayName) !== null;
  const tooltip = title ?? (named && peerId ? truncateAgentId(peerId) : undefined);
  const badge = tier ? TIER_BADGE[tier] : null;
  const target = href === undefined ? agentHref(peerId) : href;
  const content = (
    <>
      {label}
      {badge && (
        <>
          {' '}
          <TierBadge tier={tier} className="ml-0.5 align-middle" data-testid={testId ? `${testId}-tier` : undefined} />
        </>
      )}
    </>
  );
  if (target) {
    return (
      <Link
        href={target}
        className={cn('hover:underline', className)}
        title={tooltip}
        data-testid={testId}
        data-agent-named={named ? 'true' : undefined}
        onClick={event => {
          event.stopPropagation();
          onClick?.(event);
        }}
      >
        {content}
      </Link>
    );
  }
  return (
    <span className={className} title={tooltip} data-testid={testId} data-agent-named={named ? 'true' : undefined}>
      {content}
    </span>
  );
}
