/**
 * Token detail: the holders.
 *
 * Total holders, how concentrated the top ten and the next hundred are, and
 * the full list largest first, paged. The bonding curve's vault, the creator
 * and the bound agent's wallet are labelled. When the RPC refuses a full scan
 * only the twenty largest accounts are known, and the panel says so.
 */

'use client';

import { useMemo, useState } from 'react';
import { explorerUrl } from '@/config';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils/cn';
import { formatPercent, formatTokenAmount, shortAddress } from '../_lib/detail-format';
import { concentration } from '../_lib/tape-stats';
import type { TokenHolder } from '../_lib/use-token-detail-data';
import { Chip, SectionCard } from './DetailPrimitives';

const HOLDERS_PAGE_SIZE = 25;

interface TokenHoldersProps {
  holders: TokenHolder[];
  supply: number | null;
  /** True when only the largest 20 accounts could be read. */
  capped: boolean;
  isLoading: boolean;
  error?: Error | null;
  /** The last refresh failed but an earlier list is still shown. */
  reconnecting?: boolean;
  tokenSymbol: string;
  creator?: string | null;
  /** Wallet of the bound agent, when the agent has one on chain. */
  agentWallet?: string | null;
  /** Rows shown before paging; the full list is the default. */
  compact?: boolean;
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">{label}</p>
      <p className="mt-0.5 font-mono text-base font-semibold text-text-primary">{value}</p>
      {hint && <p className="text-[11px] text-text-tertiary">{hint}</p>}
    </div>
  );
}

export function TokenHolders({
  holders,
  supply,
  capped,
  isLoading,
  error,
  reconnecting,
  tokenSymbol,
  creator,
  agentWallet,
  compact,
}: TokenHoldersProps) {
  const hardError = error && !reconnecting && holders.length === 0 ? error : null;
  const [page, setPage] = useState(0);
  const conc = useMemo(() => concentration(holders), [holders]);
  const pageSize = compact ? 10 : HOLDERS_PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(holders.length / pageSize));
  const current = Math.min(page, pages - 1);
  const rows = holders.slice(current * pageSize, current * pageSize + pageSize);
  const poolHeld = holders.filter(h => h.isPool).reduce((s, h) => s + h.amount, 0);

  return (
    <SectionCard
      title="Holders"
      flush
      aside={
        <span className="text-xs text-text-tertiary">
          {reconnecting && (
            <span className="mr-2 text-accent-yellow" data-testid="holders-reconnecting">
              reconnecting…
            </span>
          )}
          {supply != null ? `supply ${formatTokenAmount(supply)}` : ''}
        </span>
      }
      data-testid="token-holders"
    >
      {isLoading && !hardError && (
        <div className="space-y-2 p-4" data-testid="holders-loading">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-8 animate-pulse rounded bg-bg-tertiary" />
          ))}
        </div>
      )}

      {hardError && <p className="p-4 text-sm text-text-tertiary">Could not load holders yet. Retrying in the background.</p>}

      {!isLoading && !hardError && holders.length === 0 && (
        <EmptyState size="sm" title="No holders yet." data-testid="holders-empty" />
      )}

      {holders.length > 0 && (
        <>
          <div
            className="grid grid-cols-2 border-b border-border-default sm:grid-cols-4 sm:divide-x sm:divide-border-default"
            data-testid="holders-concentration"
          >
            <Figure
              label="Total holders"
              value={`${capped ? '≥ ' : ''}${conc.holders.toLocaleString()}`}
              hint={capped ? 'largest 20 accounts only' : 'wallets with a balance'}
            />
            <Figure label="Top 10 hold" value={formatPercent(conc.top10Pct)} hint="of circulating supply" />
            <Figure
              label="Next 100 hold"
              value={capped ? '-' : formatPercent(conc.next100Pct)}
              hint={capped ? 'needs the full list' : 'ranks 11-110'}
            />
            <Figure
              label="In the curve"
              value={supply && supply > 0 ? formatPercent((poolHeld / supply) * 100) : '-'}
              hint={`${formatTokenAmount(poolHeld)} ${tokenSymbol} unsold`}
            />
          </div>

          <table className="w-full text-xs">
            <thead className="text-left text-[11px] uppercase tracking-wide text-text-tertiary">
              <tr>
                <th className="px-4 py-2 font-medium">#</th>
                <th className="px-2 py-2 font-medium">Holder</th>
                <th className="px-2 py-2 text-right font-medium">{tokenSymbol}</th>
                <th className="px-4 py-2 text-right font-medium">Share</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {rows.map((holder, index) => (
                <tr key={holder.account} className="border-t border-border-default">
                  <td className="px-4 py-2 text-text-tertiary">{current * pageSize + index + 1}</td>
                  <td className="px-2 py-2">
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <a
                        href={explorerUrl('address', holder.owner)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-text-primary hover:text-accent-green"
                        title={holder.owner}
                      >
                        {shortAddress(holder.owner, 6, 4)}
                      </a>
                      {holder.isPool && (
                        <Chip tone="blue" className="font-sans">
                          Bonding curve
                        </Chip>
                      )}
                      {!holder.isPool && creator && holder.owner === creator && (
                        <Chip tone="yellow" className="font-sans">
                          Creator
                        </Chip>
                      )}
                      {!holder.isPool && agentWallet && holder.owner === agentWallet && (
                        <Chip tone="purple" className="font-sans">
                          Bound agent
                        </Chip>
                      )}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right text-text-secondary">{formatTokenAmount(holder.amount)}</td>
                  <td className="px-4 py-2 text-right text-text-primary">{formatPercent(holder.percent, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-border-default px-4 py-2 text-xs text-text-tertiary">
              <span>
                {current * pageSize + 1}-{Math.min(holders.length, (current + 1) * pageSize)} of {holders.length}
              </span>
              <span className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={current === 0}
                  className={cn('rounded px-2 py-0.5 hover:text-text-primary disabled:opacity-40')}
                >
                  ← Prev
                </button>
                <button
                  type="button"
                  onClick={() => setPage(p => Math.min(pages - 1, p + 1))}
                  disabled={current >= pages - 1}
                  className="rounded px-2 py-0.5 hover:text-text-primary disabled:opacity-40"
                >
                  Next →
                </button>
              </span>
            </div>
          )}
          {capped && (
            <p className="border-t border-border-default px-4 py-2 text-[11px] text-text-tertiary">
              This RPC does not allow a full account scan, so only the twenty largest accounts are listed.
            </p>
          )}
        </>
      )}
    </SectionCard>
  );
}
