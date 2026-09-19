/**
 * Purpose: The relevance section of the Autopilot card (phase 3): the mode
 *          (off / skip / note), the threshold slider in 0.05 steps, the
 *          "Skipped N, drafted M this month" line, the thresholds the agent
 *          tuned per category next to the slider, and optional per-category
 *          pins that stop the tuning for that category. Edits go to the card's
 *          draft; the card saves.
 */
'use client';

import { cn } from '@/lib/utils/cn';
import { FormField } from './shared';
import { PIN_MIN, type AutopilotDraft } from './autopilot-form';
import { categoryLabel, PIN_CATEGORIES, relevanceCountersLine, RELEVANCE_MODES, RELEVANCE_SLIDER, sliderValueLabel, tunedLine } from './autopilot-relevance';
import type { AutopilotStatus } from '@/lib/types/community';

export const RELEVANCE_HELPER =
  'Before paying for a draft your agent scores the post against its library, its past wins, your instruction and whether the request was routed to it.';

const PIN_CLS =
  'w-20 min-h-[36px] px-2 py-1 bg-bg-tertiary border border-border-default rounded-lg text-sm text-text-primary font-mono outline-none focus:border-accent-green/50 disabled:cursor-not-allowed';

interface AutopilotRelevanceProps {
  draft: Pick<AutopilotDraft, 'relevanceMode' | 'relevanceThreshold' | 'relevancePins'>;
  status: AutopilotStatus | null;
  onChange: (next: Partial<AutopilotDraft>) => void;
  pinsError?: string;
}

export function AutopilotRelevance({ draft, status, onChange, pinsError }: AutopilotRelevanceProps) {
  const tuned = status ? Object.entries(status.tunedThresholds) : [];
  const scoring = draft.relevanceMode !== 'off';

  return (
    <FormField label="Relevance" helper={RELEVANCE_HELPER}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3" role="radiogroup" aria-label="Relevance mode">
        {RELEVANCE_MODES.map(mode => {
          const active = draft.relevanceMode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange({ relevanceMode: mode.id })}
              className={cn(
                'text-left p-3 rounded-lg border transition-colors cursor-pointer bg-transparent disabled:cursor-not-allowed',
                active ? 'border-accent-green bg-accent-green/8' : 'border-border-default hover:border-border-hover',
              )}
              data-testid={`autopilot-relevance-mode-${mode.id}`}
            >
              <div className={cn('text-sm font-semibold', active ? 'text-accent-green' : 'text-text-primary')}>{mode.label}</div>
              <div className="text-xs text-text-tertiary mt-1">{mode.description}</div>
            </button>
          );
        })}
      </div>

      {status && (
        <p className="text-xs text-text-secondary mb-2" data-testid="autopilot-relevance-counters">
          {relevanceCountersLine(status.relevance)}
        </p>
      )}

      <div className={cn('flex flex-wrap items-center gap-3', !scoring && 'opacity-60')}>
        <label className="flex items-center gap-3 flex-1 min-w-[220px] text-xs text-text-secondary">
          <span className="shrink-0">Threshold</span>
          <input
            type="range"
            min={RELEVANCE_SLIDER.min}
            max={RELEVANCE_SLIDER.max}
            step={RELEVANCE_SLIDER.step}
            value={draft.relevanceThreshold}
            onChange={e => onChange({ relevanceThreshold: Number(e.target.value) })}
            disabled={!scoring}
            className="flex-1 accent-accent-green"
            aria-label="Relevance threshold"
            aria-valuetext={sliderValueLabel(draft.relevanceThreshold)}
            data-testid="autopilot-relevance-threshold"
          />
          <span className="font-mono text-text-primary w-10 text-right" data-testid="autopilot-relevance-threshold-value">
            {sliderValueLabel(draft.relevanceThreshold)}
          </span>
        </label>
        {tuned.length > 0 && (
          <ul className="flex flex-col gap-0.5 text-xs text-text-tertiary font-mono" data-testid="autopilot-tuned-thresholds">
            {tuned.map(([category, t]) => (
              <li key={category} data-testid={`autopilot-tuned-${category}`}>
                {tunedLine(category, t, draft.relevanceThreshold, Boolean(draft.relevancePins[category]?.trim()))}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pins: a fixed threshold per category; the agent never tunes a pinned one */}
      <div className="flex flex-wrap items-center gap-3 mt-3" data-testid="autopilot-relevance-pins">
        <span className="text-xs text-text-secondary">Pin per category</span>
        {PIN_CATEGORIES.map(cat => (
          <label key={cat} className="flex items-center gap-1.5 text-xs text-text-tertiary">
            {categoryLabel(cat)}
            <input
              type="number"
              min={PIN_MIN}
              max={1}
              step={0.05}
              value={draft.relevancePins[cat] ?? ''}
              onChange={e => onChange({ relevancePins: { ...draft.relevancePins, [cat]: e.target.value } })}
              placeholder="auto"
              className={PIN_CLS}
              aria-label={`${categoryLabel(cat)} relevance pin`}
              data-testid={`autopilot-relevance-pin-${cat}`}
            />
          </label>
        ))}
      </div>
      {pinsError && (
        <p className="text-xs text-accent-red mt-1" role="alert" data-testid="autopilot-relevance-pins-invalid">
          {pinsError}
        </p>
      )}
    </FormField>
  );
}
