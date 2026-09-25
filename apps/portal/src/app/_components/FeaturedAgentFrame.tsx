'use client';
/**
 * The skeleton the $AGENT card is built on, shared by the live card and the
 * "coming soon" preview so the two never drift: the section and its frame
 * (rounded, green top bar), the mascot avatar, the "Network's token" pill and
 * the stat tile with its four fixed labels. Layout only; nothing here reads.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { Container } from '@/components/ui';
import { ClawMascot } from '@/components/brand';

/** The four header stats, always in this order. */
export const FEATURED_STAT_LABELS = ['24h change', 'Market cap', '24h volume', 'Holders'] as const;
export type FeaturedStatLabel = (typeof FEATURED_STAT_LABELS)[number];

export interface FeaturedFrameProps {
  /** Tighter vertical padding for use inside another page's flow. */
  compact?: boolean;
  /** `data-state` on the section: the preview says "coming-soon"; the live card says nothing. */
  state?: 'coming-soon';
  className?: string;
  children: ReactNode;
}

/** The section, the container and the framed panel with its green top bar. */
export function FeaturedFrame({ compact = false, state, className, children }: FeaturedFrameProps) {
  return (
    <section
      className={cn(compact ? '' : 'border-b border-border-default', className)}
      aria-labelledby="featured-agent-title"
      data-testid="featured-agent-card"
      data-state={state}
    >
      <Container className={compact ? 'py-0' : 'py-6 md:py-8'}>
        <div className="relative overflow-hidden rounded-lg border border-accent-green/30 bg-bg-secondary/95 p-4 md:p-6">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-accent-green shadow-[0_0_12px_rgba(0,255,0,0.4)]" aria-hidden="true" />
          {children}
        </div>
      </Container>
    </section>
  );
}

/** The network token wears the brand mascot. */
export function FeaturedMascot() {
  return (
    <div
      aria-hidden="true"
      className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-bg-void"
      data-testid="featured-mascot"
    >
      <ClawMascot variant="online" size="md" className="h-full w-full scale-[1.1]" />
    </div>
  );
}

/** The card's title: "$AGENT". */
export function FeaturedTitle({ symbol }: { symbol: string }) {
  return (
    <h2 id="featured-agent-title" className="font-mono text-xl font-bold text-accent-green">
      ${symbol}
    </h2>
  );
}

/** "The Network's token" pill beside the title. */
export function NetworkTokenPill() {
  return (
    <span className="rounded-full border border-accent-purple/30 bg-accent-purple/10 px-2 py-0.5 text-[11px] font-semibold text-accent-purple">
      The Network&apos;s token
    </span>
  );
}

export interface StatTileProps {
  label: FeaturedStatLabel;
  value: ReactNode;
  tone?: 'up' | 'down';
  /** A placeholder value, drawn in the muted token. */
  muted?: boolean;
  testId: string;
}

/** One header stat: an uppercase label over a mono figure. */
export function StatTile({ label, value, tone, muted = false, testId }: StatTileProps) {
  return (
    <div className="min-w-[96px]">
      <dt className="text-[11px] uppercase tracking-wide text-text-tertiary">{label}</dt>
      <dd
        className={cn(
          'font-mono text-lg font-bold tabular-nums',
          muted
            ? 'text-text-tertiary'
            : tone === 'up'
              ? 'text-accent-green'
              : tone === 'down'
                ? 'text-accent-red'
                : 'text-text-primary',
        )}
        data-testid={testId}
      >
        {value}
      </dd>
    </div>
  );
}
