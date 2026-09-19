/**
 * Purpose: Compact credits row with the account's social connections.
 *          Default: single row with credits + a dot per connection (the wallet dot is always there).
 *          Expanded: the wallet chip (linkable) and a badge for every connection the tracker knows.
 *          Nothing here offers a bonus the tracker cannot grant: X, GitHub, Discord, Email and
 *          Telegram have no connect flow in the portal yet, so they only appear once connected.
 */
'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui';
import { useCredits } from '@/lib/api/hooks/use-credits';
import { useSocialConnections } from '@/lib/api/hooks/use-social-connections';
import { useConnectPrompt } from '@/components/features/wallet';

interface SocialPlatform {
  id: string;
  name: string;
  letter: string;
}

/** Bonus credits per platform, mirrors the agent repository tracker/internal/services/social_service.go. */
export const SOCIAL_BONUS: Record<string, number> = {
  wallet: 100,
  github: 50,
  twitter: 25,
  discord: 25,
  email: 25,
  telegram: 25,
  calendar: 50,
};

/**
 * Linking a wallet updates the peer record (PATCH peers/me); the tracker does not confirm a
 * "wallet" social connection on that path, so the 100-credit bonus is not granted today. Flip
 * this once it is, and the wallet chip advertises the amount again.
 */
const WALLET_BONUS_GRANTED_ON_LINK = false;

const WALLET: SocialPlatform = { id: 'wallet', name: 'Wallet', letter: 'W' };

/** Platforms the tracker can report as connected (id = tracker platform name). */
const SOCIAL_PLATFORMS: SocialPlatform[] = [
  { id: 'twitter', name: 'Twitter / X', letter: 'X' },
  { id: 'github', name: 'GitHub', letter: 'G' },
  { id: 'discord', name: 'Discord', letter: 'D' },
  { id: 'email', name: 'Email', letter: 'E' },
  { id: 'telegram', name: 'Telegram', letter: 'T' },
  { id: 'calendar', name: 'Calendar', letter: 'C' },
];

type WalletState = 'connected' | 'linked' | 'unlinked';

const CONNECTED_DOT = 'bg-accent-green/10 border-accent-green/30 text-accent-green shadow-[0_0_4px_rgba(0,255,0,0.2)]';
const IDLE_DOT = 'bg-bg-secondary border-border-default text-text-tertiary group-hover:border-accent-green/20 group-hover:text-text-secondary';
const DOT = 'w-6 h-6 rounded-full text-[11px] font-semibold flex items-center justify-center border transition-all duration-200';
const CONNECTED_CHIP =
  'flex items-center gap-1 px-2 py-1 rounded text-xs border min-h-[36px] border-accent-green/20 bg-accent-green/5 text-accent-green';

export function CreditsCompactRow() {
  const [expanded, setExpanded] = useState(false);
  const { data: balance, isPending: balanceLoading } = useCredits();
  const { data: socialData } = useSocialConnections();
  const { ensureConnected, connected: walletConnected, connecting: walletConnecting } = useConnectPrompt();

  const connectedPlatforms = new Set(socialData?.connections?.map(c => c.platform) ?? []);
  /* Tracker-confirmed wallet wins; a portal-connected wallet is linked to the peer by WalletLinkEffect. */
  const walletState: WalletState = connectedPlatforms.has('wallet') ? 'connected' : walletConnected ? 'linked' : 'unlinked';
  const connectedSocials = SOCIAL_PLATFORMS.filter(p => connectedPlatforms.has(p.id));
  const connectedCount = connectedSocials.length + (walletState === 'unlinked' ? 0 : 1);

  const totalCredits = balance?.total ?? 0;
  const freeCredits = balance?.free_balance ?? 0;
  const paidCredits = balance?.paid_balance ?? 0;

  if (expanded) {
    return (
      <div className="rounded-md bg-bg-tertiary border border-border-default p-2.5 animate-fade-in-up" data-testid="credits-expanded">
        {/* Expanded header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Icon name="zap" size="sm" className="text-accent-green" />
            <span className="text-sm font-bold text-text-primary">{balanceLoading ? '...' : totalCredits}</span>
            <span className="text-xs text-text-secondary">credits</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary" data-testid="social-connected-count">
              {connectedCount} connected
            </span>
            <button
              onClick={() => setExpanded(false)}
              className="bg-transparent border-none text-text-tertiary hover:text-text-primary cursor-pointer p-0.5"
              data-testid="collapse-credits"
              aria-label="Collapse"
            >
              <Icon name="chevron-up" size="sm" />
            </button>
          </div>
        </div>

        {/* Wallet chip + connected badges */}
        <div className="flex flex-wrap gap-1.5">
          {walletState === 'unlinked' ? (
            <button
              data-testid="social-chip-wallet"
              onClick={() => void ensureConnected()}
              disabled={walletConnecting}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs border min-h-[36px] transition-colors border-border-default bg-bg-secondary text-text-secondary hover:border-accent-green/30 hover:text-accent-green hover:shadow-[0_0_8px_rgba(0,255,0,0.15)] cursor-pointer disabled:opacity-60 disabled:cursor-wait"
            >
              <span className="w-5 h-5 rounded-full bg-bg-tertiary border border-border-default text-[11px] flex items-center justify-center font-semibold">
                {WALLET.letter}
              </span>
              <span className="font-semibold">{walletConnecting ? 'Connecting...' : 'Link wallet'}</span>
              {WALLET_BONUS_GRANTED_ON_LINK && <span className="text-accent-green font-semibold">+{SOCIAL_BONUS.wallet}</span>}
            </button>
          ) : (
            <span data-testid="social-chip-wallet" className={CONNECTED_CHIP}>
              <Icon name="check-circle" size="sm" className="text-accent-green" />
              <span className="font-semibold">{walletState === 'linked' ? 'Wallet linked' : WALLET.name}</span>
            </span>
          )}
          {connectedSocials.map(platform => (
            <span key={platform.id} data-testid={`social-chip-${platform.id}`} className={CONNECTED_CHIP}>
              <Icon name="check-circle" size="sm" className="text-accent-green" />
              <span className="font-semibold">{platform.name}</span>
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-between px-2.5 py-2 rounded-md bg-bg-tertiary border border-border-default"
      data-testid="credits-compact-row"
    >
      {/* Credits info */}
      <div className="flex items-center gap-1.5">
        <Icon name="zap" size="sm" className="text-accent-green" />
        <span className="text-sm font-bold text-text-primary">{balanceLoading ? '...' : totalCredits}</span>
        <span className="text-xs text-text-secondary">credits</span>
        {!balanceLoading && (
          <span className="text-[11px] text-text-tertiary">
            ({freeCredits} free · {paidCredits} paid)
          </span>
        )}
      </div>

      {/* Connection dots: the wallet, then every platform the tracker reports as connected */}
      <button
        className="flex gap-0.5 bg-transparent border-none cursor-pointer p-1 rounded-md hover:bg-white/[0.04] transition-all group"
        onClick={() => setExpanded(true)}
        data-testid="social-dots"
        aria-label="Show connections"
      >
        <span data-testid="dot-wallet" className={`${DOT} ${walletState === 'unlinked' ? IDLE_DOT : CONNECTED_DOT}`}>
          {WALLET.letter}
        </span>
        {connectedSocials.map(platform => (
          <span key={platform.id} data-testid={`dot-${platform.id}`} className={`${DOT} ${CONNECTED_DOT}`}>
            {platform.letter}
          </span>
        ))}
      </button>
    </div>
  );
}
