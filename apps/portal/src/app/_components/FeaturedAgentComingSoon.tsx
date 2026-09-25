'use client';
/**
 * The $AGENT card before the token is live (`NEXT_PUBLIC_AGENT_MINT` empty):
 * the live card's frame and header, then ghost versions of its regions so
 * the page reads as intentional. The supply ring is a dim outline, the four
 * header stats and the ring read "soon", the flywheel block states the plan
 * in a sentence and the burn chart is a faint bar per day of the plan. It is
 * a preview, not a loading state: no spinner, no shimmer, and nothing is read
 * from the chain, stonkfun or the tracker. The header and the closing copy
 * are full contrast; the ghost regions use the muted tokens at reduced
 * opacity. Regions stack on phones the way the live card's do.
 */
import { config } from '@/config';
import { cn } from '@/lib/utils/cn';
import { RING_RADIUS, RING_VIEW } from '@/app/tokens/_components/BurnRing';
import { Eyebrow } from '@/app/tokens/_components/NetworkTokenPrimitives';
import { FEATURED_STAT_LABELS, FeaturedFrame, FeaturedMascot, FeaturedTitle, NetworkTokenPill, StatTile } from './FeaturedAgentFrame';

/** The card's symbol before the token is live. */
export const COMING_SOON_SYMBOL = 'AGENT';
/** What every ghost figure reads. */
export const COMING_SOON_VALUE = 'soon';
/** The flywheel in a sentence, as the live card will state it from the ledger. */
export const COMING_SOON_FLYWHEEL = '~0.05% of supply burns every hour for 15 days, plus 50% of platform fees. Live from launch day.';
/** The closing line under the ghost regions. */
/** One bar per day of the burn plan. */
export const COMING_SOON_BARS = 15;
/** Where "How the flywheel works" goes: the $AGENT page of the docs, at the burn section. */
export const FLYWHEEL_DOCS_PATH = '/guides/token-agents/#the-network-token-section';

/** "stonkagents" from https://x.com/stonkagents; the fixed handle when the URL names none. */
export function xHandle(url: string, fallback = 'stonkagents'): string {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop();
    return last ? last.replace(/^@/, '') : fallback;
  } catch {
    return fallback;
  }
}

export interface FeaturedAgentComingSoonProps {
  /** Tighter vertical padding for use inside another page's flow. */
  compact?: boolean;
  className?: string;
  /** The project's X profile. Empty renders no follow link. Defaults to config. */
  xUrl?: string;
  /** The docs page on the flywheel. Null renders no link. Defaults to config, hidden while docs are disabled. */
  flywheelDocsUrl?: string | null;
}

