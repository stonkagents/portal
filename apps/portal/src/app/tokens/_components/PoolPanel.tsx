/**
 * Token detail: "The pool" — the LaunchLab pool account. Ids, curve type,
 * status, graduation target, where liquidity migrates, vault balances.
 */

'use client';

import { explorerUrl } from '@/config';
import {
  CURVE_TYPE_LABELS,
  MIGRATE_TYPE_LABELS,
  POOL_STATUS_FUND_RAISING,
  POOL_STATUS_LABELS,
  type LaunchPoolState,
} from '@/lib/launchlab/pool-state';
import { jupiterSwapUrl, raydiumTokenUrl } from '@/lib/launchlab/venues';
import { formatQuoteAmount, truncateAddress, type GalleryToken } from '../_lib/gallery-token';
import { formatPercent, formatTokenAmount } from '../_lib/detail-format';
import { Chip, CopyAddress, SectionCard } from './DetailPrimitives';
import { Row } from './TokenPanel';

interface PoolPanelProps {
  token: GalleryToken;
  pool?: LaunchPoolState;
  poolError?: string | null;
  quoteSymbol: string | null;
  /** From the launch config, before the pool has answered. */
  configTarget?: number | null;
  configCurveType?: string | null;
}

export function PoolPanel({ token, pool, poolError, quoteSymbol, configTarget, configCurveType }: PoolPanelProps) {
  const poolId = pool?.poolId ?? token.poolId;
  const unit = quoteSymbol ?? null;
  const graduated = pool?.graduated ?? token.graduated;
  const target = pool?.targetQuote ?? token.quoteTarget ?? configTarget ?? null;

  if (token.source === 'legacy') {
    return (
      <SectionCard title="The pool" data-testid="pool-panel">
        <p className="text-sm text-text-tertiary">This token predates the launchpad; it has no LaunchLab pool.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="The pool"
      aside={
        <Chip tone={graduated ? 'blue' : 'green'} className="uppercase tracking-wide">
          {pool ? (POOL_STATUS_LABELS[pool.status] ?? `Status ${pool.status}`) : graduated ? 'Migrated' : 'Fund-raising'}
        </Chip>
      }
      data-testid="pool-panel"
    >
      {poolId && (
        <Row label="LaunchLab pool">
          <CopyAddress value={poolId} label={truncateAddress(poolId)} href={explorerUrl('address', poolId)} />
        </Row>
      )}
      {pool && (
        <Row label="Program">
          <CopyAddress value={pool.programId} label={truncateAddress(pool.programId)} href={explorerUrl('address', pool.programId)} />
        </Row>
      )}
      {pool && (
        <Row label="Platform config" testId="pool-platform">
          <span className="inline-flex items-center gap-1.5">
            {token.source === 'external' && (
              <Chip tone="neutral" className="font-sans" title="The pool was created under this platform's config, not ours; trades name it">
                {pool.platformName ?? 'external'}
              </Chip>
            )}
            <CopyAddress value={pool.platformId} label={truncateAddress(pool.platformId)} href={explorerUrl('address', pool.platformId)} />
          </span>
        </Row>
      )}
      {pool && (
        <Row label="Quote config">
          <CopyAddress value={pool.configId} label={truncateAddress(pool.configId)} href={explorerUrl('address', pool.configId)} />
        </Row>
      )}
      <Row label="Curve">
        <span className="font-mono">{pool ? (CURVE_TYPE_LABELS[pool.curveType] ?? `Type ${pool.curveType}`) : (configCurveType ?? '-')}</span>
      </Row>
      <Row label="Graduation target">
        <span className="font-mono">{formatQuoteAmount(target, unit)}</span>
        {pool && <span className="block text-[11px] text-text-tertiary">{formatPercent(pool.progressPct)} raised so far</span>}
      </Row>
      <Row label="Migrates to">
        <span className="font-mono">{pool ? (MIGRATE_TYPE_LABELS[pool.migrateType] ?? `Type ${pool.migrateType}`) : 'Raydium CPMM'}</span>
        {pool && pool.migrateFeeQuote > 0 && <span className="block text-[11px] text-text-tertiary">migration fee {formatQuoteAmount(pool.migrateFeeQuote, unit)}</span>}
      </Row>
      {pool && (
        <Row label="Vaults" testId="pool-vaults">
          <span className="font-mono">
            {formatQuoteAmount(pool.vaultQuoteBalance, unit)} · {formatTokenAmount(pool.vaultBaseBalance)} {token.symbol}
          </span>
          <span className="block text-[11px] text-text-tertiary">
            <a href={explorerUrl('address', pool.vaultQuote)} target="_blank" rel="noopener noreferrer" className="hover:text-accent-green">
              quote vault
            </a>
            {' · '}
            <a href={explorerUrl('address', pool.vaultBase)} target="_blank" rel="noopener noreferrer" className="hover:text-accent-green">
              token vault
            </a>
          </span>
        </Row>
      )}
      {pool && pool.totalLockedBase > 0 && (
        <Row label="Locked for creator">
          <span className="font-mono">
            {formatTokenAmount(pool.totalLockedBase)} {token.symbol}
          </span>
        </Row>
      )}
      {pool && pool.status !== POOL_STATUS_FUND_RAISING && (
        <div className="border-t border-border-default pt-2.5">
          <p className="mb-1.5 text-xs text-text-tertiary">Trades on Raydium now</p>
          <div className="flex flex-wrap gap-2 text-xs">
            <a href={raydiumTokenUrl(token.mint)} target="_blank" rel="noopener noreferrer" className="text-accent-green hover:underline" data-testid="pool-cpmm-link">
              Raydium pool ↗
            </a>
            <a href={jupiterSwapUrl(pool.quoteMint, token.mint)} target="_blank" rel="noopener noreferrer" className="text-accent-green hover:underline">
              Jupiter ↗
            </a>
          </div>
        </div>
      )}
      {!pool && poolError && <p className="border-t border-border-default pt-2.5 text-[11px] text-accent-red">Could not read the pool: {poolError}</p>}
    </SectionCard>
  );
}
