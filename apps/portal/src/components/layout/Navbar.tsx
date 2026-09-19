// LOC-EXEMPT: navbar with responsive breakpoints, nav links, and composed sub-components
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { Icon } from '@/components/ui';
import { ClawLogo } from '@/components/brand';
import { DaemonDot } from './DaemonDot';
import { CommandToolsChip } from './CommandToolsChip';
import { CreditBalance } from './CreditBalance';
import { NotificationBell } from './NotificationBell';
import { NotificationPrefsPanel } from './notifications/NotificationPrefsPanel';
import { KillSwitch, KillBanner } from './KillSwitch';
import { AvatarDropdown } from './AvatarDropdown';
import { useTranslation } from '@/providers/I18nProvider';
import { useEvents } from '@/providers/EventProvider';
import { isAlertOrNudge } from '@/lib/types/claw-event';
import { useWalletService } from '@/lib/wallet';
import { useExistingAgent } from '@/lib/api/hooks/use-existing-agent';
import { useBoardActivity, useMarkActivityRead } from '@/lib/api/hooks/use-board-activity';
import { useAutopilotEventList } from '@/lib/api/hooks/use-autopilot';
import { useDigestRows } from './notifications/use-digest-rows';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { useConnectPrompt } from '@/components/features/wallet';
import { AgentEnvMismatchBadge } from '@/components/features/onboarding/AgentEnvMismatchNotice';
import type { AgentEnvMismatch } from '@/lib/api/agent-environment';

interface NavLink {
  i18nKey: string;
  href: string;
  icon: React.ReactNode;
  children?: NavLink[];
}

type DaemonStatus = 'online' | 'degraded' | 'offline';

interface NavbarProps {
  connected?: boolean;
  daemonStatus?: DaemonStatus;
  onToggleDrawer?: () => void;
  onDisconnect?: () => void;
  /** Agent stopped by the owner (Safe Mode); see LayoutShell. */
  killActive?: boolean;
  /** A stop or resume request is in flight. */
  killBusy?: boolean;
  /** Stop the agent, or resume it while `killActive`. */
  onKillToggle?: () => void;
  /** A healthy agent of another environment; the status group shows the badge instead of the dot. */
  envMismatch?: AgentEnvMismatch | null;
}

/** Home, Agents, Knowledge (Gallery, Transfers, Network), Agent Chat, Community — the bottom bar and drawer mirror this. */
const navLinks: NavLink[] = [
  { i18nKey: 'nav.home', href: '/', icon: <Icon name="home" size="sm" /> },
  { i18nKey: 'nav.agents', href: '/tokens', icon: <Icon name="rocket" size="sm" /> },
  {
    i18nKey: 'nav.knowledge',
    href: '/gallery',
    icon: <Icon name="sparkles" size="sm" />,
    children: [
      { i18nKey: 'nav.gallery', href: '/gallery', icon: <Icon name="sparkles" size="sm" /> },
      { i18nKey: 'nav.transfers', href: '/transfers', icon: <Icon name="download" size="sm" /> },
      { i18nKey: 'nav.network', href: '/peers', icon: <Icon name="wifi" size="sm" /> },
    ],
  },
  { i18nKey: 'nav.chat', href: '/chat', icon: <Icon name="terminal" size="sm" /> },
  { i18nKey: 'nav.community', href: '/community', icon: <Icon name="users" size="sm" /> },
];

