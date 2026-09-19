/**
 * Purpose: Autonomy tab: auto-start (bound to the agent), autopilot (how far the agent may go
 *          on the board on its own), the kill switch (stops and starts the agent through the
 *          provider, same path as the navbar), and the safety-events empty state.
 */
'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon, Button, EmptyState } from '@/components/ui';
import { SectionTitle, SettingsCard } from './shared';
import Link from 'next/link';
import { AutoStartSection } from './AutoStartSection';
import { AutopilotSection } from './AutopilotSection';
import { useDaemon } from '@/providers/DaemonProvider';
import { useToast } from '@/providers/ToastProvider';
import { CommandToolsNotice } from '@/components/layout/CommandToolsNotice';

export const KILL_SWITCH_STOP_TOAST = 'Stop requested';
export const KILL_SWITCH_START_TOAST = 'Start requested';
export const KILL_SWITCH_REFUSED_TOAST = 'The StonkAgents Controller did not answer';

export function AutonomyTab() {
  const { connected, daemonStatus, support, stoppedByUser, stopAgent, startAgent } = useDaemon();
  const { addToast } = useToast();
  const [busy, setBusy] = useState(false);
  /* Both directions go through the controller service on this machine; nothing to call on an unsupported platform. */
  const canToggle = support === 'supported' && !busy;

  async function handleToggle() {
    if (!canToggle) return;
    const stopping = connected;
    setBusy(true);
    try {
      const ok = stopping ? await stopAgent() : await startAgent();
      if (!ok) {
        addToast({ title: KILL_SWITCH_REFUSED_TOAST, description: 'Check that the controller service is running.', variant: 'error' });
        return;
      }
      addToast({
        title: stopping ? KILL_SWITCH_STOP_TOAST : KILL_SWITCH_START_TOAST,
        description: stopping ? 'Your agent is shutting down. Start it again from here or the navbar.' : 'Your agent is starting.',
        variant: stopping ? 'warning' : 'success',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="settings-autonomy">
      {/* The autonomy controls need the OpenClaw command tools, which install in the background after the agent is live (2.6.0+). */}
      <CommandToolsNotice className="mb-4" />

      {/* Auto-Start */}
      <AutoStartSection />

      {/* Autopilot: how far the agent may go on the board without its owner */}
      <AutopilotSection />

      {/* Kill Switch: stops the agent process; every network action stops with it */}
      <div className="bg-accent-red/6 border border-accent-red/20 rounded-lg p-4 mb-4" data-testid="kill-switch">
        <div className="flex items-center gap-2 text-sm font-bold text-accent-red mb-1">
          <Icon name="alert-triangle" size="sm" /> Kill Switch
        </div>
        <p className="text-xs text-text-secondary mb-3">
          Stops your agent on this machine. All sharing, chat, transfers and board posting stop until you start it again. Your data and
          identity stay on disk.
        </p>
        {connected ? (
          <Button
            variant="danger"
            size="sm"
            icon="power"
            onClick={() => void handleToggle()}
            disabled={!canToggle}
            loading={busy}
            data-testid="kill-switch-activate"
          >
            Stop agent
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            icon="play"
            onClick={() => void handleToggle()}
            disabled={!canToggle}
            loading={busy}
            title={support === 'supported' ? undefined : 'The agent does not run on this platform.'}
            data-testid="kill-switch-activate"
          >
            Start agent
          </Button>
        )}
        <div className="flex items-center gap-2 mt-3 text-xs" data-testid="kill-switch-status">
          <span
            className={cn(
              'w-2 h-2 rounded-full',
              daemonStatus === 'online' ? 'bg-accent-green' : daemonStatus === 'degraded' ? 'bg-accent-yellow' : 'bg-accent-red',
            )}
          />
          {daemonStatus === 'online'
            ? 'Agent running'
            : daemonStatus === 'degraded'
              ? 'Agent running (degraded)'
              : stoppedByUser
                ? 'Safe mode: stopped by you'
                : 'Agent stopped'}
        </div>
      </div>

      {/* Safety Events: the agent does not report incidents yet, so this is an honest empty state */}
      <SettingsCard className="mb-0">
        <SectionTitle>Safety Events</SectionTitle>
        <EmptyState
          icon="shield"
          size="sm"
          title="No safety events yet."
          data-testid="incident-empty"
          className="py-6"
          description={
            <>
              Kill switch activations and blocked actions will show here. Everything else your agent does is on the{' '}
              <Link href="/activity" className="text-accent-blue hover:underline" data-testid="activity-log-link">
                activity feed
              </Link>
              .
            </>
          }
        />
      </SettingsCard>
    </div>
  );
}
