/**
 * Purpose: Raises "Your agent has N suggested replies" in the bell when the
 *          agent's autopilot drafts something new. Polls the suggestions inbox
 *          every 30 s while the agent is connected; a suggestion id seen once
 *          never nudges again, so the bell fires on new drafts, not on every
 *          poll. Silent failure, like the other event sources: an agent that
 *          predates autopilot (404) or does not answer adds nothing. The
 *          weekly digests are not raised here: the bell lists them straight
 *          from the daemon's events (notifications/use-digest-rows.ts).
 */
import { useCallback, useEffect, useRef } from 'react';
import { getAutopilotSuggestions } from '@/lib/api/daemon-autopilot';
import { useDaemon } from '@/providers/DaemonProvider';
import type { AutopilotSuggestion } from '@/lib/types/community';
import type { ClawEvent } from '@/lib/types/claw-event';

type AddEvent = (event: ClawEvent) => void;

const POLL_INTERVAL = 30_000;

/** Where the bell entry sends the owner: the inbox sits above the compose box on the board. */
export const SUGGESTIONS_HREF = '/community';

export function suggestionsEventTitle(count: number): string {
  return `Your agent has ${count} suggested ${count === 1 ? 'reply' : 'replies'}`;
}

/** One nudge per batch of new drafts; the id carries the newest draft so a repeat poll dedupes. */
export function toSuggestionsEvent(pending: AutopilotSuggestion[], newest: AutopilotSuggestion): ClawEvent {
  return {
    id: `autopilot-suggestions-${newest.id}`,
    timestamp: newest.createdAt || new Date().toISOString(),
    source: 'daemon',
    category: 'agent',
    triage: 'nudge',
    title: suggestionsEventTitle(pending.length),
    description: 'Review the drafts on the board and approve the ones you want posted.',
    read: false,
    dismissed: false,
    actions: [{ label: 'Review', type: 'link', href: SUGGESTIONS_HREF, variant: 'primary' }],
    metadata: { suggestionIds: pending.map(s => s.id) },
  };
}

export function useAutopilotEvents(addEvent: AddEvent): void {
  const { connected } = useDaemon();
  const seenIdsRef = useRef<Set<string>>(new Set());

  const poll = useCallback(async () => {
    const result = await getAutopilotSuggestions();
    if (result.kind !== 'ok') return;
    const fresh = result.value.filter(s => !seenIdsRef.current.has(s.id));
    if (fresh.length === 0) return;
    fresh.forEach(s => seenIdsRef.current.add(s.id));
    /* The newest unseen draft names the event; the title counts everything still pending. */
    const newest = fresh.reduce((a, b) => (Date.parse(b.createdAt) > Date.parse(a.createdAt) ? b : a));
    addEvent(toSuggestionsEvent(result.value, newest));
  }, [addEvent]);

  useEffect(() => {
    if (!connected) return;
    void poll();
    const timer = setInterval(() => void poll(), POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [connected, poll]);
}
