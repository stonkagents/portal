// LOC-EXEMPT: drawer with navigation links, sections, and animation logic
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from '@/components/ui';
import { useTranslation } from '@/providers/I18nProvider';
import { useWalletService } from '@/lib/wallet';
import { config } from '@/config';

interface DrawerLink {
  i18nKey: string;
  href: string;
  icon: IconName;
  external?: boolean;
  /** Omit the link when false — used for links whose target is not live yet. */
  enabled?: boolean;
}

interface DrawerSection {
  i18nKey: string;
  items: DrawerLink[];
}

interface MobileDrawerProps {
  open?: boolean;
  onClose?: () => void;
  connected?: boolean;
  onDisconnect?: () => void;
  /** Stop the agent, or resume it while `killActive` (Safe Mode). */
  onKillToggle?: () => void;
  killActive?: boolean;
  /** A stop or resume request is in flight. */
  killBusy?: boolean;
}

/** Explore mirrors the desktop tab order; Network holds the Knowledge dropdown's other two entries. */
const sections: DrawerSection[] = [
  {
    i18nKey: 'drawer.explore',
    items: [
      { i18nKey: 'nav.home', href: '/', icon: 'home' },
      { i18nKey: 'nav.agents', href: '/tokens', icon: 'rocket' },
      { i18nKey: 'nav.knowledge', href: '/gallery', icon: 'sparkles' },
      { i18nKey: 'nav.chat', href: '/chat', icon: 'terminal' },
      { i18nKey: 'nav.community', href: '/community', icon: 'users' },
    ],
  },
  {
    i18nKey: 'drawer.network',
    items: [
      { i18nKey: 'nav.transfers', href: '/transfers', icon: 'download' },
      { i18nKey: 'nav.network', href: '/peers', icon: 'wifi' },
    ],
  },
  {
    i18nKey: 'drawer.resources',
    items: [
      { i18nKey: 'drawer.docs', href: config.links.docs, icon: 'file-text', external: true, enabled: config.features.docsEnabled },
      { i18nKey: 'drawer.github', href: config.links.github, icon: 'globe', external: true, enabled: Boolean(config.links.github) },
    ],
  },
];

function tid(key: string) {
  return `drawer-${key.replace(/\./g, '-')}`;
}

