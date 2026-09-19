/**
 * Purpose: Generates system ClawEvents when daemon health status transitions.
 *          Skips the initial mount and only fires on actual transitions:
 *          one "went offline" alert per drop, and one "back online" nudge when
 *          the agent answers again after that alert, which also marks the
 *          offline alert read so the two never contradict each other. The
 *          first healthy probe after page load raises nothing, since no
 *          offline alert preceded it.
 */
import { useRef, useEffect } from 'react';
import { useDaemon, type DaemonStatus } from '@/providers/DaemonProvider';
import type { ClawEvent } from '@/lib/types/claw-event';

type AddEvent = (event: ClawEvent) => void;
type ResolveEvent = (id: string) => void;

function makeSystemEvent(status: DaemonStatus, triage: 'alert' | 'nudge' | 'digest', title: string, description: string): ClawEvent {
  return {
    id: `sys-${status}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    source: 'daemon',
    category: 'system',
    triage,
    title,
    description,
    read: false,
    dismissed: false,
  };
}

/**
 * @param addEvent Appends a new event.
 * @param resolveEvent Marks an earlier event read once a later one supersedes it (the
 *   offline alert when the agent is back). Optional so older callers keep working.
 */
export function useDaemonEvents(addEvent: AddEvent, resolveEvent?: ResolveEvent): void {
  const { daemonStatus } = useDaemon();
  const prevRef = useRef<DaemonStatus | null>(null);
  /** The offline alert still waiting for its "back online" counterpart, if any. */
  const openOfflineIdRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = daemonStatus;

    // Skip initial mount
    if (prev === null) return;
    // Skip if status unchanged
    if (prev === daemonStatus) return;

    if (daemonStatus === 'offline') {
      const offline = makeSystemEvent('offline', 'alert', 'Your agent went offline', 'Your agent is unreachable. Check that it is still running.');
      openOfflineIdRef.current = offline.id;
      addEvent(offline);
      return;
    }

    const offlineId = openOfflineIdRef.current;
    if (prev === 'offline' && offlineId !== null) {
      openOfflineIdRef.current = null;
      const online = makeSystemEvent(
        'online',
        'nudge',
        'Your agent is back online',
        daemonStatus === 'degraded' ? 'Your agent has reconnected but is slow to respond.' : 'Your agent has reconnected.',
      );
      addEvent({ ...online, relatedEvents: [offlineId] });
      resolveEvent?.(offlineId);
      return;
    }

    if (daemonStatus === 'degraded') {
      addEvent(makeSystemEvent('degraded', 'nudge', 'Your agent is slow to respond', 'Your agent is responding slowly or partially.'));
    }
  }, [daemonStatus, addEvent, resolveEvent]);
}
