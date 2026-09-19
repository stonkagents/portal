/**
 * Purpose: React Query hooks and helper functions for ClawEvent data.
 *          Provides filtering, sorting, and unread count utilities.
 *          API endpoints are placeholders until backend is ready.
 */
import type { ClawEvent, EventCategory, EventTriage } from '@/lib/types/claw-event';

export interface EventFilters {
  category: EventCategory | 'all';
  triage: EventTriage | 'all';
  showSilent: boolean;
  search: string;
}

export function filterEvents(events: ClawEvent[], filters: EventFilters): ClawEvent[] {
  return events.filter(event => {
    if (filters.category !== 'all' && event.category !== filters.category) {
      return false;
    }
    if (filters.triage !== 'all' && event.triage !== filters.triage) {
      return false;
    }
    if (!filters.showSilent && event.triage === 'silent') {
      return false;
    }
    if (filters.search) {
      const query = filters.search.toLowerCase();
      const inTitle = event.title.toLowerCase().includes(query);
      const inDesc = event.description.toLowerCase().includes(query);
      if (!inTitle && !inDesc) {
        return false;
      }
    }
    return true;
  });
}

export function sortEventsByTime(events: ClawEvent[]): ClawEvent[] {
  return [...events].sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

export function getUnreadAlertCount(events: ClawEvent[]): number {
  return events.filter(
    e => !e.read && (e.triage === 'alert' || e.triage === 'nudge')
  ).length;
}