export function MobileDrawer({
  open = false,
  onClose,
  connected = true,
  onKillToggle,
  killActive = false,
  killBusy = false,
}: MobileDrawerProps) {
  const pathname = usePathname();
  const { locale, setLocale, t } = useTranslation();
  const wallet = useWalletService();

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-[200] bg-black/60 transition-[opacity,visibility] duration-250',
          open ? 'opacity-100 visible' : 'opacity-0 invisible',
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={cn(
          'fixed top-0 right-0 bottom-0 z-[201] w-[280px] max-w-[85vw] bg-bg-secondary border-l border-border-default flex flex-col overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        data-testid="mobile-drawer"
        role="dialog"
        aria-label="Navigation menu"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <span className="text-sm font-bold text-accent-green tracking-wide">StonkAgents</span>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-[44px] h-[44px] bg-transparent border-none text-text-secondary cursor-pointer rounded-sm hover:bg-bg-tertiary hover:text-text-primary transition-colors"
            aria-label="Close menu"
            data-testid="drawer-close"
          >
            <Icon name="x" />
          </button>
        </div>
        <nav className="flex-1 py-2">
          {/* A section whose links are all switched off (docs down, no GitHub URL) shows no heading either. */}
          {sections
            .map(section => ({ ...section, items: section.items.filter(link => link.enabled !== false) }))
            .filter(section => section.items.length > 0)
            .map(section => (
              <div key={section.i18nKey} className="mb-2">
                <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-widest text-text-tertiary">
                  {t(section.i18nKey)}
                </p>
                {section.items.map(link => {
                  const isActive = !link.external && (link.href === '/' ? pathname === '/' : pathname.startsWith(link.href));
                  const props = {
                    className: cn(
                      'flex items-center gap-3 px-4 py-3 text-sm font-semibold no-underline min-h-[44px] transition-colors',
                      isActive
                        ? 'text-accent-green bg-accent-green/5'
                        : 'text-text-secondary hover:text-accent-green hover:bg-accent-green/5',
                    ),
                    onClick: onClose,
                    'data-testid': tid(link.i18nKey),
                  };
                  return link.external ? (
                    <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" {...props}>
                      <Icon name={link.icon} size="sm" />
                      {t(link.i18nKey)}
                      <Icon name="arrow-right" size="sm" className="ml-auto w-3 h-3 opacity-40" />
                    </a>
                  ) : (
                    <Link key={link.href} href={link.href} {...props}>
                      <Icon name={link.icon} size="sm" />
                      {t(link.i18nKey)}
                    </Link>
                  );
                })}
              </div>
            ))}
          <div className="border-t border-border-default/30 mt-2 pt-2">
            {/* Profile and Settings: the avatar menu's own entries, which the phone header has no avatar for. */}
            <Link
              href="/profile"
              onClick={onClose}
              data-testid="drawer-profile"
              className={cn(
                'flex items-center gap-3 px-4 py-3 text-sm font-semibold no-underline min-h-[44px] transition-colors',
                pathname === '/profile'
                  ? 'text-accent-green bg-accent-green/5'
                  : 'text-text-secondary hover:text-accent-green hover:bg-accent-green/5',
              )}
            >
              <Icon name="user" size="sm" />
              {t('avatar.profile')}
            </Link>
            <Link
              href="/settings"
              onClick={onClose}
              data-testid="drawer-settings"
              className={cn(
                'flex items-center gap-3 px-4 py-3 text-sm font-semibold no-underline min-h-[44px] transition-colors',
                pathname === '/settings'
                  ? 'text-accent-green bg-accent-green/5'
                  : 'text-text-secondary hover:text-accent-green hover:bg-accent-green/5',
              )}
            >
              <Icon name="settings" size="sm" />
              {t('drawer.settings')}
            </Link>
          </div>
        </nav>
        <div className="border-t border-border-default">
          <div className="flex items-center gap-2 px-4 py-3">
            <Icon name="globe" size="sm" className="text-text-tertiary" />
            <div className="flex rounded-sm border border-border-default overflow-hidden">
              <button
                onClick={() => setLocale('en')}
                data-testid="drawer-lang-en"
                className={cn(
                  'px-3 py-1 text-xs font-mono font-semibold border-none cursor-pointer transition-colors',
                  locale === 'en'
                    ? 'bg-accent-green/12 text-accent-green'
                    : 'bg-transparent text-text-secondary hover:text-text-primary',
                )}
              >
                EN
              </button>
              <button
                onClick={() => setLocale('zh')}
                data-testid="drawer-lang-zh"
                className={cn(
                  'px-3 py-1 text-xs font-mono font-semibold border-none cursor-pointer transition-colors',
                  locale === 'zh'
                    ? 'bg-accent-green/12 text-accent-green'
                    : 'bg-transparent text-text-secondary hover:text-text-primary',
                )}
              >
                ZH
              </button>
            </div>
          </div>
          <button
            onClick={onKillToggle}
            disabled={killBusy || (!connected && !killActive)}
            data-testid="drawer-safe-mode"
            aria-pressed={killActive}
            className={cn(
              'flex items-center gap-3 px-4 py-3 text-sm font-semibold w-full text-left bg-transparent border-none cursor-pointer min-h-[44px] transition-colors font-[inherit]',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              killActive ? 'text-accent-red bg-accent-red/8' : 'text-accent-red hover:bg-accent-red/8',
            )}
          >
            <Icon name="shield" size="sm" />
            {killActive ? t('drawer.safeModeOn') : t('drawer.safeMode')}
          </button>
          {wallet.connected ? (
            <button
              onClick={async () => {
                await wallet.disconnect();
                onClose?.();
              }}
              data-testid="drawer-disconnect-wallet"
              className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-accent-red w-full text-left bg-transparent border-none cursor-pointer min-h-[44px] hover:bg-accent-red/8 transition-colors font-[inherit]"
            >
              <Icon name="wallet" size="sm" />
              {t('drawer.disconnectWallet')}
            </button>
          ) : (
            <button
              onClick={async () => {
                await wallet.connect();
                onClose?.();
              }}
              data-testid="drawer-connect-wallet"
              className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-accent-green w-full text-left bg-transparent border-none cursor-pointer min-h-[44px] hover:bg-accent-green/5 transition-colors font-[inherit]"
            >
              <Icon name="wallet" size="sm" />
              {t('drawer.connectWallet')}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
