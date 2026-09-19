/**
 * Agents — the gallery.
 *
 * Every token launched on the Network, from `GET /api/launches`, with the
 * legacy `GET /api/tokens` list merged in for the metrics it still carries.
 * `/tokens#launch` (the navbar's Launch link) opens the LaunchLab form on arrival; the empty state offers it too.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Container, EmptyState, FilterChip, Icon } from '@/components/ui';
import { useTranslation } from '@/providers/I18nProvider';
import { queryKeys } from '@/lib/api/keys';
import { launchKeys } from '@/lib/api/launches';
import { TOKEN_LIST_LIMIT } from '@/lib/api/tokens-list';
import { useWalletService } from '@/lib/wallet';
import { useExistingAgent } from '@/lib/api/hooks/use-existing-agent';
import { useToast } from '@/providers/ToastProvider';
import { recordTokenLaunch } from '@/lib/user-profile';
import type { LaunchedToken } from '@/components/features/token-wizard';
import { TokenCard } from './_components/TokenCard';
import { formatUsd } from './_lib/gallery-token';
import { FeaturedAgentCard } from '@/app/_components/FeaturedAgentCard';
import { featuredAgentToken } from '@/lib/agent-token';
import { useGallery } from './_lib/use-gallery';
import type { GalleryToken } from './_lib/gallery-token';
import Link from 'next/link';

const TokenWizard = dynamic(() => import('@/components/features/token-wizard').then(m => m.TokenWizard));

type StatusFilter = 'all' | 'curve' | 'graduated';
type DateFilter = 'all' | 'today' | 'week';
type SortBy = 'newest' | 'oldest' | 'marketCap';

/** The URL hash that opens the launch form on arrival: `/tokens#launch`. */
const LAUNCH_HASH = '#launch';

function isWithinDateFilter(launchedAt: string, filter: DateFilter): boolean {
  if (filter === 'all') return true;
  const diff = Date.now() - new Date(launchedAt).getTime();
  if (filter === 'today') return diff < 86_400_000;
  return diff < 604_800_000;
}

const marketCap = (token: GalleryToken): number => token.marketCapUsd ?? 0;
const launchedAt = (token: GalleryToken): number => new Date(token.launchedAt).getTime() || 0;

