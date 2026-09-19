/**
 * Purpose: Polls /api/activity/recent every 30s, transforms entries to
 *          digest-level ClawEvents, deduplicates by event ID.
 *          Silent failure — never shows toast on network error.
 */
import { useRef, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api/client';
import type { ClawEvent, EventCategory } from '@/lib/types/claw-event';

type AddEvent = (event: ClawEvent) => void;

const POLL_INTERVAL = 30_000;

interface BackendActivityEntry {
  type: string;
  title: string;
  time_ago: string;
  occurred_at: string;
  color: string;
}

function categoryForType(type: string): EventCategory {
  switch (type) {
    case 'share':
    case 'install':
      return 'sync';
    case 'join':
      return 'peer';
    default:
      return 'system';
  }
}

function toClawEvent(entry: BackendActivityEntry): ClawEvent {
  return {
    id: `backend-${entry.type}-${entry.occurred_at}`,
    timestamp: entry.occurred_at,
    source: 'portal',
    category: categoryForType(entry.type),
    triage: 'digest',
    title: entry.title,
    description: entry.title,
    read: false,
    dismissed: false,
  };
}

export function useBackendActivityEvents(addEvent: AddEvent): void {
  const seenIdsRef = useRef<Set<string>>(new Set());

  const poll = useCallback(async () => {
    try {
      const entries = await apiClient<BackendActivityEntry[]>('/api/activity/recent?limit=10');
      for (const entry of entries) {
        const event = toClawEvent(entry);
        if (!seenIdsRef.current.has(event.id)) {
          seenIdsRef.current.add(event.id);
          addEvent(event);
        }
      }
    } catch {
      // Silent failure — no toast, no log
    }
  }, [addEvent]);

  useEffect(() => {
    poll();
    const timer = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [poll]);
}
