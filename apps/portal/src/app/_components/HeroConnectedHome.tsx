/**
 * Story: Home two-step flow — done
 * Purpose: Connected home — the agent is live and bound to the launched token.
 *          Shows the celebration banner (credits granted on bind), the tracker-backed
 *          token card, mint + external links, and the credits/social row.
 *          Without a token it falls back to the two action cards; the phase router
 *          normally never gets here without one.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { truncateAgentId } from '@/lib/utils/format';
import { Icon } from '@/components/ui';
import { CreditsCompactRow } from './CreditsCompactRow';
import { TokenPerformanceCard } from './TokenPerformanceCard';
import { explorerUrl } from '@/config';
import { useDaemon } from '@/providers/DaemonProvider';
import { useBoardStats } from '@/lib/api/hooks/use-board-stats';
import { useAgentIdentity } from '@/lib/api/hooks/use-agent-identity';
import { cleanDisplayName } from '@/lib/agent-name';
import { quoteSymbolForMint } from '@/lib/api/hooks/use-launch-detail';
import type { HomePageState } from './useHomePage';

type Props = Pick<HomePageState, 'copied' | 'handleCopy' | 'showWizard' | 'setShowWizard' | 'launchedToken' | 'tokenMetrics'> & {
  /** Tracker record for the launch, as useHomePage verified it. */
  launchRecord?: HomePageState['launchRecord'];
  launchVerification?: HomePageState['launchVerification'];
  /** Per-wallet launch record; carries the quote symbol when the launch flow knew it. */
  storedLaunch?: HomePageState['storedLaunch'];
  /** Credits the tracker granted when the agent bound this launch. */
  creditsGranted?: number | null;
};

/* i18n: keys requested as home.live.* (Track FE-1 owns src/lib/i18n). */
const SHARE_HANDLE = '@stonkagents';

/** Dismissible one-time celebration banner (localStorage-backed) */
function CelebrationBanner({ creditsGranted }: { creditsGranted: number | null }) {
  const [show, setShow] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !localStorage.getItem('stonkagents:celebration-dismissed');
  });

  if (!show) return null;

  function dismiss() {
    localStorage.setItem('stonkagents:celebration-dismissed', 'true');
    setShow(false);
  }

  /* The reward is granted when the agent binds the launch, so the tracker's number wins. */
  const creditsLabel = creditsGranted != null && creditsGranted > 0 ? `${creditsGranted} AI credits` : 'AI credits';

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-md bg-accent-green/8 border border-accent-green/20 text-xs text-accent-green animate-fade-in-up"
      data-testid="celebration-banner"
    >
      <Icon name="check-circle" size="sm" />
      <span className="font-semibold flex-1">Token launched! You earned {creditsLabel} + Founding Agent status.</span>
      <button
        data-testid="celebration-dismiss"
        onClick={dismiss}
        className="bg-transparent border-none text-accent-green/50 hover:text-accent-green cursor-pointer p-1 min-w-[44px] min-h-[44px] flex items-center justify-center"
        aria-label="Dismiss"
      >
        <Icon name="x" size="sm" />
      </button>
    </div>
  );
}

