'use client';

import { cn } from '@/lib/utils/cn';
import { Icon } from '@/components/ui';
import { useTranslation } from '@/providers/I18nProvider';

interface KillSwitchProps {
  /** The agent is stopped by the owner (Safe Mode). */
  active?: boolean;
  /** Stop the agent when inactive, resume it when active. */
  onToggle?: () => void;
  /** Nothing to stop or resume (agent offline for another reason). */
  disabled?: boolean;
  className?: string;
}

/**
 * Kill Switch (Safe Mode) button. Stops the agent through the controller; while the
 * agent is stopped by the owner it pulses red and the banner below the nav offers Resume.
 */
export function KillSwitch({ active = false, onToggle, disabled = false, className }: KillSwitchProps) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        'relative isolate inline-flex items-center justify-center w-[44px] h-[44px]',
        'border rounded-sm bg-transparent cursor-pointer transition-[color,border-color,background-color] duration-fast',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        active
          ? "text-accent-red border-accent-red bg-accent-red/15 before:content-[''] before:absolute before:inset-0 before:-z-10 before:rounded-sm before:shadow-[0_0_12px_4px_rgba(255,77,77,0.6)] before:animate-kill-pulse"
          : 'text-text-secondary border-transparent hover:text-accent-red hover:border-accent-red hover:bg-accent-red/8',
        className,
      )}
      data-testid="kill-switch"
      aria-pressed={active}
      aria-label={active ? 'Resume agent' : 'Stop agent (safe mode)'}
    >
      <Icon name="shield" />
    </button>
  );
}

interface KillBannerProps {
  active?: boolean;
  onResume?: () => void;
  /** A resume request is in flight. */
  busy?: boolean;
}

/**
 * Banner shown below the nav while the agent is stopped by the owner.
 */
export function KillBanner({ active = false, onResume, busy = false }: KillBannerProps) {
  const { t } = useTranslation();

  if (!active) return null;

  return (
    <div
      className="sticky top-[56px] z-[99] flex items-center justify-center gap-3 px-4 py-2 bg-bg-primary/95 backdrop-blur-[10px] border-b border-accent-red text-center text-sm font-semibold text-accent-red"
      data-testid="kill-banner"
      role="alert"
    >
      <span>{t('killSwitch.banner')}</span>
      <button
        onClick={onResume}
        disabled={busy}
        className="text-xs px-3 py-1 border border-accent-red rounded-sm bg-transparent text-accent-red font-mono font-semibold cursor-pointer min-h-[32px] hover:bg-accent-red/15 transition-colors disabled:opacity-60 disabled:cursor-wait"
        data-testid="kill-banner-resume"
      >
        {busy ? t('killSwitch.resuming') : t('killSwitch.resume')}
      </button>
    </div>
  );
}
