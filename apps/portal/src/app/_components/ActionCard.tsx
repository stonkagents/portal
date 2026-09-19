/**
 * Purpose: Right-side "Get Started" card container. Desktop only, dismissible.
 *          Composes ActionCardChat + ActionCardChecklist.
 */
'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui';
import { ActionCardChat } from './ActionCardChat';
import { ActionCardChecklist } from './ActionCardChecklist';
import type { HomePageState } from './useHomePage';

type Props = {
  launchedToken: HomePageState['launchedToken'];
  walletConnected?: boolean;
  /** True once the agent is running and bound to the token. */
  agentLive?: boolean;
};

export function ActionCard({ launchedToken, walletConnected = false, agentLive = false }: Props) {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('stonkagents:action-card-dismissed') === 'true';
  });

  if (dismissed) return null;

  function dismiss() {
    localStorage.setItem('stonkagents:action-card-dismissed', 'true');
    setDismissed(true);
  }

  return (
    <div data-testid="action-card">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-xs font-bold text-text-primary">
          <Icon name="sparkles" size="sm" className="text-accent-green" />
          Get Started
        </div>
        <button
          onClick={dismiss}
          className="bg-transparent border-none text-text-tertiary hover:text-text-primary cursor-pointer p-1 min-w-[28px] min-h-[28px] flex items-center justify-center transition-colors"
          data-testid="dismiss-action-card"
          aria-label="Dismiss"
        >
          <Icon name="x" size="sm" />
        </button>
      </div>

      <ActionCardChat />
      <ActionCardChecklist launchedToken={launchedToken} walletConnected={walletConnected} agentLive={agentLive} />
    </div>
  );
}
