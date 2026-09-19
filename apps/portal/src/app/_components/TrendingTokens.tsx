/**
 * Story: Home — trending Agents
 * Purpose: The top agents by market cap, shown on the home page before Step 2 in
 *          every phase. Reads the same merged gallery the /tokens page caches;
 *          each card is the gallery's TokenCard and links to /tokens/<mint>.
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Container, EmptyState, Icon } from '@/components/ui';
import { useTranslation } from '@/providers/I18nProvider';
import { useGallery } from '@/app/tokens/_lib/use-gallery';
import { TokenCard } from '@/app/tokens/_components/TokenCard';
import { rankTrendingTokens, TRENDING_LIMIT } from './trending-tokens';

const GRID_CLASS = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3';

function CardSkeleton() {
  return (
    <div
      className="rounded-lg border border-border-default bg-bg-secondary p-4 animate-pulse space-y-3"
      data-testid="trending-skeleton"
    >
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-bg-tertiary" />
        <div className="space-y-1.5">
          <div className="h-3 w-16 rounded bg-bg-tertiary" />
          <div className="h-2.5 w-24 rounded bg-bg-tertiary" />
        </div>
      </div>
      <div className="h-2 w-full rounded bg-bg-tertiary" />
      <div className="grid grid-cols-2 gap-2">
        <div className="h-6 rounded bg-bg-tertiary" />
        <div className="h-6 rounded bg-bg-tertiary" />
      </div>
    </div>
  );
}

interface TrendingTokensProps {
  /** Opens the launch form (the same one the Launchpad hero opens). */
  onLaunch: () => void;
}

export function TrendingTokens({ onLaunch }: TrendingTokensProps) {
  /* isLoading is true only before the first answer; a refetch keeps the cards on screen. */
  const { t } = useTranslation();
  const { tokens, isLoading, isRefetching, launchesFailed } = useGallery();
  const trending = rankTrendingTokens(tokens);

  /* The outcome of the last COMPLETED fetch. React Query clears the error flag while a
     retry is in flight, which would flash "be the first" every cycle; hold the error
     until a fetch actually succeeds. */
  const [lastFetchFailed, setLastFetchFailed] = useState(false);
  useEffect(() => {
    if (!isRefetching && !isLoading) setLastFetchFailed(launchesFailed);
  }, [isRefetching, isLoading, launchesFailed]);
  const unreachable = launchesFailed || (isRefetching && lastFetchFailed);

  const nothingToShow = !isLoading && trending.length === 0;
  const showUnreachable = nothingToShow && unreachable;
  const showEmpty = nothingToShow && !unreachable;

  return (
    <section className="py-10 md:py-12 border-b border-border-default" id="trending-tokens" data-testid="trending-tokens">
      <Container>
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <h2 className="flex items-center gap-2 text-xl md:text-2xl font-bold text-text-primary m-0">
              <Icon name="trending-up" size="sm" className="text-accent-green" />
              {t('home.trending.title')}
            </h2>
            <p className="text-xs text-text-secondary mt-1">{t('home.trending.subline')}</p>
          </div>
          <Link
            href="/tokens"
            data-testid="trending-show-all"
            className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-accent-green border border-accent-green/30 rounded-lg hover:bg-accent-green/10 transition-colors min-h-[44px] no-underline whitespace-nowrap"
          >
            {t('home.trending.showAll')} <Icon name="arrow-right" size="sm" />
          </Link>
        </div>

        {isLoading ? (
          <div className={GRID_CLASS} data-testid="trending-loading">
            {Array.from({ length: TRENDING_LIMIT }, (_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : showUnreachable ? (
          <div
            className="rounded-lg border border-dashed border-accent-yellow/30 bg-accent-yellow/5 px-6 py-8 text-center"
            data-testid="trending-unreachable"
            role="status"
          >
            <Icon name="alert-triangle" size="lg" className="text-accent-yellow mx-auto mb-3" />
            <p className="text-sm text-text-secondary">{t('home.trending.unreachable')}</p>
          </div>
        ) : showEmpty ? (
          <EmptyState
            icon="rocket"
            title={t('home.trending.empty')}
            className="rounded-lg border border-dashed border-border-default bg-bg-secondary/60"
            data-testid="trending-empty"
            action={
              <button
                type="button"
                onClick={onLaunch}
                data-testid="trending-launch"
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-bold bg-accent-green text-black rounded-lg border-none cursor-pointer hover:shadow-[0_0_20px_rgba(0,255,0,0.4)] transition-[box-shadow] min-h-[44px]"
              >
                <Icon name="rocket" size="sm" />
                {t('home.trending.launch')}
              </button>
            }
          />
        ) : (
          <div className={GRID_CLASS} data-testid="trending-grid">
            {trending.map(token => (
              <TokenCard key={token.mint} token={token} />
            ))}
          </div>
        )}
      </Container>
    </section>
  );
}
