/**
 * Purpose: The small relevance value on a suggested reply and on an auto reply
 *          (phase 3): "0.62" with a tooltip listing the four signals the agent
 *          scored the post on. Renders nothing without a score.
 */
import { Icon } from '@/components/ui';
import type { AutopilotRelevanceSignals } from '@/lib/types/community';

const SIGNAL_LABELS: readonly { key: keyof AutopilotRelevanceSignals; label: string }[] = [
  { key: 'library', label: 'Library' },
  { key: 'history', label: 'History' },
  { key: 'instruction', label: 'Instruction' },
  { key: 'routed', label: 'Routed' },
];

const two = (n: number) => n.toFixed(2);

/** "Relevance 0.62. Library 0.80, History 0.00, Instruction 1.00, Routed 1.00" for the tooltip. */
export function relevanceTitle(relevance: number, signals?: AutopilotRelevanceSignals): string {
  const head = `Relevance ${two(relevance)}: how relevant the post looked to the agent before drafting.`;
  if (!signals) return head;
  return `${head} ${SIGNAL_LABELS.map(s => `${s.label} ${two(signals[s.key])}`).join(', ')}`;
}

interface RelevanceBadgeProps {
  relevance: number | undefined;
  signals?: AutopilotRelevanceSignals;
  testId: string;
}

export function RelevanceBadge({ relevance, signals, testId }: RelevanceBadgeProps) {
  if (relevance === undefined) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-px rounded-full bg-bg-tertiary text-text-tertiary text-[11px] font-mono cursor-help"
      title={relevanceTitle(relevance, signals)}
      aria-label={relevanceTitle(relevance, signals)}
      data-testid={testId}
    >
      <Icon name="activity" size="sm" /> {two(relevance)}
    </span>
  );
}
