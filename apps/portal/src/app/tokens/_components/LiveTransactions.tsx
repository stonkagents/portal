/**
 * Token detail: the trades tape inside the Trades tab.
 *
 * The newest 150 trades from the tape (`useTokenTape`, fed by
 * `useTokenTransactions`), paged 25 at a time and filtered by side and size:
 * age, side, usd, both legs, price, wallet, tx. Page one flows live; paging
 * back freezes the list so rows do not shift underfoot, and a filter change
 * rejoins the live stream. A row younger than a few seconds flashes as fresh.
 */

'use client';

import { useState } from 'react';
import type { TokenTxItem } from '@/lib/api/hooks/use-token-transactions';
import { explorerUrl } from '@/config';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils/cn';
import { formatDenominated, formatTokenAmount, shortAddress, type Denomination } from '../_lib/detail-format';
import { SectionCard } from './DetailPrimitives';
import './trades-tape.css';

type TradeFilter = 'all' | 'buys' | 'sells' | 'whales';
type SideFilter = Exclude<TradeFilter, 'whales'>;

/** A trade at or above this USD size counts as a big (whale) trade. */
const WHALE_USD = 1_000;
/** A row younger than this is drawn as fresh. */
const FRESH_MS = 4_000;
/** Rows per page of the tape. */
const TAPE_PAGE = 25;
/** The tape keeps only the newest trades. */
const TAPE_MAX = 150;

const SIDES: readonly { id: SideFilter; label: string; tone?: 'up' | 'dn' }[] = [
  { id: 'all', label: 'all' },
  { id: 'buys', label: 'buys', tone: 'up' },
  { id: 'sells', label: 'sells', tone: 'dn' },
];

interface LiveTransactionsProps {
  trades: TokenTxItem[];
  isLoading: boolean;
  isFetching?: boolean;
  error?: Error | null;
  /** The last refresh failed but earlier rows are still shown. */
  reconnecting?: boolean;
  refetch: () => void;
  tokenSymbol: string;
  quoteSymbol: string | null;
  quoteUsd?: number | null;
  denomination?: Denomination;
  /** Rows per page; defaults to the tape's 25. */
  initialRows?: number;
}

interface FilterOptions {
  /** The big-trade threshold, in USD (or in the quote asset when falling back). */
  bigUsd?: number;
  /** Without a USD price, size big trades by their quote amount instead of dropping them all. */
  quoteFallback?: boolean;
}

const sideLabel: Record<TokenTxItem['type'], string> = { buy: 'buy', sell: 'sell', unknown: 'tx' };

/** The trade's size in USD, or null when the quote has no price or the leg was not found. */
function usdOf(tx: TokenTxItem, quoteUsd: number | null | undefined): number | null {
  if (tx.amountQuote == null || quoteUsd == null || !Number.isFinite(quoteUsd)) return null;
  return tx.amountQuote * quoteUsd;
}

/** Apply one of the tape filters. Pure, so it is tested. */
export function filterTrades(
  trades: readonly TokenTxItem[],
  filter: TradeFilter,
  quoteUsd: number | null | undefined,
  options: FilterOptions = {},
): TokenTxItem[] {
  const { bigUsd = WHALE_USD, quoteFallback = false } = options;
  switch (filter) {
    case 'buys':
      return trades.filter(t => t.type === 'buy');
    case 'sells':
      return trades.filter(t => t.type === 'sell');
    case 'whales':
      if (quoteUsd == null && quoteFallback) return trades.filter(t => t.amountQuote != null && t.amountQuote >= bigUsd);
      return trades.filter(t => {
        const usd = usdOf(t, quoteUsd);
        return usd != null && usd >= bigUsd;
      });
    default:
      return [...trades];
  }
}

/** Which page numbers the pager shows: all of them up to seven, then the ends and the neighbours. */
export function pageItems(page: number, count: number): Array<number | 'gap'> {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const set = new Set<number>([1, count, page, page - 1, page + 1]);
  const items: Array<number | 'gap'> = [];
  let prev = 0;
  for (let i = 1; i <= count; i++) {
    if (!set.has(i)) continue;
    if (prev && i - prev > 1) items.push('gap');
    items.push(i);
    prev = i;
  }
  return items;
}