export function HeroConnectedHome({
  copied,
  handleCopy,
  launchedToken,
  setShowWizard,
  tokenMetrics,
  storedLaunch = null,
  launchRecord = null,
  launchVerification = 'none',
  creditsGranted = null,
}: Props) {
  const { health } = useDaemon();
  const { data: boardStats } = useBoardStats();
  const { data: identity } = useAgentIdentity();
  const { peerId } = health;
  const displayPeerId = truncateAgentId(peerId);
  const displayName = cleanDisplayName(identity?.displayName);
  const peersOnline = boardStats?.online_peers ?? 0;

  const mint = launchedToken?.contractAddr ?? null;
  const launch = launchRecord;
  const ticker = launch?.symbol || launchedToken?.ticker || '';
  const quoteSymbol = storedLaunch?.quoteSymbol ?? quoteSymbolForMint(launch?.quote_mint ?? storedLaunch?.quoteMint);

  return (
    <div className="space-y-2.5 animate-fade-in-up" data-testid="connected-home">
      {/* Connected header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-accent-green shadow-[0_0_8px_var(--color-accent-green)] animate-daemon-pulse shrink-0" />
          <h3 className="text-base font-bold text-text-primary m-0 whitespace-nowrap">Your Agent is Live!</h3>
          <span className="text-[11px] text-text-secondary font-normal whitespace-nowrap">· {peersOnline.toLocaleString()} peers</span>
        </div>
        {launchedToken ? (
          <span className="text-[11px] font-semibold text-accent-purple bg-accent-purple/10 border border-accent-purple/30 rounded-full px-2.5 py-0.5 inline-flex items-center gap-1 whitespace-nowrap shrink-0">
            <Icon name="crown" size="sm" /> Founding Agent
          </span>
        ) : (
          <span className="text-[11px] font-semibold text-accent-green bg-accent-green/8 border border-accent-green/30 rounded-full px-2.5 py-0.5 whitespace-nowrap shrink-0">
            Free Tier
          </span>
        )}
      </div>

      {/* Agent ID */}
      <div
        className="flex items-center gap-2 bg-bg-tertiary border border-border-default rounded-md px-2.5 py-1.5"
        data-testid="agent-id-display"
      >
        <div className="flex-1 min-w-0">
          {displayName && (
            <span className="text-sm font-semibold text-text-primary truncate block" data-testid="agent-display-name">
              {displayName}
            </span>
          )}
          <span className="text-[11px] text-text-secondary uppercase tracking-[0.08em] block mb-0.5">Agent ID</span>
          <span className="text-sm font-mono text-text-primary truncate block">{displayPeerId}</span>
        </div>
        <button
          onClick={() => peerId && handleCopy(peerId)}
          className="p-1 min-w-[44px] min-h-[44px] inline-flex items-center justify-center bg-transparent border-none text-text-secondary hover:text-accent-green cursor-pointer"
          title="Copy Agent ID"
          data-testid="agent-id-copy"
        >
          <Icon name={copied ? 'check' : 'copy'} size="sm" />
        </button>
      </div>

      {launchedToken && mint ? (
        <>
          {/* Celebration banner — shows once, then persists dismissal in localStorage */}
          <CelebrationBanner creditsGranted={creditsGranted} />

          {/* Token card (tracker identity + tracker metrics) with mint and external links */}
          <div className="space-y-2" data-testid="token-launched-card">
            <TokenPerformanceCard
              mint={mint}
              launch={launch}
              metrics={tokenMetrics?.data}
              isLoading={launchVerification === 'checking'}
              unreachable={launchVerification === 'unreachable'}
              quoteSymbol={quoteSymbol}
              fallbackName={launchedToken.name}
              fallbackSymbol={launchedToken.ticker}
              fallbackImageUrl={launchedToken.imageThumbUrl ?? launchedToken.imageUrl ?? launchedToken.imageDataUrl ?? undefined}
            />

            {/* Mint address (inline) */}
            <div className="flex items-center gap-1" data-testid="mint-inline">
              <span className="text-[11px] text-text-tertiary uppercase whitespace-nowrap">Mint:</span>
              <span className="flex-1 text-xs text-text-secondary font-mono overflow-hidden text-ellipsis whitespace-nowrap">
                {mint}
              </span>
              <button
                onClick={() => handleCopy(mint)}
                className="shrink-0 bg-transparent border-none text-text-tertiary hover:text-accent-green cursor-pointer flex items-center justify-center transition-colors min-w-[44px] min-h-[44px]"
                title="Copy address"
                data-testid="copy-contract-addr"
              >
                <Icon name={copied ? 'check' : 'copy'} size="sm" />
              </button>
            </div>

            {/* External links */}
            <div className="grid grid-cols-2 gap-1.5" data-testid="links-row">
              <a
                href={explorerUrl('token', mint)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-1 py-1.5 rounded-[5px] border border-accent-green/15 text-text-secondary text-[11px] font-semibold bg-accent-green/3 hover:border-accent-green hover:text-accent-green transition-all min-h-[44px] cursor-pointer no-underline"
                data-testid="view-solscan"
              >
                Solscan
              </a>
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                  `Just launched $${ticker} on ${SHARE_HANDLE}! Founding Agent status secured.`,
                )}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-1 py-1.5 rounded-[5px] border border-accent-blue/20 text-accent-blue text-[11px] font-semibold bg-accent-blue/5 hover:bg-accent-blue/12 hover:border-accent-blue/40 transition-all min-h-[44px] cursor-pointer no-underline"
                data-testid="share-x"
              >
                Share on X
              </a>
            </div>
          </div>

          {/* Credits & Social connections (compact row with expandable dots) */}
          <CreditsCompactRow />
        </>
      ) : (
        <>
          {/* No token: two action cards — Agent chat + Agent Tokens */}
          <div className="grid grid-cols-1 gap-2.5" data-testid="action-cards">
            <Link
              href="/chat"
              className="flex items-center gap-3 p-3.5 rounded-lg border border-accent-green/25 bg-accent-green/5 hover:bg-accent-green/12 hover:border-accent-green/40 transition-all no-underline group"
              data-testid="action-card-agent"
            >
              <div className="w-10 h-10 rounded-lg bg-accent-green/15 flex items-center justify-center shrink-0 group-hover:bg-accent-green/25 transition-colors">
                <Icon name="terminal" size="default" className="text-accent-green" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-text-primary mb-0.5">Chat with Your Agent</div>
                <div className="text-[11px] text-text-secondary leading-snug">
                  Ask about the network, share plain-text files, check reputation, and more.
                </div>
              </div>
              <Icon
                name="chevron-right"
                size="sm"
                className="text-text-tertiary group-hover:text-accent-green shrink-0 transition-colors"
              />
            </Link>

            <Link
              href="/tokens"
              className="flex items-center gap-3 p-3.5 rounded-lg border border-accent-blue/25 bg-accent-blue/5 hover:bg-accent-blue/12 hover:border-accent-blue/40 transition-all no-underline group"
              data-testid="action-card-tokens"
            >
              <div className="w-10 h-10 rounded-lg bg-accent-blue/15 flex items-center justify-center shrink-0 group-hover:bg-accent-blue/25 transition-colors">
                <Icon name="rocket" size="default" className="text-accent-blue" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-text-primary mb-0.5">Explore Agents</div>
                <div className="text-[11px] text-text-secondary leading-snug">
                  Buy a community token and unlock exclusive chat with the creator&apos;s Agent.
                </div>
              </div>
              <Icon
                name="chevron-right"
                size="sm"
                className="text-text-tertiary group-hover:text-accent-blue shrink-0 transition-colors"
              />
            </Link>
          </div>

          {/* Subtle token launch link */}
          <div className="flex items-center justify-center gap-1.5 text-xs text-text-tertiary">
            <span>Want to launch your own Agent?</span>
            <button
              onClick={() => setShowWizard(true)}
              className="bg-transparent border-none text-accent-green font-semibold cursor-pointer hover:underline p-0"
              data-testid="subtle-launch-link"
            >
              Launch here &rarr;
            </button>
          </div>
        </>
      )}

      {/* Explore link */}
      {launchedToken && (
        <Link
          href="/gallery"
          className="flex items-center justify-center gap-1.5 text-xs text-center mt-1 no-underline transition-colors text-text-secondary hover:text-accent-green"
        >
          <Icon name="compass" size="sm" /> Explore the network
        </Link>
      )}
    </div>
  );
}
