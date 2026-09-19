/**
 * Purpose: The one inline notice for anything the portal can only do through the
 *          local agent (credits, posting, sharing, peers, transfers). While the agent
 *          is not connected the control next to it is disabled and this says why and
 *          where to set the agent up. Renders nothing once connected, so a call site
 *          is one line and never shows a generic network error or an endless spinner.
 *          An agent of another environment (healthy, but pointed at another tracker)
 *          gets the mismatch notice instead, naming the build this site needs. When the
 *          browser's local network permission is what stands in the way, the permission
 *          banner (LocalAccessNotice, one per page) sits above the notice.
 */
'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { Icon } from '@/components/ui/Icon';
import { envMismatchSummary } from '@/lib/api/agent-environment';
import { useDaemon } from '@/providers/DaemonProvider';
import { useTranslation } from '@/providers/I18nProvider';
import { LocalAccessNotice } from '@/components/features/install/LocalAccessNotice';
import { AgentEnvMismatchNotice } from './AgentEnvMismatchNotice';

/** The install flow on the home page. */
export const AGENT_SETUP_HREF = '/#onboard';

/**
 * Whether the current surface must wait for the agent. `title` is the tooltip for a
 * disabled control (undefined while connected, so the control keeps its own title).
 */
export function useAgentRequired() {
  const { connected, envMismatch } = useDaemon();
  const { t } = useTranslation();
  return {
    connected,
    required: !connected,
    title: connected ? undefined : envMismatch ? envMismatchSummary(envMismatch) : t('agent.required'),
  };
}

interface SetUpAgentLinkProps {
  className?: string;
  onClick?: () => void;
}

/** "Set up your agent" link to the install flow; reusable as the action of a page banner. */
export function SetUpAgentLink({ className, onClick }: SetUpAgentLinkProps) {
  const { t } = useTranslation();
  return (
    <Link
      href={AGENT_SETUP_HREF}
      onClick={onClick}
      className={cn('font-medium text-accent-green no-underline hover:underline whitespace-nowrap', className)}
      data-testid="agent-required-setup-link"
    >
      {t('agent.setUp')}
    </Link>
  );
}

interface AgentRequiredNoticeProps {
  /** 'inline' sits next to a control; 'panel' fills an empty region (a list, a modal body). */
  variant?: 'inline' | 'panel';
  className?: string;
  'data-testid'?: string;
}

export function AgentRequiredNotice({ variant = 'inline', className, 'data-testid': testId }: AgentRequiredNoticeProps) {
  const { connected, envMismatch } = useDaemon();
  const { t } = useTranslation();
  if (connected) return null;
  if (envMismatch)
    return <AgentEnvMismatchNotice mismatch={envMismatch} variant={variant} className={className} data-testid={testId} />;
  const panel = variant === 'panel';

  return (
    <>
      <LocalAccessNotice className="mb-2" />
      <div
        className={cn(
          'text-xs text-text-secondary',
          panel
            ? 'flex flex-col items-center gap-2 px-4 py-6 text-center bg-bg-tertiary border border-border-default rounded-lg'
            : 'flex flex-wrap items-center gap-x-2 gap-y-1',
          className,
        )}
        data-testid={testId ?? 'agent-required'}
        role="status"
      >
        <span className={cn('flex items-center gap-1.5', panel && 'justify-center')}>
          <Icon name="wifi-off" size="sm" className="shrink-0 text-accent-yellow" />
          <span>{t('agent.required')}</span>
        </span>
        <SetUpAgentLink />
      </div>
    </>
  );
}
