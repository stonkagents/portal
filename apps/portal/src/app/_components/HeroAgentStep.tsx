/**
 * Story: Home two-step flow — Step 2
 * Purpose: Agent-phase hero. The token card sits on top and the existing
 *          install flow below it gets the agent running and bound. The headline
 *          only calls the token "live on Raydium LaunchLab" once the tracker has
 *          confirmed the launch (status confirmed and a pool).
 */
'use client';

import { HeroInstallFlow } from './HeroInstallFlow';
import { TokenPerformanceCard } from './TokenPerformanceCard';
import { quoteSymbolForMint } from '@/lib/api/hooks/use-launch-detail';
import type { LaunchRecord } from '@/lib/api/launches';
import type { HomePageState } from './useHomePage';
import { StepBullets } from './StepBullets';

type Props = Pick<
  HomePageState,
  | 'installStep'
  | 'installTimeout'
  | 'setInstallTimeout'
  | 'installStartRef'
  | 'installerUnlocked'
  | 'os'
  | 'downloadUrl'
  | 'downloads'
  | 'handleDownload'
  | 'launchedToken'
  | 'storedLaunch'
  | 'launchRecord'
  | 'launchVerification'
  | 'tokenMetrics'
  | 'claimStatus'
  | 'setup'
  | 'agentStage'
  | 'confirmSetup'
  | 'manifestState'
  | 'retryDownloads'
>;

/* i18n: keys requested as home.agent.* (Track FE-1 owns src/lib/i18n). */
const VENUE_LABEL = 'Raydium LaunchLab';

/** Only a tracker-confirmed launch with a pool is "live on LaunchLab". */
export function isLiveOnLaunchLab(launch: LaunchRecord | null): boolean {
  return !!launch && launch.status === 'confirmed' && !!launch.pool_id;
}

export function HeroAgentStep({
  launchedToken,
  storedLaunch,
  launchRecord,
  launchVerification,
  tokenMetrics,
  ...installProps
}: Props) {
  const mint = launchedToken?.contractAddr ?? storedLaunch?.mint ?? null;
  const symbol = launchRecord?.symbol || launchedToken?.ticker || storedLaunch?.symbol || '';
  const quoteSymbol = storedLaunch?.quoteSymbol ?? quoteSymbolForMint(launchRecord?.quote_mint ?? storedLaunch?.quoteMint);
  const tickerLabel = symbol ? `$${symbol}` : 'Your token';
  const unreachable = launchVerification === 'unreachable';

  return (
    <div className="space-y-4 animate-fade-in-up" data-testid="hero-agent-step">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-text-primary m-0" data-testid="agent-step-headline">
          {isLiveOnLaunchLab(launchRecord)
            ? `${tickerLabel} is live on ${VENUE_LABEL}, now run its agent`
            : `${tickerLabel}, now run its agent`}
        </h2>
        <StepBullets active={2} />
        <p className="text-sm text-text-secondary mt-1">
          Install your agent on this machine and it binds to your token automatically.
        </p>
      </div>

      <TokenPerformanceCard
        mint={mint}
        launch={launchRecord}
        metrics={tokenMetrics?.data}
        isLoading={launchVerification === 'checking'}
        unreachable={unreachable}
        quoteSymbol={quoteSymbol}
        fallbackName={launchedToken?.name ?? storedLaunch?.name}
        fallbackSymbol={launchedToken?.ticker ?? storedLaunch?.symbol}
        fallbackImageUrl={
          launchedToken?.imageThumbUrl ?? launchedToken?.imageUrl ?? storedLaunch?.imageThumbUrl ?? storedLaunch?.imageUrl
        }
      />

      <HeroInstallFlow {...installProps} />
    </div>
  );
}
