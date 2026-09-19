'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from '@/components/ui';
import { useTranslation } from '@/providers/I18nProvider';

interface BottomNavItem {
  i18nKey: string;
  href: string;
  icon: IconName;
}

interface MobileBottomNavProps {
  connected?: boolean;
  className?: string;
}

/** Same order as the desktop tabs: Home, Agents, Knowledge, Chat, Community. */
const items: BottomNavItem[] = [
  { i18nKey: 'mobile.home', href: '/', icon: 'home' },
  { i18nKey: 'mobile.agents', href: '/tokens', icon: 'rocket' },
  { i18nKey: 'mobile.knowledge', href: '/gallery', icon: 'sparkles' },
  { i18nKey: 'mobile.chat', href: '/chat', icon: 'terminal' },
  { i18nKey: 'mobile.community', href: '/community', icon: 'users' },
];

/**
 * Mobile bottom tab bar — visible below 900px (phones and tablets), above the iOS home indicator.
 * Five slots, icon plus one short label each.
 */
export function MobileBottomNav({ className }: MobileBottomNavProps) {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <nav
      className={cn(
        'fixed bottom-0 inset-x-0 z-100 flex justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]',
        'bg-bg-secondary border-t border-border-default',
        'lg:hidden',
        className,
      )}
      data-testid="mobile-bottom-nav"
    >
      {items.map(item => {
        const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            data-testid={`mobile-nav-${item.i18nKey.split('.').pop()}`}
            aria-label={t(item.i18nKey)}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'relative flex flex-col items-center gap-0.5 px-0.5 sm:px-2 py-3 min-w-[44px] min-h-[44px] text-[10px] sm:text-[12px] no-underline cursor-pointer transition-colors',
              isActive ? 'text-accent-green' : 'text-text-secondary',
            )}
          >
            <Icon name={item.icon} size="sm" />
            {t(item.i18nKey)}
          </Link>
        );
      })}
    </nav>
  );
}
