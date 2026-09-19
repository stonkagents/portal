'use client';
/**
 * The network-token panel under the $AGENT card header: the burn panel (the
 * supply ring beside the burn chart and its four facts) under the launch-buy
 * line, read live from the chain (the mint, the LaunchLab pool, the holders)
 * and from the tracker's burn ledger. `useAgentNetworkData` gathers the reads
 * so the card header can share the holder count. $AGENT is a stonk.fun launch
 * with no transfer tax, so there is no fee flow to holders to draw.
 *
 * With the stonkfun source the burn ledger is stonkfun's flywheel burns
 * (`useStonkfunBurnPlan`) instead of the tracker's, and the created supply
 * is read back from the mint plus those burns; the holders are still the chain.
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils/cn';
import type { LaunchPoolState } from '@/lib/launchlab/pool-state';
import {
  AGENT_BURN_SCHEDULE,
  AGENT_SOURCE,
  AGENT_TOTAL_SUPPLY,
  type AgentTokenSource,
  type FeaturedAgentToken,
} from '@/lib/agent-token';
import type { AgentTokenStats } from '@/lib/api/hooks/use-agent-token';
import { ledgerForMint, useBurnPlan, type BurnPlan, type LedgerState } from '@/lib/api/hooks/use-agent-ledgers';
import { useStonkfunBurnPlan } from '@/lib/api/hooks/use-stonkfun-token';
import { useAllHolders, useMintInfo, type MintInfo } from '@/app/tokens/_lib/use-token-chain-data';
import { BurnPanel } from '@/app/tokens/_components/BurnPanel';
import { launchBuyLine } from '@/app/tokens/_components/NetworkTokenSection';
import { MonoTag } from '@/app/tokens/_components/NetworkTokenPrimitives';

export interface AgentNetworkData {
  mintInfo: MintInfo | null;
  pool: LaunchPoolState | null;
  burnPlan: LedgerState<BurnPlan>;
  /** Whole tokens the mint was created with: the pool's supply field, else what the environment states. Null until read. */
  createdSupply: number | null;
  /** Wallets with a balance, the curve's vault excluded. Null until the full list is read. */
  holderCount: number | null;
  /** Wallet that created the pool. */
  creatorWallet: string | null;
  /** ISO time the launch was recorded, when the tracker has a record; the burn schedule starts here unless configured otherwise. */
  launchedAt: string | null;
}

/** Every live read the panel needs beyond the pool, which `useAgentToken` already reads. */
export function useAgentNetworkData(
  token: FeaturedAgentToken,
  live: AgentTokenStats | null,
  pool: LaunchPoolState | null,
  source: AgentTokenSource = AGENT_SOURCE,
): AgentNetworkData {
  const viaStonkfun = source === 'stonkfun';
  const mintInfo = useMintInfo(token.mint);

  const poolAccounts = useMemo(() => {
    const accounts = [pool?.vaultBase, pool?.poolId ?? live?.poolId];
    return accounts.filter((value): value is string => Boolean(value));
  }, [pool?.vaultBase, pool?.poolId, live?.poolId]);
  const holders = useAllHolders(token.mint, mintInfo.data?.program, poolAccounts);
  // One ledger or the other; the one not in use stays idle. The tracker's ledger only counts
  // when it names this mint: another mint's burns are never laid over this mint's supply.
  const trackerPlan = ledgerForMint(useBurnPlan(!viaStonkfun), token.mint);
  const stonkfunPlan = useStonkfunBurnPlan(token.mint, mintInfo.data?.supply ?? null, viaStonkfun);
  const burnPlan = viaStonkfun ? stonkfunPlan : trackerPlan;

  const holderCount = holders.data && !holders.data.capped ? holders.data.holders.filter(h => !h.isPool).length : null;
  // The pool names the created supply; without one the environment may, and stonkfun's ledger reads it back off the mint.
  const ledgerSupply = viaStonkfun && burnPlan.status === 'ready' && burnPlan.data.total > 0 ? burnPlan.data.total : null;

  return {
    mintInfo: mintInfo.data ?? null,
    pool,
    burnPlan,
    createdSupply: pool && pool.supplyBase > 0 ? pool.supplyBase : (AGENT_TOTAL_SUPPLY ?? ledgerSupply),
    holderCount,
    creatorWallet: pool?.creator ?? live?.creatorWallet ?? null,
    launchedAt: live?.launchedAt ?? null,
  };
}

export interface AgentTokenPanelProps {
  token: FeaturedAgentToken;
  data: AgentNetworkData;
  className?: string;
}

/** The launch-buy line, then the burn panel: ring left, facts and chart right; stacked on phones. */
export function AgentTokenPanel({ token, data, className }: AgentTokenPanelProps) {
  const buyLine = launchBuyLine();
  return (
    <div className={cn('border-t border-border-default pt-4', className)} data-testid="agent-token-panel">
      {buyLine && (
        <div className="flex justify-end">
          <MonoTag testId="agent-launch-buy" wrap className="text-right">
            {buyLine}
          </MonoTag>
        </div>
      )}
      <BurnPanel
        symbol={token.symbol}
        totalSupply={data.createdSupply}
        currentSupply={data.mintInfo?.supply ?? null}
        plan={data.burnPlan}
        schedule={AGENT_BURN_SCHEDULE}
        launchedAt={data.launchedAt}
        className={buyLine ? 'mt-3' : undefined}
      />
    </div>
  );
}
