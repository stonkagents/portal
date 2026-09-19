/**
 * Purpose: The one way to tell a person their local agent is not reachable.
 *          Three states, one noun ("your agent"), sentence case, one CTA at most.
 *          "Daemon" never reaches the screen; it lives in logs and code only.
 */
'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { useTranslation } from '@/providers/I18nProvider';
import { Icon } from './Icon';

type AgentOfflineState = 'not-installed' | 'offline' | 'reconnecting';

const COPY_KEY: Record<AgentOfflineState, string> = {
  'not-installed': 'agent.notInstalled',
  offline: 'agent.offline',
  reconnecting: 'agent.reconnecting',
};

interface AgentOfflineNoticeProps {
  state: AgentOfflineState;
  /** Optional detail after the sentence, e.g. what this page needs the agent for. */
  detail?: ReactNode;
  /** At most one action (a Button or Link). */
  action?: ReactNode;
  /** 'banner' sits above a page's content; 'panel' fills an empty region. */
  variant?: 'banner' | 'panel';
  className?: string;
  'data-testid'?: string;
}

export function AgentOfflineNotice({
  state,
  detail,
  action,
  variant = 'banner',
  className,
  'data-testid': testId,
}: AgentOfflineNoticeProps) {
  const { t } = useTranslation();
  const reconnecting = state === 'reconnecting';
  const panel = variant === 'panel';

  return (
    <div
      className={cn(
        'bg-bg-secondary border border-border-default rounded-lg text-sm text-text-secondary',
        panel ? 'flex flex-col items-center gap-3 px-6 py-10 text-center' : 'flex items-center gap-3 px-4 py-3',
        className,
      )}
      data-testid={testId ?? 'agent-offline-notice'}
      data-state={state}
      role="status"
      aria-live="polite"
    >
      <Icon
        name={reconnecting ? 'activity' : 'wifi-off'}
        size={panel ? 'lg' : 'sm'}
        className={cn('shrink-0', reconnecting ? 'text-accent-green' : 'text-accent-yellow')}
      />
      <div className={cn('min-w-0', panel ? 'flex flex-col gap-1' : 'flex flex-wrap items-center gap-x-2 gap-y-1 flex-1')}>
        <span className="font-medium text-text-primary">{t(COPY_KEY[state])}</span>
        {detail && <span className="text-text-tertiary">{detail}</span>}
      </div>
      {action && <div className={panel ? 'mt-1' : 'ml-auto shrink-0'}>{action}</div>}
    </div>
  );
}
