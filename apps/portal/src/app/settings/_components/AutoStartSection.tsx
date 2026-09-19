/**
 * Purpose: Auto-start section for the Autonomy tab, bound to the agent's `autostart`
 *          setup check. Off: the switch calls the autostart fix (the controller sets
 *          the services to start automatically). On: read-only, because the agent has
 *          no endpoint to turn it off; the installer owns that.
 */
'use client';

import { AgentRequiredNotice } from '@/components/features/onboarding/AgentRequiredNotice';
import { useSetupCheck, useSetupFix, SETUP_UNSUPPORTED_MESSAGE } from '@/lib/api/hooks/use-agent-settings';
import { useDaemon } from '@/providers/DaemonProvider';
import { useToast } from '@/providers/ToastProvider';
import { SectionTitle, SettingsCard, SwitchRow } from './shared';

export const AUTOSTART_ENABLED_TOAST = 'Auto-start enabled';
export const AUTOSTART_ON_NOTE =
  'On. Your agent starts with Windows. To turn it off, uninstall or reinstall the agent; the installer manages this.';
export const AUTOSTART_OFF_NOTE = 'Turn on to start your agent with Windows. This asks Windows for permission once.';

export function AutoStartSection() {
  const { connected } = useDaemon();
  const { addToast } = useToast();
  const { check, loading, unsupported } = useSetupCheck('autostart');
  const fix = useSetupFix();

  const on = connected && check?.status === 'ok';
  const known = connected && check !== null;
  const editable = connected && known && !on && !unsupported && !loading && !fix.isPending;

  function enable() {
    if (!editable) return;
    fix.mutate(
      { id: 'autostart' },
      {
        onSuccess: () => addToast({ title: AUTOSTART_ENABLED_TOAST, variant: 'success' }),
        onError: error => addToast({ title: 'Could not enable auto-start', description: error.message, variant: 'error' }),
      },
    );
  }

  const helper = !connected
    ? undefined
    : unsupported
      ? SETUP_UNSUPPORTED_MESSAGE
      : loading || !known
        ? 'Reading from your agent...'
        : on
          ? AUTOSTART_ON_NOTE
          : (check?.message ?? AUTOSTART_OFF_NOTE);

  return (
    <div data-testid="auto-start-section">
      <SettingsCard>
        <SectionTitle>Agent Auto-Start</SectionTitle>
        <SwitchRow
          label="Start StonkAgents with Windows"
          helper={helper}
          on={on}
          onChange={on ? undefined : enable}
          disabled={!editable && !on}
          testId="auto-start-toggle"
        />
        {!connected && <AgentRequiredNotice data-testid="auto-start-agent-required" />}
      </SettingsCard>
    </div>
  );
}