export default function AgentsPage() {
  const { t } = useTranslation();
  const { tokens, isLoading, launchesFailed, refetch } = useGallery();
  const wallet = useWalletService();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [showWizard, setShowWizard] = useState(false);
  const existingAgent = useExistingAgent();
  const { addToast } = useToast();
  const wizardOpenedAt = useRef(0);

  /* One agent per wallet. A wallet whose launch surfaces right after the form
     opens (the tracker answering a fresh connect) gets told instead of a form
     that would be refused; a launch made in the form itself is not touched. */
  useEffect(() => {
    if (!showWizard) return;
    if (wizardOpenedAt.current === 0) wizardOpenedAt.current = Date.now();
    if (!existingAgent || Date.now() - wizardOpenedAt.current > 15_000) return;
    setShowWizard(false);
    wizardOpenedAt.current = 0;
    if (typeof window !== 'undefined' && window.location.hash === LAUNCH_HASH) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    addToast({
      title: `This wallet already launched $${existingAgent.symbol}`,
      description: 'One agent per wallet. Open it from the header, or connect another wallet to launch again.',
      variant: 'info',
      autoDismiss: true,
      duration: 8_000,
    });
  }, [showWizard, existingAgent, addToast]);

  // /tokens#launch opens the form. The hash is left in place while the form is
  // open: rewriting the URL here makes the app router remount this page, which
  // resets the state and closes the form before it is seen. It is stripped when
  // the form closes, so a later reload does not reopen it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // On arrival, and again whenever the hash changes: the navbar's Launch link
    // sets the hash without remounting this page when it is already open.
    const openIfAsked = () => {
      if (window.location.hash === LAUNCH_HASH) setShowWizard(true);
    };
    openIfAsked();
    window.addEventListener('hashchange', openIfAsked);
    window.addEventListener('popstate', openIfAsked);
    return () => {
      window.removeEventListener('hashchange', openIfAsked);
      window.removeEventListener('popstate', openIfAsked);
    };
  }, []);

  const filtered = useMemo(() => {
    let result = tokens;
    if (statusFilter === 'curve') result = result.filter(t => !t.graduated);
    if (statusFilter === 'graduated') result = result.filter(t => t.graduated);
    result = result.filter(t => isWithinDateFilter(t.launchedAt, dateFilter));
    return [...result].sort((a, b) => {
      if (sortBy === 'marketCap') return marketCap(b) - marketCap(a);
      if (sortBy === 'oldest') return launchedAt(a) - launchedAt(b);
      return launchedAt(b) - launchedAt(a);
    });
  }, [tokens, statusFilter, dateFilter, sortBy]);

  const featured = useMemo(() => {
    if (tokens.length === 0) return [];
    return [...tokens].sort((a, b) => marketCap(b) - marketCap(a) || launchedAt(b) - launchedAt(a)).slice(0, 3);
  }, [tokens]);

  const existingSymbols = useMemo(() => tokens.map(t => t.symbol), [tokens]);

  const onWizardClose = useCallback(
    (launched?: LaunchedToken) => {
      setShowWizard(false);
      if (typeof window !== 'undefined' && window.location.hash === LAUNCH_HASH) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      if (!launched) return;
      recordTokenLaunch(launched, wallet.publicKey ?? null);
      void queryClient.invalidateQueries({ queryKey: launchKeys.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tokens.list(TOKEN_LIST_LIMIT) });
    },
    [queryClient, wallet.publicKey],
  );

  return (
    <div className="flex flex-col gap-4 py-4 pb-24 lg:pb-10" data-testid="tokens-page">
      {/* $AGENT — the Network's token. Pinned above everything; filters never touch it. */}
      <FeaturedAgentCard token={featuredAgentToken()} compact />

      <Container>
        <div className="mt-2" data-testid="tokens-hero">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-text-primary">
              <Icon name="rocket" className="text-accent-green" /> {t('agents.title')}
            </h1>
            <p className="mt-1 text-sm text-text-secondary">{t('agents.subtitle')}</p>
          </div>
        </div>

        {/* Trending: one compact row, swipeable on phones. */}
        <div className="mt-4 flex items-center gap-2" data-testid="tokens-trending">
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-text-secondary">{t('agents.trending')}</span>
          {isLoading ? (
            <div className="flex gap-2" data-testid="tokens-hero-loading">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-11 w-40 animate-pulse rounded-full border border-border-default bg-bg-secondary" />
              ))}
            </div>
          ) : featured.length > 0 ? (
            <div className="-mx-4 flex min-w-0 gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
              {featured.map((token, idx) => (
                <Link
                  key={token.mint}
                  href={`/tokens/${token.mint}/`}
                  data-testid={`featured-${token.mint}`}
                  className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-border-default bg-bg-secondary px-3 text-xs no-underline transition-colors hover:border-accent-green/50"
                >
                  <span className="font-mono font-semibold text-text-tertiary">#{idx + 1}</span>
                  <span className="font-mono font-bold text-accent-green">{token.symbol}</span>
                  {token.quoteSymbol && <span className="font-mono text-text-tertiary">/ {token.quoteSymbol}</span>}
                  <span className="font-mono tabular-nums text-text-primary">{formatUsd(token.marketCapUsd)}</span>
                  {token.curveProgressPct != null && (
                    <span className="font-mono tabular-nums text-text-tertiary">{Math.round(token.curveProgressPct)}%</span>
                  )}
                </Link>
              ))}
            </div>
          ) : launchesFailed ? (
            <span className="text-xs text-accent-yellow" role="status" data-testid="tokens-hero-unreachable">
              {t('agents.unreachable')}
            </span>
          ) : (
            <span className="text-xs text-text-tertiary">{t('agents.empty')}</span>
          )}
        </div>
      </Container>

      <Container>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border-default pb-4">
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortBy)}
            className="h-11 min-h-[44px] cursor-pointer rounded-md border border-border-default bg-bg-input px-3 text-sm text-text-primary"
            aria-label="Sort agents"
            data-testid="tokens-sort"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest first</option>
            <option value="marketCap">Market cap</option>
          </select>
          <div className="flex flex-wrap gap-2">
            <FilterChip label="All" active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
            <FilterChip label="On the curve" active={statusFilter === 'curve'} onClick={() => setStatusFilter('curve')} />
            <FilterChip label="Graduated" active={statusFilter === 'graduated'} onClick={() => setStatusFilter('graduated')} />
            <span className="h-6 w-px self-center bg-border-default" />
            <FilterChip label="All time" active={dateFilter === 'all'} onClick={() => setDateFilter('all')} />
            <FilterChip label="This week" active={dateFilter === 'week'} onClick={() => setDateFilter('week')} />
            <FilterChip label="Today" active={dateFilter === 'today'} onClick={() => setDateFilter('today')} />
          </div>
        </div>
      </Container>

      <Container>
        {launchesFailed && tokens.length > 0 && (
          <p className="mb-3 text-xs text-accent-yellow" role="status" data-testid="tokens-launches-failed">
            The launchpad list is not answering. Showing what the tracker still has.{' '}
            <button type="button" className="underline" onClick={refetch}>
              Retry
            </button>
          </p>
        )}
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="tokens-loading">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-48 animate-pulse rounded-lg border border-border-default bg-bg-secondary" />
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="token-grid">
            {filtered.map(token => (
              <TokenCard key={token.mint} token={token} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="search"
            title={tokens.length > 0 ? t('agents.noMatch') : launchesFailed ? t('agents.emptyTitle') : t('agents.empty')}
            description={
              tokens.length === 0 && launchesFailed ? (
                <span data-testid="tokens-empty-reason">{t('agents.unreachable')}</span>
              ) : undefined
            }
            data-testid="tokens-empty"
            action={
              tokens.length === 0 && launchesFailed ? (
                <Button variant="secondary" onClick={refetch} data-testid="tokens-empty-retry">
                  {t('agents.retry')}
                </Button>
              ) : tokens.length === 0 ? (
                <Button variant="primary" onClick={() => setShowWizard(true)} data-testid="tokens-empty-launch">
                  {t('agents.launch')}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={() => {
                    setStatusFilter('all');
                    setDateFilter('all');
                  }}
                  data-testid="tokens-reset-filters"
                >
                  {t('agents.showAll')}
                </Button>
              )
            }
          />
        )}
      </Container>

      {showWizard && <TokenWizard onClose={onWizardClose} existingSymbols={existingSymbols} />}
    </div>
  );
}
