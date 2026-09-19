/**
 * Purpose: Unified event types for the agent-first notification system.
 *          All events from daemon, agent, and OpenClaw are normalized to ClawEvent
 *          before storage and display.
 */

export type EventCategory = 'sync' | 'peer' | 'reputation' | 'credit' | 'security' | 'system' | 'agent';
export type EventTriage = 'silent' | 'digest' | 'nudge' | 'alert';
type EventSource = 'daemon' | 'agent' | 'openclaw' | 'portal';

export interface ClawEventAction {
  label: string;
  type: 'link' | 'command';
  href?: string;
  command?: string;
  variant: 'primary' | 'ghost';
}

export interface ClawEvent {
  id: string;
  timestamp: string;
  source: EventSource;
  category: EventCategory;
  triage: EventTriage;
  title: string;
  description: string;
  agentAction?: string;
  agentReasoning?: string;
  read: boolean;
  dismissed: boolean;
  actions?: ClawEventAction[];
  relatedEvents?: string[];
  metadata?: Record<string, unknown>;
}

export const EVENT_CATEGORIES: EventCategory[] = ['sync', 'peer', 'reputation', 'credit', 'security', 'system', 'agent'];

export const EVENT_TRIAGE_LEVELS: EventTriage[] = ['silent', 'digest', 'nudge', 'alert'];

export interface CategoryMeta {
  icon: string;
  colorClass: string;
  label: string;
}

export const CATEGORY_META: Record<EventCategory, CategoryMeta> = {
  sync: { icon: 'arrow-up-down', colorClass: 'bg-accent-blue/8 text-accent-blue', label: 'Sync' },
  peer: { icon: 'users', colorClass: 'bg-accent-blue/8 text-accent-blue', label: 'Peers' },
  reputation: { icon: 'trending-up', colorClass: 'bg-accent-green/8 text-accent-green', label: 'Reputation' },
  credit: { icon: 'zap', colorClass: 'bg-accent-green/8 text-accent-green', label: 'Credits' },
  security: { icon: 'shield', colorClass: 'bg-accent-red/8 text-accent-red', label: 'Security' },
  system: { icon: 'server', colorClass: 'bg-accent-yellow/8 text-accent-yellow', label: 'System' },
  agent: { icon: 'cpu', colorClass: 'bg-accent-purple/8 text-accent-purple', label: 'Agent' },
};

export function isClawEvent(value: unknown): value is ClawEvent {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.timestamp === 'string' &&
    typeof obj.title === 'string' &&
    typeof obj.category === 'string' &&
    typeof obj.triage === 'string' &&
    EVENT_CATEGORIES.includes(obj.category as EventCategory) &&
    EVENT_TRIAGE_LEVELS.includes(obj.triage as EventTriage)
  );
}

export function isAlertOrNudge(event: ClawEvent): boolean {
  return event.triage === 'alert' || event.triage === 'nudge';
}

// ── Notification Preferences ────────────────────────────────────────

export type PresetName = 'minimal' | 'balanced' | 'everything';

export interface NotificationPrefs {
  preset: PresetName;
  overrides: Record<EventCategory, EventTriage>;
}

export const PRESET_DEFAULTS: Record<PresetName, Record<EventCategory, EventTriage>> = {
  minimal: {
    sync: 'silent',
    peer: 'silent',
    reputation: 'silent',
    credit: 'silent',
    security: 'alert',
    system: 'silent',
    agent: 'silent',
  },
  balanced: {
    sync: 'nudge',
    peer: 'silent',
    reputation: 'silent',
    credit: 'nudge',
    security: 'alert',
    system: 'nudge',
    agent: 'nudge',
  },
  everything: {
    sync: 'nudge',
    peer: 'nudge',
    reputation: 'nudge',
    credit: 'nudge',
    security: 'alert',
    system: 'nudge',
    agent: 'nudge',
  },
};