/** Tape age: 'now' · '12s' · '4m' · '3h' · '2d'; '-' without a block time. */
export function tapeAge(ms: number | null | undefined, now: number = Date.now()): string {
  if (ms == null || !Number.isFinite(ms)) return '-';
  const ago = Math.max(0, now - ms);
  if (ago < FRESH_MS) return 'now';
  const s = Math.floor(ago / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

/** "1.0K" style figure for the big-trade chip. */
function compactThreshold(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function LiveTransactions({
  trades,
  isLoading,
  isFetching,
  error,
  reconnecting,
  refetch,
  tokenSymbol,
  quoteSymbol,
  quoteUsd,
  denomination = 'quote',
  initialRows = TAPE_PAGE,
}: LiveTransactionsProps) {
  // A failure with rows already on screen is a reconnect, not an error.
  const hardError = error && !reconnecting && trades.length === 0 ? error : null;
  const [side, setSide] = useState<SideFilter>('all');
  const [bigOnly, setBigOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [frozen, setFrozen] = useState<TokenTxItem[] | null>(null);
  const quoteLabel = quoteSymbol ?? 'SOL';
  const hasUsd = quoteUsd != null && Number.isFinite(quoteUsd) && quoteUsd > 0;
  const pageSize = Math.max(1, initialRows);
  const now = Date.now();

  const live = trades.slice(0, TAPE_MAX);
  const all = frozen ?? live;
  const bySide = filterTrades(all, side, quoteUsd);
  const filtered = bigOnly ? filterTrades(bySide, 'whales', quoteUsd, { quoteFallback: true }) : bySide;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const goPage = (n: number) => {
    const next = Math.min(Math.max(1, n), pageCount);
    setFrozen(next === 1 ? null : (frozen ?? live));
    setPage(next);
  };
  const setFilter = (fn: () => void) => {
    fn();
    setPage(1);
    setFrozen(null);
  };

  const bigLabel = hasUsd ? `>$${compactThreshold(WHALE_USD)}` : `>${compactThreshold(WHALE_USD)} ${quoteLabel}`;
  const bigTitle = hasUsd
    ? `Trades of $${WHALE_USD.toLocaleString('en-US')} or more`
    : `No USD price for ${quoteLabel} yet; sized in ${quoteLabel} instead`;

  const showRows = !isLoading && !hardError;
  const showPager = showRows && trades.length > 0;

  return (
    <SectionCard flush data-testid="live-transactions">
      <div className="trades-tape" data-testid="trades-tape">
        <div className="tape-head">
          <span className="tape-sub">
            <span className={cn('tape-dot', reconnecting ? 'reconnecting' : isFetching && 'fetching')} aria-hidden="true" />
            recent trades ·{' '}
            {reconnecting ? (
              <span className="tape-reconnecting" data-testid="trades-reconnecting">
                reconnecting…
              </span>
            ) : (
              'live'
            )}
          </span>
          <span className="tape-filters" role="group" aria-label="trade filters">
            {SIDES.map(s => (
              <button
                key={s.id}
                type="button"
                className={cn('tape-chip tape-data', side === s.id && 'on', side === s.id && s.tone)}
                aria-pressed={side === s.id}
                onClick={() => setFilter(() => setSide(s.id))}
              >
                {s.label}
              </button>
            ))}
            <button
              type="button"
              className={cn('tape-chip tape-data', bigOnly && 'on')}
              aria-pressed={bigOnly}
              title={bigTitle}
              data-testid="trades-big-toggle"
              onClick={() => setFilter(() => setBigOnly(v => !v))}
            >
              {bigLabel}
            </button>
            <button type="button" className="tape-chip tape-data" onClick={refetch} disabled={isFetching}>
              {isFetching ? 'refreshing…' : 'refresh'}
            </button>
          </span>
        </div>

        {hardError ? (
          <div className="tape-empty" role="status">
            Could not load trades yet. Retrying in the background.
            <button type="button" className="tape-chip tape-data" onClick={refetch} disabled={isFetching}>
              retry
            </button>
          </div>
        ) : (
          <div
            className="tape-body"
            role="table"
            aria-label="trades"
            data-testid="live-transactions-list"
            data-frozen={frozen ? 'true' : undefined}
          >
            <div className="tape-tr tape-th tape-data" role="row">
              <span role="columnheader">age</span>
              <span role="columnheader">side</span>
              <span role="columnheader">usd</span>
              <span role="columnheader">{tokenSymbol}</span>
              <span role="columnheader" className="tape-hide-sm">
                {quoteLabel}
              </span>
              <span role="columnheader" className="tape-hide-sm">
                price
              </span>
              <span role="columnheader">wallet</span>
              <span role="columnheader">tx</span>
            </div>

            {isLoading && (
              <>
                {[1, 2, 3].map(i => (
                  <div key={i} className="tape-tr" aria-hidden="true">
                    {Array.from({ length: 8 }, (_, c) => (
                      <span key={c} className="tape-skeleton" />
                    ))}
                  </div>
                ))}
                <div className="tape-empty">loading the tape…</div>
              </>
            )}

            {showRows && rows.length === 0 && (
              <div className="tape-empty">
                <EmptyState
                  size="sm"
                  title={trades.length === 0 ? 'No trades yet.' : 'No trades match this filter.'}
                  description={trades.length === 0 ? 'The first swap will print here.' : undefined}
                  data-testid="tape-empty-state"
                />
              </div>
            )}

            {showRows &&
              rows.map(tx => {
                const isTrade = tx.type === 'buy' || tx.type === 'sell';
                const blockMs = tx.blockTime != null ? tx.blockTime * 1000 : null;
                const fresh = blockMs != null && now - blockMs < FRESH_MS;
                const usd = isTrade ? usdOf(tx, quoteUsd) : null;
                return (
                  <div
                    key={tx.signature}
                    className={cn('tape-tr tape-data', tx.type, fresh && 'fresh')}
                    role="row"
                    data-fresh={fresh || undefined}
                  >
                    <span role="cell">{tapeAge(blockMs, now)}</span>
                    <span role="cell" className="side">
                      {sideLabel[tx.type]}
                    </span>
                    <span role="cell">{usd != null ? `$${formatTokenAmount(usd)}` : '-'}</span>
                    <span role="cell">
                      {isTrade && tx.amountToken != null && tx.amountToken > 0 ? formatTokenAmount(tx.amountToken) : '-'}
                    </span>
                    <span
                      role="cell"
                      className="tape-hide-sm"
                      title={isTrade && tx.amountQuote == null ? `${quoteLabel} leg not found in this transaction` : undefined}
                    >
                      {isTrade && tx.amountQuote != null ? formatTokenAmount(tx.amountQuote, 4) : '-'}
                    </span>
                    <span role="cell" className="tape-hide-sm">
                      {tx.price != null ? formatDenominated(tx.price, denomination, null, quoteUsd, 'price') : '-'}
                    </span>
                    <span role="cell">
                      {tx.wallet ? (
                        <a
                          href={explorerUrl('address', tx.wallet)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="tape-link"
                          title={tx.wallet}
                        >
                          {shortAddress(tx.wallet)}
                        </a>
                      ) : (
                        '-'
                      )}
                    </span>
                    <span role="cell">
                      <a
                        href={explorerUrl('tx', tx.signature)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tape-link"
                        title={tx.signature}
                        aria-label="view transaction on the explorer"
                      >
                        ↗
                      </a>
                    </span>
                  </div>
                );
              })}
          </div>
        )}

        {showPager && (
          <nav className="tape-pager tape-data" aria-label="trade pages">
            <span data-testid="trades-page-range">
              {filtered.length ? (page - 1) * pageSize + 1 : 0}-{Math.min(filtered.length, page * pageSize)} of {filtered.length}
            </span>
            <div className="tape-pager-btns">
              <button
                type="button"
                className="tape-pg"
                onClick={() => goPage(page - 1)}
                disabled={page <= 1}
                aria-label="previous page"
              >
                ‹
              </button>
              {pageItems(page, pageCount).map((it, i) =>
                it === 'gap' ? (
                  <span key={`gap-${i}`} aria-hidden="true">
                    …
                  </span>
                ) : (
                  <button
                    key={it}
                    type="button"
                    className={cn('tape-pg', it === page && 'on')}
                    aria-current={it === page ? 'page' : undefined}
                    onClick={() => goPage(it)}
                  >
                    {it}
                  </button>
                ),
              )}
              <button
                type="button"
                className="tape-pg"
                onClick={() => goPage(page + 1)}
                disabled={page >= pageCount}
                aria-label="next page"
              >
                ›
              </button>
            </div>
          </nav>
        )}
      </div>
    </SectionCard>
  );
}
