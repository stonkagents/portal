'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { Icon } from '@/components/ui';
import { useTranslation } from '@/providers/I18nProvider';
import { useCredits } from '@/lib/api/hooks/use-credits';
import { useDaemon } from '@/providers/DaemonProvider';
import { AgentRequiredNotice } from '@/components/features/onboarding/AgentRequiredNotice';
import { TOKEN_LAUNCH_CREDITS, formatCreditReward } from '@/lib/credits/rewards';

interface EarningAction {
  icon: React.ReactNode;
  label: string;
  desc: string;
  reward: string;
  href: string;
}

interface CreditBalanceProps {
  balance?: number;
  actions?: EarningAction[];
  className?: string;
}

const defaultActions: EarningAction[] = [
  {
    icon: (
      <span className="flex h-8 w-8 items-center justify-center rounded bg-accent-green/8 text-accent-green">
        <Icon name="rocket" size="sm" />
      </span>
    ),
    label: 'credits.launchToken',
    desc: 'credits.launchTokenDesc',
    reward: formatCreditReward(TOKEN_LAUNCH_CREDITS),
    href: '/tokens',
  },
  {
    icon: (
      <span className="flex h-8 w-8 items-center justify-center rounded bg-accent-blue/8 text-accent-blue">
        <Icon name="upload" size="sm" />
      </span>
    ),
    label: 'credits.shareContent',
    desc: 'credits.shareContentDesc',
    reward: '+50',
    href: '/transfers',
  },
  {
    icon: (
      <span className="flex h-8 w-8 items-center justify-center rounded bg-accent-purple/8 text-accent-purple">
        <Icon name="user" size="sm" />
      </span>
    ),
    label: 'credits.completeProfile',
    desc: 'credits.completeProfileDesc',
    reward: '+100',
    href: '/profile',
  },
];

export function CreditBalance({ balance: balanceProp, actions = defaultActions, className }: CreditBalanceProps) {
  const { data: creditData } = useCredits();
  /* The balance is read through the agent: offline it is "-", never a placeholder number. */
  const { connected: agentConnected } = useDaemon();
  const balance = balanceProp ?? (agentConnected ? creditData?.total : undefined) ?? null;
  const balanceLabel = balance === null ? '-' : balance.toLocaleString();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const router = useRouter();

  const navigateTo = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  return (
    <div ref={wrapRef} className={cn('relative inline-flex items-center', className)}>
      <button
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1 rounded-sm px-2 py-1 font-mono text-xs font-bold text-accent-green transition-colors hover:bg-accent-green/8 min-h-[44px] cursor-pointer"
        data-testid="credit-balance"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Icon name="zap" size="sm" />
        <span className="tabular-nums">{balanceLabel}</span>
      </button>

      {/* Dropdown */}
      <div
        className={cn(
          'absolute top-[calc(100%+8px)] right-0 z-[110] w-70 rounded-md border border-border-default bg-bg-secondary shadow-[0_8px_24px_rgba(0,0,0,0.4)]',
          'transition-all duration-200',
          open ? 'visible opacity-100 translate-y-0' : 'invisible opacity-0 translate-y-1',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-text-tertiary">{t('credits.totalBalance')}</span>
            <span className="font-mono text-xl font-extrabold text-accent-green">{balanceLabel}</span>
          </div>
          <button
            className="bg-transparent border-none text-xs font-mono text-accent-green cursor-pointer min-h-[44px]"
            data-testid="credit-view-all"
            aria-label="View all credits"
            onClick={() => navigateTo('/settings#credits')}
          >
            {t('credits.viewAll')}
          </button>
        </div>

        {balanceProp === undefined && (
          <AgentRequiredNotice className="px-4 py-3 border-b border-border-default/30" data-testid="credit-balance-agent-required" />
        )}

        {/* Earn section */}
        <div className="border-b border-border-default/30 px-4 py-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-tertiary">{t('credits.waysToEarn')}</p>
          <div className="flex flex-col gap-1">
            {actions.map(a => (
              <button
                key={a.label}
                className="flex items-center gap-3 rounded-sm p-2 min-h-[44px] text-left transition-colors hover:bg-accent-green/4 w-full bg-transparent border-none cursor-pointer"
                data-testid={`credit-action-${a.label.split('.').pop()}`}
                aria-label={`${t(a.label)}: ${t(a.desc)}`}
                onClick={() => navigateTo(a.href)}
              >
                {a.icon}
                <div className="flex flex-col gap-px min-w-0">
                  <span className="text-xs font-semibold text-text-primary">{t(a.label)}</span>
                  <span className="text-[11px] text-text-tertiary">{t(a.desc)}</span>
                </div>
                <span className="ml-auto shrink-0 text-[11px] font-bold font-mono text-accent-green">{a.reward}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
