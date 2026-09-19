// LOC-EXEMPT: dropdown with menu items, keyboard nav, and click-outside logic
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon } from '@/components/ui';
import Link from 'next/link';
import { useTranslation } from '@/providers/I18nProvider';
import { useDaemon } from '@/providers/DaemonProvider';
import { useCredits } from '@/lib/api/hooks/use-credits';
import { useAgentIdentity } from '@/lib/api/hooks/use-agent-identity';
import { agentLabel } from '@/lib/agent-name';
import { agentAddress } from '@/lib/agent-address';
import { useWalletService } from '@/lib/wallet';
import { config } from '@/config';
import { ClawMascot } from '@/components/brand/ClawMascot';

interface AvatarDropdownProps {
  connected?: boolean;
  name?: string;
  agentId?: string;
  credits?: number;
  onDisconnect?: () => void;
  /** Stop the agent, or resume it while `killActive` (Safe Mode). */
  onKillToggle?: () => void;
  killActive?: boolean;
  /** Nothing to stop or resume right now (agent offline, or a request in flight). */
  killDisabled?: boolean;
  className?: string;
}

export function AvatarDropdown({
  connected = true,
  name: nameProp,
  agentId: agentIdProp,
  credits: creditsProp,
  onDisconnect: _onDisconnect,
  onKillToggle,
  killActive = false,
  killDisabled = false,
  className,
}: AvatarDropdownProps) {
  const abbreviateMiddle = useCallback((value: string, start = 6, end = 5) => {
    if (!value || value.length <= start + end + 3) return value;
    return `${value.slice(0, start)}...${value.slice(-end)}`;
  }, []);
  const { health } = useDaemon();
  const { data: creditData } = useCredits();
  const { data: identity } = useAgentIdentity();
  const wallet = useWalletService();
  const agentId = agentIdProp ?? health.peerId ?? '-';
  /* The owner's display name, else the masked id; "anon_agent" only while no agent is known at all. */
  const name = nameProp ?? (agentId && agentId !== '-' ? agentLabel(identity?.displayName, agentId) : 'anon_agent');
  /* Credits live on the agent: "-" while it is offline, never a placeholder number. */
  const credits = creditsProp ?? (connected ? creditData?.total : undefined) ?? null;
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [walletCopied, setWalletCopied] = useState(false);
  const { locale, setLocale, t } = useTranslation();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const copyAgentId = useCallback(() => {
    navigator.clipboard.writeText(agentId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  }, [agentId]);
  const copyWalletAddress = useCallback((address: string) => {
    navigator.clipboard.writeText(address).then(() => {
      setWalletCopied(true);
      setTimeout(() => setWalletCopied(false), 3000);
    });
  }, []);

  const close = useCallback(() => setOpen(false), []);
  const handleWalletRowActivate = useCallback(async () => {
    if (wallet.connected) await wallet.disconnect();
    else await wallet.connect();
    close();
  }, [wallet, close]);
  const menuLink =
    'flex items-center gap-3 px-4 py-2 text-sm text-text-secondary no-underline min-h-[44px] transition-colors hover:text-accent-green hover:bg-accent-green/5';
  const menuBtn =
    'flex items-center gap-3 px-4 py-2 text-sm text-text-secondary w-full text-left bg-transparent border-none cursor-pointer min-h-[44px] transition-colors hover:text-accent-green hover:bg-accent-green/5 font-[inherit]';

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'relative flex items-center justify-center w-8 h-8 rounded-full border-2 cursor-pointer transition-all duration-300 min-h-[44px] min-w-[44px] p-0',
          connected
            ? 'border-accent-green bg-accent-green/8 text-accent-green shadow-[0_0_8px_rgba(0,255,65,0.25)] hover:shadow-[0_0_12px_rgba(0,255,65,0.4)]'
            : 'border-accent-red bg-accent-red/12 text-accent-red hover:shadow-[0_0_12px_rgba(255,68,68,0.4)]',
        )}
        data-testid="avatar-trigger"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <ClawMascot variant={connected ? 'online' : 'offline'} size="sm" className="pointer-events-none" />
        <span
          aria-hidden="true"
          data-testid="avatar-status-dot"
          className={cn(
            'absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg-primary',
            connected ? 'bg-accent-green shadow-[0_0_6px_rgba(0,255,65,0.8)]' : 'bg-accent-red',
          )}
        />
      </button>
      <div
        className={cn(
          'absolute top-[calc(100%+8px)] right-0 z-120 w-70 overflow-hidden bg-bg-secondary border border-border-default rounded-md shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-all duration-200',
          open ? 'visible opacity-100 translate-y-0' : 'invisible opacity-0 translate-y-1',
        )}
        data-testid="avatar-dropdown"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border-default">
          <div className="flex items-center gap-3 mb-2">
            <div
              className={cn(
                'flex items-center justify-center w-9 h-9 rounded-full shrink-0',
                connected ? 'bg-accent-green/12' : 'bg-accent-red/10',
              )}
            >
              <ClawMascot variant={connected ? 'online' : 'offline'} size="sm" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-text-primary leading-tight">{name}</span>
              <span className="flex items-center gap-1.5 text-[11px] text-text-tertiary font-mono max-w-[180px]" title={agentId}>
                <span>{abbreviateMiddle(agentId)}</span>
                <button
                  type="button"
                  onClick={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    copyAgentId();
                  }}
                  className="inline-flex items-center justify-center w-5 h-5 rounded-sm border border-border-default text-text-tertiary transition-colors hover:text-accent-green hover:border-accent-green/50"
                  aria-label="Copy profile ID"
                  title={copied ? 'Copied' : 'Copy profile ID'}
                >
                  <Icon name={copied ? 'check' : 'copy'} size="sm" />
                </button>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-text-tertiary mt-1">
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full shrink-0',
                connected ? 'bg-accent-green shadow-[0_0_6px_var(--color-accent-green)]' : 'bg-accent-red',
              )}
            />
            <span>{connected ? `${t('avatar.online')} · ${agentAddress()}` : t('avatar.offline')}</span>
          </div>
        </div>
        {/* Copy Agent ID */}
        <div className="py-1">
          <button onClick={copyAgentId} className={menuBtn} data-testid="avatar-copy-id" aria-label="Copy Agent ID">
            <Icon name={copied ? 'check' : 'copy'} size="sm" />
            {copied ? t('avatar.copied') : t('avatar.copyAgentId')}
          </button>
        </div>
        <hr className="h-px bg-border-default border-none m-0" />
        {/* Nav items */}
        <div className="py-1">
          <Link href="/profile" className={menuLink} onClick={close} data-testid="avatar-profile">
            <Icon name="user" size="sm" />
            {t('avatar.profile')}
          </Link>
          <Link href="/settings" className={menuLink} onClick={close} data-testid="avatar-settings">
            <Icon name="settings" size="sm" />
            {t('avatar.settings')}
          </Link>
          <Link href="/settings#credits" className={menuLink} onClick={close} data-testid="avatar-credits">
            <Icon name="zap" size="sm" />
            {t('avatar.credits')}
            <span className="ml-auto text-xs font-semibold text-accent-green font-mono tabular-nums">
              {credits === null ? '-' : credits.toLocaleString()}
            </span>
          </Link>
        </div>
        <hr className="h-px bg-border-default border-none m-0" />
        {/* Language toggle */}
        <div className="flex items-center gap-2 px-4 py-2">
          <Icon name="globe" size="sm" className="text-text-tertiary" />
          <span className="text-xs text-text-secondary">{t('avatar.language')}</span>
          <div className="ml-auto flex rounded-sm border border-border-default overflow-hidden">
            <button
              onClick={() => setLocale('en')}
              data-testid="avatar-lang-en"
              className={cn(
                'px-2 py-0.5 text-[11px] font-mono font-semibold border-none cursor-pointer transition-colors',
                locale === 'en' ? 'bg-accent-green/12 text-accent-green' : 'bg-transparent text-text-secondary',
              )}
            >
              EN
            </button>
            <button
              onClick={() => setLocale('zh')}
              data-testid="avatar-lang-zh"
              className={cn(
                'px-2 py-0.5 text-[11px] font-mono font-semibold border-none cursor-pointer transition-colors',
                locale === 'zh' ? 'bg-accent-green/12 text-accent-green' : 'bg-transparent text-text-secondary',
              )}
            >
              ZH
            </button>
          </div>
        </div>
        <hr className="h-px bg-border-default border-none m-0" />
        {/* External links */}
        <div className="py-1">
          {config.features.docsEnabled && (
            <a href={config.links.docs} target="_blank" rel="noopener noreferrer" className={menuLink} data-testid="avatar-docs">
              <Icon name="file-text" size="sm" />
              {t('avatar.docs')}
              <Icon name="arrow-right" size="sm" className="ml-auto w-3 h-3 opacity-40" />
            </a>
          )}
          {config.links.github && (
            <a href={config.links.github} target="_blank" rel="noopener noreferrer" className={menuLink} data-testid="avatar-github">
              <Icon name="globe" size="sm" />
              {t('avatar.github')}
              <Icon name="arrow-right" size="sm" className="ml-auto w-3 h-3 opacity-40" />
            </a>
          )}
        </div>
        <hr className="h-px bg-border-default border-none m-0" />
        {/* Kill Switch */}
        <div className="py-1">
          <button
            onClick={onKillToggle}
            disabled={killDisabled}
            className="flex items-center gap-3 px-4 py-2 text-sm text-accent-red w-full text-left bg-transparent border-none cursor-pointer min-h-[44px] transition-colors hover:bg-accent-red/8 font-[inherit] disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="avatar-safe-mode"
            aria-label={killActive ? 'Resume agent' : 'Stop agent (safe mode)'}
            aria-pressed={killActive}
          >
            <Icon name="shield" size="sm" />
            {killActive ? t('drawer.safeModeOn') : t('avatar.safeMode')}
            <span
              className={cn(
                'ml-auto relative w-9 h-5 rounded-full transition-colors duration-200',
                killActive ? 'bg-accent-red/30' : 'bg-border-default',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-all duration-200',
                  killActive ? 'translate-x-4 bg-accent-red' : 'translate-x-0 bg-text-secondary',
                )}
              />
            </span>
          </button>
        </div>
        <hr className="h-px bg-border-default border-none m-0" />
        {/* Wallet — connect opens the shared prompt (wallet list, install links, mobile deep links) */}
        <div className="py-1">
          <div
            role="button"
            tabIndex={0}
            onClick={handleWalletRowActivate}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleWalletRowActivate();
              }
            }}
            className={cn(
              'flex items-center gap-3 px-4 py-2 text-sm w-full text-left bg-transparent border-none cursor-pointer min-h-[44px] transition-colors font-[inherit]',
              wallet.connected ? 'text-accent-red hover:bg-accent-red/8' : 'text-accent-green hover:bg-accent-green/5',
            )}
            data-testid="avatar-wallet"
            aria-label={wallet.connected ? 'Disconnect wallet' : 'Connect wallet'}
          >
            <Icon name="wallet" size="sm" />
            {wallet.connected ? 'Disconnect Wallet' : 'Connect Wallet'}
            {wallet.connected && wallet.shortAddress && (
              <span className="ml-auto flex items-center gap-2">
                <span className="text-xs font-mono text-text-tertiary">{wallet.shortAddress}</span>
                {wallet.publicKey && (
                  <button
                    type="button"
                    onClick={event => {
                      event.preventDefault();
                      event.stopPropagation();
                      copyWalletAddress(wallet.publicKey ?? '');
                    }}
                    className="inline-flex items-center justify-center w-6 h-6 rounded-sm border border-border-default text-text-tertiary transition-colors hover:text-accent-green hover:border-accent-green/50"
                    aria-label="Copy wallet address"
                    title={walletCopied ? 'Copied' : 'Copy wallet address'}
                  >
                    <Icon name={walletCopied ? 'check' : 'copy'} size="sm" />
                  </button>
                )}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
