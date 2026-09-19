/**
 * Purpose: Hero section wrapper — routes the two-step product:
 *          `launch` (Step 1 Launchpad) → `agent` (Step 2 run your agent) → `live`.
 *          Daemon crashed/reconnecting stay sub-states and win over the phase.
 */
'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Container } from '@/components/ui';
import { NetworkMap } from '@/components/features/network-map';
import { HeroLaunchpad } from './HeroLaunchpad';
import { HeroAgentStep } from './HeroAgentStep';
import { HeroConnectedHome } from './HeroConnectedHome';
import { HeroDaemonCrashed } from './HeroDaemonCrashed';
import { HeroDaemonReconnecting } from './HeroDaemonReconnecting';
import { MobileAgentStep } from './MobileAgentStep';
import { ActionCard } from './ActionCard';
import { useDeviceType } from '@/lib/hooks/use-device-type';
import type { HomePageState } from './useHomePage';

type HeroSectionProps = Pick<
  HomePageState,
  | 'phase'
  | 'installStep'
  | 'installTimeout'
  | 'setInstallTimeout'
  | 'installStartRef'
  | 'installerUnlocked'
  | 'os'
  | 'downloadUrl'
  | 'downloads'
  | 'handleDownload'
  | 'copied'
  | 'handleCopy'
  | 'showWizard'
  | 'setShowWizard'
  | 'launchedToken'
  | 'storedLaunch'
  | 'launchRecord'
  | 'launchVerification'
  | 'walletConnected'
  | 'creditsGranted'
  | 'handleRestart'
  | 'handleCancelReconnect'
  | 'reconnectAttempt'
  | 'maxReconnectAttempts'
  | 'lastSeenAt'
  | 'tokenMetrics'
  | 'openLaunch'
  | 'existingAgent'
  | 'claimStatus'
  | 'setup'
  | 'agentStage'
  | 'confirmSetup'
  | 'manifestState'
  | 'retryDownloads'
>;

export function HeroSection(props: HeroSectionProps) {
  const { phase, installStep, handleRestart, handleCancelReconnect, reconnectAttempt, maxReconnectAttempts, lastSeenAt } = props;
  const { isMobile } = useDeviceType();
  const [actionCardDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('stonkagents:action-card-dismissed') === 'true';
  });

  function renderHero() {
    /* Daemon failure states outrank the phase — the user needs the agent back first. */
    if (installStep === 'crashed') return <HeroDaemonCrashed onRestart={handleRestart} lastSeenAt={lastSeenAt} />;
    if (installStep === 'reconnecting') {
      return <HeroDaemonReconnecting attempt={reconnectAttempt} maxAttempts={maxReconnectAttempts} onCancel={handleCancelReconnect} />;
    }

    /* Phones can launch; the agent itself installs from a desktop. */
    if (isMobile && phase === 'agent')
      return <MobileAgentStep downloads={props.downloads} tokenSymbol={props.launchedToken?.ticker ?? null} />;

    switch (phase) {
      case 'launch':
        return (
          <HeroLaunchpad
            onLaunch={() => void props.openLaunch()}
            checking={props.launchVerification === 'checking'}
            existingAgent={props.existingAgent}
          />
        );
      case 'agent':
        return <HeroAgentStep {...props} />;
      case 'live':
      default:
        return <HeroConnectedHome {...props} />;
    }
  }

  const showActionCard = phase === 'live' && !actionCardDismissed;

  // Single layout: main card (fixed width on desktop) + optional action card. No layout switch = no map shift.
  // pointer-events: the Container spans the hero, so it must let hovers through to the map except on the cards.
  const mainCardClass =
    'pointer-events-auto bg-bg-void/90 border border-[rgba(30,37,48,0.6)] rounded-lg p-4 md:bg-bg-void/[0.93] md:p-6';
  const actionCardSlotClass =
    'pointer-events-auto w-[280px] shrink-0 self-start hidden lg:block bg-bg-void/[0.93] border border-[rgba(30,37,48,0.6)] rounded-xl px-4 py-3.5';

  return (
    <section className="relative overflow-hidden md:flex md:min-h-[calc(100vh-56px)] md:items-center" data-testid="home-hero">
      <NetworkMap
        variant="hero"
        className="network-map-home"
        projectionOffset={isMobile ? [0, -120] : [220, -30]}
        fill={isMobile ? 'contain' : 'cover'}
      />

      <Container className="relative z-10 pt-[148px] pb-6 md:py-20 pointer-events-none">
        {isMobile ? (
          <div className={cn('max-w-[560px] mx-auto', mainCardClass)}>{renderHero()}</div>
        ) : (
          <div className="flex items-start gap-4" data-testid="hero-two-col">
            <div className={cn('w-full max-w-[440px] shrink-0', mainCardClass)}>{renderHero()}</div>
            {showActionCard && (
              <div className={actionCardSlotClass} data-testid="action-card-slot">
                <ActionCard launchedToken={props.launchedToken} walletConnected={props.walletConnected} agentLive={phase === 'live'} />
              </div>
            )}
          </div>
        )}
      </Container>
    </section>
  );
}