/** The live card's frame and header over ghost regions, saying the token is not live yet. Reads nothing. */
export function FeaturedAgentComingSoon({
  compact = false,
  className,
  xUrl = config.links.x,
  flywheelDocsUrl = config.features.docsEnabled ? `${config.links.docs}${FLYWHEEL_DOCS_PATH}` : null,
}: FeaturedAgentComingSoonProps) {
  return (
    <FeaturedFrame compact={compact} state="coming-soon" className={className}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* Identity: the same header row as the live card, the "Coming soon" pill in the accent colour. */}
        <div className="flex items-center gap-3">
          <FeaturedMascot />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <FeaturedTitle symbol={COMING_SOON_SYMBOL} />
              <NetworkTokenPill />
              <span
                className="rounded-full border border-accent-green/30 bg-accent-green/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-accent-green"
                data-testid="featured-coming-soon-badge"
              >
                Coming soon
              </span>
            </div>
            <div className="mt-0.5 text-xs text-text-secondary">StonkAgents</div>
          </div>
        </div>

        {/* The four stats, each reading "soon". */}
        <dl className="flex flex-wrap gap-x-6 gap-y-3 opacity-60" data-testid="featured-ghost-stats" aria-hidden="true">
          {FEATURED_STAT_LABELS.map(label => (
            <StatTile key={label} label={label} value={COMING_SOON_VALUE} muted testId="featured-ghost-stat" />
          ))}
        </dl>
      </div>

      {/* The panel: ring left, flywheel and chart right; stacked on phones. */}
      <div className="@container mt-4 border-t border-border-default pt-4 md:mt-5" data-testid="featured-ghost-panel">
        <div className="grid gap-4 @lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] @lg:gap-6">
          <div className="flex items-center justify-center opacity-60">
            <GhostRing />
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <div data-testid="featured-ghost-flywheel">
              <Eyebrow>Flywheel</Eyebrow>
              <p className="mt-0.5 font-mono text-[11px] leading-4 text-text-secondary">{COMING_SOON_FLYWHEEL}</p>
            </div>
            <GhostChart className="min-h-40 flex-1 opacity-60" />
          </div>
        </div>
      </div>

      {/* The two doors; the footer disappears when the build names neither. */}
      {(xUrl || flywheelDocsUrl) && (
        <div className="mt-4 border-t border-border-default pt-4" data-testid="featured-coming-soon">
          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
            {xUrl && (
              <a
                href={xUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[32px] items-center gap-1 whitespace-nowrap font-mono text-[11px] text-text-tertiary no-underline transition-colors hover:text-accent-green"
                data-testid="featured-coming-soon-follow"
              >
                Follow @{xHandle(xUrl)} <span aria-hidden="true">↗</span>
              </a>
            )}
            {flywheelDocsUrl && (
              <a
                href={flywheelDocsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[32px] items-center gap-1 whitespace-nowrap font-mono text-[11px] text-text-tertiary no-underline transition-colors hover:text-accent-green"
                data-testid="featured-coming-soon-docs"
              >
                How the flywheel works <span aria-hidden="true">↗</span>
              </a>
            )}
          </div>
        </div>
      )}
    </FeaturedFrame>
  );
}

/** The supply ring as a dim outline on the live ring's geometry, "Supply" and "Burned" both reading "soon". */
function GhostRing() {
  const c = RING_VIEW / 2;
  return (
    <div
      className="relative aspect-square w-full shrink-0"
      style={{ maxWidth: 300 }}
      data-testid="featured-ghost-ring"
      aria-hidden="true"
    >
      <svg viewBox={`0 0 ${RING_VIEW} ${RING_VIEW}`} width="100%" height="100%" className="block overflow-visible">
        {/* The live ring's track, with a dashed hairline where the burned arc will run. */}
        <circle cx={c} cy={c} r={RING_RADIUS} fill="none" stroke="var(--color-bg-tertiary)" strokeWidth={8} />
        <circle cx={c} cy={c} r={RING_RADIUS} fill="none" stroke="var(--color-border-hover)" strokeWidth={1} strokeDasharray="3 3" />
        {[0, 90, 180, 270].map(angle => (
          <line
            key={angle}
            x1={c}
            y1={c - RING_RADIUS - 7}
            x2={c}
            y2={c - RING_RADIUS - 4}
            stroke="var(--color-border-hover)"
            strokeWidth={1}
            transform={`rotate(${angle} ${c} ${c})`}
          />
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
        <div>
          <Eyebrow>Supply</Eyebrow>
          <p className="font-mono text-lg font-semibold leading-tight text-text-tertiary">{COMING_SOON_VALUE}</p>
        </div>
        <div>
          <Eyebrow>Burned</Eyebrow>
          <p className="font-mono text-lg font-semibold leading-tight text-text-tertiary">{COMING_SOON_VALUE}</p>
        </div>
      </div>
    </div>
  );
}

/** The burn chart's grid with a faint bar per day of the plan; no axis figures, no marker. */
function GhostChart({ className }: { className?: string }) {
  return (
    <figure className={cn('flex min-w-0 flex-col', className)} data-testid="featured-ghost-chart" aria-hidden="true">
      <div className="grid flex-1 grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        <div className="w-9" />
        <div className="relative min-h-0">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0 border-t border-dashed border-border-default" />
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border-default" />
            <div className="absolute inset-x-0 bottom-0 border-t border-border-hover" />
          </div>
          <ol className="absolute inset-0 m-0 flex list-none items-end gap-1 p-0 sm:gap-2" role="list">
            {Array.from({ length: COMING_SOON_BARS }, (_, i) => (
              <li key={i} className="relative flex h-full min-w-0 flex-1 flex-col justify-end" data-testid="featured-ghost-bar">
                <span
                  className="block w-full rounded-t-[2px] border border-b-0 border-dashed border-accent-green/25 bg-accent-green/[0.06]"
                  style={{ height: '55%' }}
                />
              </li>
            ))}
          </ol>
        </div>
      </div>
      <figcaption className="mt-1.5 flex justify-between gap-2 pl-11 font-mono text-[10px] uppercase tracking-wide text-text-tertiary">
        <span>day 1</span>
        <span>day {COMING_SOON_BARS}</span>
      </figcaption>
    </figure>
  );
}