export function Navbar({
  connected = true,
  daemonStatus = 'offline',
  onToggleDrawer,
  onDisconnect,
  killActive = false,
  killBusy = false,
  onKillToggle,
  envMismatch = null,
}: NavbarProps) {
  const wallet = useWalletService();
  const existingAgent = useExistingAgent();
  const { ensureConnected } = useConnectPrompt();
  const router = useRouter();
  /* Launch Agent in the header: connect the wallet first on a fresh session, then
     open the launch form. A wallet that already has an agent never sees this
     button; it gets the "Your agent" link instead. */
  const onLaunchClick = useCallback(async () => {
    if (!wallet.connected && !(await ensureConnected())) return;
    router.push('/tokens/#launch');
  }, [wallet.connected, ensureConnected, router]);
  const pathname = usePathname();
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const { t } = useTranslation();
  const { events, markAllRead } = useEvents();
  const alertEvents = events.filter(isAlertOrNudge);
  /* Board activity rides in the same bell: polled through the agent while it is connected, quiet otherwise. */
  const { data: activity } = useBoardActivity();
  const { mutate: markActivity } = useMarkActivityRead();
  /* The weekly digests the agent posted: the daemon's own list, read marks kept in this browser. */
  const { data: daemonEvents } = useAutopilotEventList();
  const { rows: digestRows, unread: digestUnread, markRead: onDigestRead, markAllRead: markDigestsRead } = useDigestRows(daemonEvents);
  const onMarkAllRead = useCallback(() => {
    markAllRead();
    if (activity && activity.unread > 0) markActivity({ all: true });
    if (digestUnread > 0) markDigestsRead();
  }, [markAllRead, activity, markActivity, digestUnread, markDigestsRead]);
  const onActivityRead = useCallback((id: string) => markActivity({ ids: [id] }), [markActivity]);

  /* One bell only: in the status group from 900px, next to the wallet button below it. The CSS
     breakpoint is the same one that swaps the two groups; the query keeps a single instance in
     the DOM so a test id or a live region is never duplicated. */
  const wideNav = useMediaQuery('(min-width: 900px)');
  const bell = (
    <NotificationBell
      events={alertEvents}
      onMarkAllRead={onMarkAllRead}
      activity={activity?.items}
      activityUnread={activity?.unread}
      onActivityRead={onActivityRead}
      digests={digestRows}
      onDigestRead={onDigestRead}
      prefsPanel={activity ? <NotificationPrefsPanel /> : undefined}
    />
  );

  // Ensure dropdown never remains open after navigation.
  useEffect(() => {
    setKnowledgeOpen(false);
  }, [pathname]);

  return (
    <>
      <nav className="sticky top-0 z-100 bg-bg-primary/95 border-b border-border-default pt-[env(safe-area-inset-top)]" data-testid="navbar">
        <div className="flex items-center justify-between mx-auto max-w-[1400px] px-4 py-3 min-h-[56px] lg:px-8">
          {/* Left: Logo — the ClawLogo owns its one spin; no second, faster instance here */}
          <Link href="/" className="group flex shrink-0 items-center gap-2 sm:gap-3 no-underline whitespace-nowrap">
            <ClawLogo size="md" />
            <div className="flex flex-col gap-0.5">
              <span className="text-xl font-bold text-accent-green text-glow leading-tight tracking-wide">StonkAgents</span>
              <span className="text-[11px] 2xl:block hidden text-text-secondary uppercase tracking-[0.12em]">{t('nav.tagline')}</span>
            </div>
          </Link>

          {/* Center: Nav links (hidden below 900px; phones and tablets use the drawer and the bottom bar) */}
          <ul className="hidden lg:flex shrink-0 list-none gap-1 xl:gap-3 2xl:gap-6 items-center">
            {navLinks.map(link => {
              const testIdBase = link.i18nKey.replace('nav.', 'nav-');
              return link.children ? (
                /* Dropdown nav item (Knowledge) — keyboard accessible via focus-within */
                <li
                  key={link.href}
                  className="relative"
                  onMouseEnter={() => setKnowledgeOpen(true)}
                  onMouseLeave={() => setKnowledgeOpen(false)}
                  onFocusCapture={() => setKnowledgeOpen(true)}
                  onBlurCapture={event => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      setKnowledgeOpen(false);
                    }
                  }}
                >
                  <Link
                    href={link.href}
                    data-testid={testIdBase}
                    aria-haspopup="true"
                    aria-expanded={knowledgeOpen}
                    title={t(link.i18nKey)}
                    className={cn(
                      'relative inline-flex items-center gap-2 px-3 py-2 text-sm min-h-[44px] no-underline transition-colors duration-200',
                      [link.href, ...link.children.map(c => c.href)].includes(pathname)
                        ? 'text-accent-green'
                        : 'text-text-secondary hover:text-accent-green',
                    )}
                  >
                    {link.icon}
                    {/* Labels from 1280px; between 900 and 1279px the links are icons with a title. */}
                    <span className="hidden xl:inline whitespace-nowrap">{t(link.i18nKey)}</span>
                    <Icon
                      name="chevron-down"
                      size="sm"
                      className={cn('w-3 h-3 transition-transform duration-200', knowledgeOpen && 'rotate-180')}
                    />
                    {/* Active underline */}
                    <span
                      className={cn(
                        'absolute -bottom-px left-0 h-0.5 bg-accent-green rounded-sm transition-[width] duration-200',
                        [link.href, ...link.children.map(c => c.href)].includes(pathname) ? 'w-full' : 'w-0',
                      )}
                    />
                  </Link>
                  {/* Dropdown menu — opens on hover AND focus-within for keyboard a11y */}
                  <ul
                    className={cn(
                      'absolute top-full left-1/2 -translate-x-1/2 mt-2 min-w-[180px] bg-bg-secondary border border-border-default rounded-lg py-2 list-none transition-[opacity,transform,visibility] duration-200 z-110 shadow-[0_8px_24px_rgba(0,0,0,0.4)]',
                      knowledgeOpen ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible translate-y-1',
                    )}
                  >
                    {link.children.map(child => {
                      const childTestId = child.i18nKey.replace('nav.', 'nav-dd-');
                      return (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            data-testid={childTestId}
                            onClick={() => setKnowledgeOpen(false)}
                            className={cn(
                              'flex items-center gap-2 px-4 py-2 text-sm min-h-[40px] no-underline whitespace-nowrap transition-colors duration-150',
                              pathname === child.href
                                ? 'text-accent-green bg-accent-green/5'
                                : 'text-text-secondary hover:text-accent-green hover:bg-accent-green/5',
                            )}
                          >
                            {child.icon}
                            {t(child.i18nKey)}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ) : (
                /* Regular nav item */
                <li key={link.href}>
                  <Link
                    href={link.href}
                    data-testid={testIdBase}
                    title={t(link.i18nKey)}
                    className={cn(
                      'relative inline-flex items-center gap-2 px-3 py-2 text-sm min-h-[44px] no-underline transition-colors duration-200',
                      pathname === link.href ? 'text-accent-green' : 'text-text-secondary hover:text-accent-green',
                    )}
                  >
                    {link.icon}
                    <span className="hidden xl:inline whitespace-nowrap">{t(link.i18nKey)}</span>
                    {/* Active underline */}
                    <span
                      className={cn(
                        'absolute -bottom-px left-0 h-0.5 bg-accent-green rounded-sm transition-[width] duration-200',
                        pathname === link.href ? 'w-full' : 'w-0',
                      )}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Right: Status group + avatar (hidden below 900px) */}
          <div className="hidden lg:flex min-w-0 items-center gap-2">
            {/* An agent of another environment: not connected, but the owner should know why. */}
            {!connected && envMismatch && <AgentEnvMismatchBadge mismatch={envMismatch} />}
            {connected && (
              <>
                <DaemonDot status={daemonStatus} />
                {/* The background command tools job (Windows 2.6.0+): setting up, ready, or failed with Retry. */}
                {/* The chip shrinks (its text truncates) before anything else in the row gives way. */}
                <CommandToolsChip className="min-w-0 shrink" />
                <CreditBalance />
                <KillSwitch active={killActive} onToggle={onKillToggle} disabled={killBusy} />
                {wideNav && bell}
              </>
            )}
            {existingAgent ? (
              <Link
                href={existingAgent.href}
                className="inline-flex cursor-pointer items-center gap-2 px-4 py-2 text-xs font-semibold border border-accent-green text-accent-green rounded-md min-h-[44px] no-underline hover:bg-accent-green/10 transition-[background-color]"
                data-testid="nav-your-agent"
              >
                <Icon name="rocket" size="sm" />
                {t('nav.yourAgent')}
              </Link>
            ) : (
              !connected && (
                <button
                  type="button"
                  onClick={onLaunchClick}
                  className="inline-flex cursor-pointer items-center gap-2 px-4 py-2 text-xs font-semibold bg-accent-green text-bg-primary rounded-md min-h-[44px] hover:shadow-glow hover:-translate-y-px transition-[transform,box-shadow]"
                  data-testid="nav-launch-agent"
                >
                  <Icon name="rocket" size="sm" />
                  {t('nav.join')}
                </button>
              )
            )}
            <AvatarDropdown
              connected={connected}
              onDisconnect={onDisconnect}
              onKillToggle={onKillToggle}
              killActive={killActive}
              killDisabled={killBusy || (!connected && !killActive)}
            />
          </div>

          {/* Mobile and tablet: alerts (while the agent is live), wallet, hamburger (visible below 900px) */}
          <div className="flex items-center gap-0.5 lg:hidden">
            {connected && !wideNav && bell}
            {wallet.connected ? (
              <button
                type="button"
                onClick={onToggleDrawer}
                data-testid="nav-mobile-wallet"
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border border-accent-green/40 bg-accent-green/10 px-2.5 font-mono text-xs font-semibold text-accent-green"
                aria-label={`Wallet ${wallet.shortAddress ?? ''}, open menu`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-accent-green" aria-hidden="true" />
                {/* The full short form from 480px; a phone header only has room for the tail of the address. */}
                <span className="hidden sm:inline">{wallet.shortAddress}</span>
                <span className="sm:hidden">{wallet.shortAddress?.slice(-5)}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void wallet.connect()}
                disabled={wallet.connecting}
                data-testid="nav-mobile-connect"
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md bg-accent-green px-2.5 text-xs font-bold text-black disabled:opacity-60"
              >
                <Icon name="wallet" size="sm" />
                {wallet.connecting ? 'Connecting…' : 'Connect'}
              </button>
            )}
            <button
              onClick={onToggleDrawer}
              className="flex lg:hidden items-center justify-center w-[44px] h-[44px] text-text-secondary bg-transparent border-none cursor-pointer hover:text-accent-green transition-colors"
              data-testid="hamburger-button"
              aria-label="Open menu"
            >
              <Icon name="menu" size="lg" />
            </button>
          </div>
        </div>
      </nav>

      {/* Kill banner: only while the owner stopped the agent; Resume starts it through the controller. */}
      <KillBanner active={killActive} onResume={onKillToggle} busy={killBusy} />
    </>
  );
}
