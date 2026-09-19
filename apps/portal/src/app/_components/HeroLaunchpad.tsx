/**
 * Story: Home two-step flow — Step 1
 * Purpose: Launch-phase hero. Connect a wallet, then launch an Agent
 *          against $STONK. The agent that runs it comes next, in Step 2.
 *          `LaunchCtaButtons` is the same pair the page's final CTA renders.
 */
'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui';
import { ClawMascot } from '@/components/brand/ClawMascot';
import { cn } from '@/lib/utils/cn';
import { useWalletService } from '@/lib/wallet';
import { useConnectPrompt } from '@/components/features/wallet';
import { useTranslation } from '@/providers/I18nProvider';
import { config } from '@/config';
import { StepBullets } from './StepBullets';
import type { ExistingAgent } from './useHomePage';

/** Docs anchor for the launch mechanics; the docs host comes from config, never a literal. */
const HOW_IT_WORKS_URL = `${config.links.docs}/#how-it-works`;

const LAUNCH_CLASS =
  'inline-flex items-center justify-center gap-2 px-4 py-4 text-base font-bold bg-accent-green text-black rounded-lg border-none cursor-pointer hover:shadow-[0_0_25px_rgba(0,255,0,0.5)] hover:-translate-y-0.5 transition-[transform,box-shadow] min-h-[44px] no-underline disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none';

interface LaunchCtaButtonsProps {
  /** Opens the launch form (TokenWizard). Called once a wallet is connected. */
  onLaunch: () => void;
  /** The agent this wallet already launched (#21): a link to it replaces the Launch button. */
  existingAgent?: ExistingAgent | null;
  /** 'stack' fills the hero card; 'row' sits centred in the final CTA. */
  layout?: 'stack' | 'row';
  /** Prefix for the two data-testids: `<prefix>-connect-wallet`, `<prefix>-open-form`. */
  idPrefix?: string;
}

/**
 * Connect wallet, then Launch Agent. The connect button becomes the connected
 * address once a wallet is in. Launch is always tappable (#4): disconnected, it
 * opens the shared connect prompt and continues once a wallet is in. A wallet
 * that already has an agent gets a link to it instead (#21).
 */
export function LaunchCtaButtons({ onLaunch, existingAgent = null, layout = 'stack', idPrefix = 'launchpad' }: LaunchCtaButtonsProps) {
  const { t } = useTranslation();
  const wallet = useWalletService();
  const { ensureConnected, connecting } = useConnectPrompt();
  const stack = layout === 'stack';

  const launch = async () => {
    if (await ensureConnected()) onLaunch();
  };

  return (
    <div className={cn(stack ? 'space-y-4' : 'flex flex-wrap justify-center gap-3')} data-testid={`${idPrefix}-cta`}>
      {wallet.connected ? (
        <div
          className={cn(
            'inline-flex items-center gap-2 px-3 py-2 rounded-md bg-accent-green/8 border border-accent-green/20 text-xs min-h-[44px]',
            stack && 'flex w-full',
          )}
          data-testid={`${idPrefix}-wallet-connected`}
        >
          <Icon name="check-circle" size="sm" className="text-accent-green shrink-0" />
          <span className="text-text-secondary">Wallet</span>
          <span className="font-mono text-text-primary truncate">{wallet.shortAddress}</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => wallet.connect()}
          disabled={wallet.connecting}
          data-testid={`${idPrefix}-connect-wallet`}
          className={cn(
            'inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-accent-green bg-accent-green/8 border border-accent-green/30 rounded-lg cursor-pointer hover:bg-accent-green/15 transition-colors min-h-[44px] disabled:opacity-60 disabled:cursor-not-allowed',
            stack && 'w-full',
          )}
        >
          <Icon name="wallet" size="sm" />
          {wallet.connecting ? t('home.launch.connecting') : t('home.launch.connectWallet')}
        </button>
      )}

      {existingAgent ? (
        <Link
          href={existingAgent.href}
          data-testid={`${idPrefix}-view-agent`}
          className={cn(LAUNCH_CLASS, stack ? 'w-full' : 'px-6 py-3 text-sm')}
        >
          <Icon name="bot" size="sm" />
          {t('home.launch.viewAgent')}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => void launch()}
          disabled={connecting}
          data-testid={`${idPrefix}-open-form`}
          className={cn(LAUNCH_CLASS, stack ? 'w-full' : 'px-6 py-3 text-sm')}
        >
          <Icon name="rocket" size="sm" />
          {t('home.launch.launch')}
        </button>
      )}
    </div>
  );
}

interface HeroLaunchpadProps {
  /** Opens the launch form (TokenWizard). */
  onLaunch: () => void;
  /** A remembered launch is being confirmed with the tracker; hold Step 1 quietly. */
  checking?: boolean;
  /** The agent this wallet already launched (#21). */
  existingAgent?: ExistingAgent | null;
}

export function HeroLaunchpad({ onLaunch, checking = false, existingAgent = null }: HeroLaunchpadProps) {
  const { t } = useTranslation();
  const wallet = useWalletService();

  return (
    <div className="space-y-4 animate-fade-in-up" data-testid="hero-launchpad" data-checking={checking || undefined}>
      <div>
        <div className="flex items-center gap-3">
          <ClawMascot variant="online" animation="bounce" size="md" className="shrink-0" />
          <h2 className="m-0 text-[1.375rem] font-bold leading-tight tracking-tight text-text-primary md:text-[1.75rem]">
            Launch your <span className="whitespace-nowrap text-accent-green text-glow">StonkAgent</span>
          </h2>
        </div>
        <StepBullets active={1} className="mt-3" />
      </div>

      {checking && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-bg-tertiary border border-border-default text-xs text-text-secondary"
          data-testid="launchpad-checking"
          role="status"
        >
          <span className="w-2 h-2 rounded-full bg-accent-green animate-daemon-pulse shrink-0" />
          {t('home.launch.checking')}
        </div>
      )}

      <LaunchCtaButtons onLaunch={onLaunch} existingAgent={existingAgent} />

      <p className="text-xs text-text-tertiary text-center" data-testid="launchpad-wallet-hint">
        {t('home.launch.alignment')}{' '}
        <a
          href={HOW_IT_WORKS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[44px] items-center text-accent-green underline-offset-2 hover:underline"
          data-testid="launchpad-how-it-works"
        >
          {t('home.launch.howItWorks')}
        </a>
      </p>

      {wallet.error && (
        <p className="text-xs text-accent-red text-center" data-testid="launchpad-wallet-error">
          {wallet.error}
        </p>
      )}
    </div>
  );
}
