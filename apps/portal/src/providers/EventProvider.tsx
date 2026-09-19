/**
 * Purpose: Central context for notification events. Manages event state,
 *          read/dismissed persistence in localStorage, preferences, and
 *          alertCount for the bell badge.
 */
'use client';

import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from 'react';
import type { ClawEvent, NotificationPrefs } from '@/lib/types/claw-event';
import { isAlertOrNudge } from '@/lib/types/claw-event';
import { MAX_EVENTS, LS_PREFS, LS_READ_IDS, LS_DISMISSED_IDS, DEFAULT_PREFS, loadJson, saveJson } from './event-storage';
import { useDaemonEvents } from './use-daemon-events';
import { useBackendActivityEvents } from './use-backend-activity-events';
import { useAutopilotEvents } from './use-autopilot-events';

/* ── Context shape ─────────────────────────────────────────────────── */

interface EventContextType {
  events: ClawEvent[];
  alertCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  preferences: NotificationPrefs;
  updatePreferences: (p: NotificationPrefs) => void;
  addEvent: (event: ClawEvent) => void;
}

const EventContext = createContext<EventContextType | null>(null);

/* ── Provider ──────────────────────────────────────────────────────── */

export function EventProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<ClawEvent[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set(loadJson<string[]>(LS_READ_IDS, [])));
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set(loadJson<string[]>(LS_DISMISSED_IDS, [])));
  const [preferences, setPreferences] = useState<NotificationPrefs>(() => loadJson<NotificationPrefs>(LS_PREFS, DEFAULT_PREFS));

  /* Persist read/dismissed IDs on change */
  useEffect(() => {
    saveJson(LS_READ_IDS, [...readIds]);
  }, [readIds]);
  useEffect(() => {
    saveJson(LS_DISMISSED_IDS, [...dismissedIds]);
  }, [dismissedIds]);

  const addEvent = useCallback((event: ClawEvent) => {
    setEvents(prev => {
      if (prev.some(e => e.id === event.id)) return prev;
      const adjusted: ClawEvent = {
        ...event,
        read: event.read || readIds.has(event.id),
        dismissed: event.dismissed || dismissedIds.has(event.id),
      };
      const next = [adjusted, ...prev].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markRead = useCallback((id: string) => {
    setEvents(prev => prev.map(e => (e.id === id ? { ...e, read: true } : e)));
    setReadIds(prev => {
      const n = new Set(prev);
      n.add(id);
      return n;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setEvents(prev => {
      const allIds = prev.map(e => e.id);
      setReadIds(old => {
        const n = new Set(old);
        allIds.forEach(id => n.add(id));
        return n;
      });
      return prev.map(e => ({ ...e, read: true }));
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    setEvents(prev => prev.map(e => (e.id === id ? { ...e, dismissed: true, read: true } : e)));
    setDismissedIds(prev => {
      const n = new Set(prev);
      n.add(id);
      return n;
    });
    setReadIds(prev => {
      const n = new Set(prev);
      n.add(id);
      return n;
    });
  }, []);

  const updatePreferences = useCallback((p: NotificationPrefs) => {
    setPreferences(p);
    saveJson(LS_PREFS, p);
  }, []);

  /* Wire daemon health transitions → system events; "back online" marks the offline alert read */
  useDaemonEvents(addEvent, markRead);

  /* Wire backend activity entries → digest events */
  useBackendActivityEvents(addEvent);

  /* Wire new autopilot drafts → "Your agent has N suggested replies" nudges */
  useAutopilotEvents(addEvent);

  const alertCount = useMemo(() => events.filter(e => isAlertOrNudge(e) && !e.read && !e.dismissed).length, [events]);

  const value = useMemo<EventContextType>(
    () => ({ events, alertCount, markRead, markAllRead, dismiss, preferences, updatePreferences, addEvent }),
    [events, alertCount, markRead, markAllRead, dismiss, preferences, updatePreferences, addEvent],
  );

  return <EventContext.Provider value={value}>{children}</EventContext.Provider>;
}

/* ── Hook ──────────────────────────────────────────────────────────── */

export function useEvents(): EventContextType {
  const ctx = useContext(EventContext);
  if (!ctx) throw new Error('useEvents must be used within an EventProvider');
  return ctx;
}
