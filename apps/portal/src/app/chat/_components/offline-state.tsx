/**
 * Purpose: Offline state for chat and the profile — "Your agent is offline." with
 *          three setup steps and one action. The local agent IS the thing you chat
 *          with; there is no separate "daemon" to explain.
 */

import { Icon } from '@/components/ui';
import { useTranslation } from '@/providers/I18nProvider';
import { agentAddress } from '@/lib/agent-address';

interface OfflineStateProps {
  onConnect: () => void;
}

const STEPS = [
  'Install StonkAgents on this machine',
  `Start your agent. It runs on ${agentAddress()}`,
  'Chat opens automatically once it is running',
] as const;

export function OfflineState({ onConnect }: OfflineStateProps) {
  const { t } = useTranslation();
  return (
    <div
      className="flex flex-col items-center justify-center h-full text-center p-4"
      data-testid="agent-offline-notice"
      data-state="offline"
    >
      <div className="w-16 h-16 rounded-full bg-bg-tertiary flex items-center justify-center mb-4">
        <Icon name="wifi-off" size="xl" className="text-text-tertiary" />
      </div>
      <h2 className="text-xl font-bold text-text-primary mb-2">Your agent is offline.</h2>
      <p className="text-sm text-text-secondary max-w-md mb-4 leading-relaxed">
        Start it to chat. Your agent can search the network, share data, manage transfers, and more.
      </p>
      <ol className="flex flex-col gap-3 text-sm text-text-secondary text-left mb-4 max-w-md w-full list-none m-0 p-0">
        {STEPS.map((step, i) => (
          <li key={step} className="flex items-start gap-3">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-accent-green/15 text-accent-green text-xs font-bold shrink-0">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-text-tertiary max-w-md mb-6 leading-relaxed" data-testid="agent-offline-local-network-hint">
        {t('agent.localNetworkHint')}
      </p>
      <button
        onClick={onConnect}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-accent-green text-bg-primary font-medium text-sm hover:brightness-110 active:brightness-90 transition-[filter] min-h-[44px]"
        data-testid="ac-connect-daemon"
      >
        <Icon name="power" size="sm" /> Connect your agent
      </button>
    </div>
  );
}
