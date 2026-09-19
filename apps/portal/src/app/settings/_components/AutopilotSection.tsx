/**
 * Purpose: Settings > Autonomy > Autopilot card. Loads the agent's autopilot
 *          policy and status, lets the owner pick a mode, tick categories, set
 *          budgets, a standing instruction and office hours, and POSTs only the
 *          changed keys on Save; Reset drops the unsaved edits. Inert with the agent notice offline, and with
 *          the update note when the running agent predates autopilot. Phase 3
 *          adds the relevance section and the 30-day outcome strip.
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Button, Icon } from '@/components/ui';
import { AgentRequiredNotice } from '@/components/features/onboarding/AgentRequiredNotice';
import { DEFAULT_AUTOPILOT_POLICY } from '@/lib/api/transformers/community';
import { AUTOPILOT_UNSUPPORTED_MESSAGE, useAutopilot, useSaveAutopilot } from '@/lib/api/hooks/use-autopilot';
import { useDaemon } from '@/providers/DaemonProvider';
import { useToast } from '@/providers/ToastProvider';
import { FormField, InputWithSuffix, SectionTitle, SettingsCard, SwitchRow } from './shared';
import { AutopilotLedgerStrip } from './AutopilotLedgerStrip';
import { AutopilotRelevance } from './AutopilotRelevance';
import {
  AUTOPILOT_CATEGORIES,
  AUTOPILOT_INSTRUCTION_MAX_LENGTH,
  AUTOPILOT_MODES,
  browserTimeZone,
  budgetFieldsFor,
  digestHourLabel,
  DIGEST_WEEKDAYS,
  draftFromPolicy,
  hasErrors,
  lastRunLabel,
  nextDigestLabel,
  policyPatch,
  statusLine,
  toggleCategory,
  validateDraft,
  type AutopilotDraft,
} from './autopilot-form';

export const AUTOPILOT_SAVED_TOAST = 'Autopilot settings saved';
export const AUTOPILOT_SAVE_FAILED_TOAST = 'Could not save autopilot settings';
export const AUTOPILOT_INSTRUCTION_HELPER =
  'Prepended to every draft your agent writes on the board. Tone, what to offer, what to stay out of.';

/** One Fast draft per digest, the contract's price (phase 2, section 3). */
export const AUTOPILOT_DIGEST_DRAFT_CREDITS = 10;
const DIGEST_HOURS = Array.from({ length: 24 }, (_, h) => h);

const TEXTAREA_CLS =
  'w-full min-h-[96px] px-3 py-2 bg-bg-tertiary border border-border-default rounded-lg text-sm text-text-primary font-mono outline-none focus:border-accent-green/50 disabled:cursor-not-allowed resize-y';
const TIME_CLS =
  'min-h-[44px] px-3 py-2 bg-bg-tertiary border border-border-default rounded-lg text-sm text-text-primary font-mono outline-none focus:border-accent-green/50 disabled:cursor-not-allowed';

export function AutopilotSection() {
  const { connected } = useDaemon();
  const { addToast } = useToast();
  const query = useAutopilot();
  const save = useSaveAutopilot();

  const settings = connected ? (query.data ?? null) : null;
  const saved = settings?.policy ?? DEFAULT_AUTOPILOT_POLICY;
  const [draft, setDraft] = useState<AutopilotDraft>(() => draftFromPolicy(saved));
  const tz = useMemo(browserTimeZone, []);

  /* A fresh answer from the agent (first load, a save, another tab) resets the draft. React Query keeps
     the same object across an unchanged 30 s refetch, so typing is not interrupted by the poll. */
  useEffect(() => {
    setDraft(draftFromPolicy(saved));
  }, [saved]);

  const unsupported = connected && query.isFetched && query.data === null;
  const loading = connected && query.isLoading;
  const loadFailed = connected && query.isError;
  const editable = connected && !unsupported && !loading && !loadFailed;

  const errors = validateDraft(draft);
  const invalid = hasErrors(errors);
  const patch = policyPatch(draft, saved, tz);
  const changed = Object.keys(patch).length > 0;
  const canSave = editable && changed && !invalid && !save.isPending;

  const update = (next: Partial<AutopilotDraft>) => setDraft(prev => ({ ...prev, ...next }));
  /* Reset: back to what the agent has; nothing is sent. Offered while there are unsaved edits, even refused ones. */
  const dirty = changed || invalid;
  const handleReset = () => setDraft(draftFromPolicy(saved));

  function handleSave() {
    if (!canSave) return;
    save.mutate(patch, {
      onSuccess: () => addToast({ title: AUTOPILOT_SAVED_TOAST, variant: 'success' }),
      onError: error => addToast({ title: AUTOPILOT_SAVE_FAILED_TOAST, description: error.message, variant: 'error' }),
    });
  }

  const instructionCount = `${draft.instruction.length}/${AUTOPILOT_INSTRUCTION_MAX_LENGTH}`;

  return (
    <SettingsCard>
      <div data-testid="autopilot-section">
        <SectionTitle>Autopilot</SectionTitle>
        <p className="text-xs text-text-secondary mb-4">
          How far your agent may go on the board without you. Every reply it posts on its own is tagged “auto” and spends your credits.
        </p>

        {/* Status strip: what the agent did today, and why it held back if it did */}
        {settings && (
          <div
            className="flex flex-col gap-1 px-3 py-2 mb-4 bg-bg-tertiary border border-border-default border-l-[3px] border-l-accent-green rounded-lg text-xs text-text-secondary"
            role="status"
            data-testid="autopilot-status"
          >
            <span className="flex items-center gap-2">
              <Icon name="activity" size="sm" className="text-accent-green shrink-0" />
              {statusLine(settings.status)}
            </span>
            {settings.status.downgradedReason && (
              <span className="flex items-center gap-2 text-accent-yellow" data-testid="autopilot-downgraded">
                <Icon name="alert-triangle" size="sm" className="shrink-0" />
                {settings.status.downgradedReason}
              </span>
            )}
            {settings.status.digestLastPostedAt && (
              <span className="flex items-center gap-2" data-testid="autopilot-digest-last">
                <Icon name="calendar" size="sm" className="shrink-0 text-accent-green" />
                Last digest: {lastRunLabel(settings.status.digestLastPostedAt)}
              </span>
            )}
            {nextDigestLabel(settings.status.nextDigestAt) && (
              <span className="flex items-center gap-2" data-testid="autopilot-digest-next">
                <Icon name="clock" size="sm" className="shrink-0 text-accent-green" />
                Next digest: {nextDigestLabel(settings.status.nextDigestAt)}
              </span>
            )}
          </div>
        )}

        {/* The outcome ledger: drafts vs hits per day for the last 30 days */}
        {settings?.status.ledger && <AutopilotLedgerStrip ledger={settings.status.ledger} />}

        <fieldset disabled={!editable} className={editable ? '' : 'opacity-60'} data-testid="autopilot-form">
          {/* Mode */}
          <FormField label="Mode">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Autopilot mode">
              {AUTOPILOT_MODES.map(mode => {
                const active = draft.mode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => update({ mode: mode.id })}
                    className={cn(
                      'text-left p-3 rounded-lg border transition-colors cursor-pointer bg-transparent disabled:cursor-not-allowed',
                      active ? 'border-accent-green bg-accent-green/8' : 'border-border-default hover:border-border-hover',
                    )}
                    data-testid={`autopilot-mode-${mode.id}`}
                  >
                    <div className={cn('text-sm font-semibold', active ? 'text-accent-green' : 'text-text-primary')}>{mode.label}</div>
                    <div className="text-xs text-text-tertiary mt-1">{mode.description}</div>
                  </button>
                );
              })}
            </div>
          </FormField>

          {/* Categories */}
          <FormField label="Categories" helper={errors.categories ? undefined : 'Which posts your agent looks at.'}>
            <div className="flex flex-wrap gap-4">
              {AUTOPILOT_CATEGORIES.map(cat => {
                const blocked = Boolean(cat.disabledNote);
                return (
                  <label
                    key={cat.id}
                    className={cn(
                      'flex items-center gap-2 text-sm',
                      blocked ? 'text-text-tertiary cursor-not-allowed' : 'text-text-primary cursor-pointer',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={!blocked && draft.categories.includes(cat.id)}
                      onChange={() => update({ categories: toggleCategory(draft.categories, cat.id) })}
                      disabled={blocked}
                      className="accent-accent-green"
                      data-testid={`autopilot-category-${cat.id}`}
                    />
                    {cat.label}
                    {cat.disabledNote && <span className="text-xs text-text-tertiary">({cat.disabledNote})</span>}
                  </label>
                );
              })}
            </div>
            {errors.categories && draft.mode !== 'off' && (
              <p className="text-xs text-accent-red mt-1" role="alert" data-testid="autopilot-categories-invalid">
                {errors.categories}
              </p>
            )}
          </FormField>

          {/* Budgets */}
          <FormField label="Budgets" helper="Autopilot stops for the day when any cap is reached, and never spends below the floor.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {budgetFieldsFor(draft.mode).map(field => (
                <div key={field.key}>
                  <div className="text-xs text-text-secondary mb-1">{field.label}</div>
                  <InputWithSuffix
                    suffix={field.suffix}
                    type="number"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={draft.budgets[field.key]}
                    onChange={value => update({ budgets: { ...draft.budgets, [field.key]: value } })}
                    disabled={!editable}
                    placeholder={connected ? undefined : 'Agent offline'}
                    ariaLabel={field.label}
                    testId={`autopilot-${field.key}`}
                  />
                  {errors.budgets[field.key] && (
                    <p className="text-xs text-accent-red mt-1" role="alert" data-testid={`autopilot-${field.key}-invalid`}>
                      {errors.budgets[field.key]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </FormField>

          {/* Standing instruction */}
          <FormField label="Standing instruction" helper={AUTOPILOT_INSTRUCTION_HELPER}>
            <textarea
              className={TEXTAREA_CLS}
              value={draft.instruction}
              onChange={e => update({ instruction: e.target.value })}
              maxLength={AUTOPILOT_INSTRUCTION_MAX_LENGTH}
              placeholder={connected ? 'Keep it short, offer datasets we hold, never promise delivery dates.' : 'Agent offline'}
              aria-label="Standing instruction"
              aria-invalid={errors.instruction ? true : undefined}
              data-testid="autopilot-instruction"
            />
            <div className="flex justify-end text-xs text-text-tertiary mt-1" data-testid="autopilot-instruction-count">
              {instructionCount}
            </div>
            {errors.instruction && (
              <p className="text-xs text-accent-red" role="alert" data-testid="autopilot-instruction-invalid">
                {errors.instruction}
              </p>
            )}
          </FormField>

          {/* Relevance: score before drafting, the threshold, the tuned values and the pins */}
          <AutopilotRelevance draft={draft} status={settings?.status ?? null} onChange={update} pinsError={errors.relevancePins} />

          {/* Office hours */}
          <SwitchRow
            label="Office hours"
            helper={
              draft.officeHoursOn
                ? `Your agent only posts on its own between these times${tz ? ` (${tz})` : ''}.`
                : 'Off: any time of day. Turn on to limit when your agent posts on its own.'
            }
            on={draft.officeHoursOn}
            onChange={on => update({ officeHoursOn: on })}
            disabled={!editable}
            testId="autopilot-office-hours"
          />
          {draft.officeHoursOn && (
            <div className="flex flex-wrap items-center gap-2 -mt-2 mb-4" data-testid="autopilot-office-hours-range">
              <input
                type="time"
                className={TIME_CLS}
                value={draft.officeStart}
                onChange={e => update({ officeStart: e.target.value })}
                aria-label="Office hours start"
                data-testid="autopilot-office-start"
              />
              <span className="text-xs text-text-tertiary">to</span>
              <input
                type="time"
                className={TIME_CLS}
                value={draft.officeEnd}
                onChange={e => update({ officeEnd: e.target.value })}
                aria-label="Office hours end"
                data-testid="autopilot-office-end"
              />
              {tz && (
                <span className="text-xs text-text-tertiary font-mono" data-testid="autopilot-office-tz">
                  {tz}
                </span>
              )}
              {errors.officeHours && (
                <p className="w-full text-xs text-accent-red" role="alert" data-testid="autopilot-office-hours-invalid">
                  {errors.officeHours}
                </p>
              )}
            </div>
          )}

          {/* Weekly digest: once a week the agent sums up its token's room and posts it there */}
          <SwitchRow
            label="Weekly digest"
            helper={
              draft.digestOn
                ? `Every ${DIGEST_WEEKDAYS.find(d => d.id === draft.digestWeekday)?.label ?? 'week'} at ${digestHourLabel(draft.digestHour)} your agent posts a summary of its token's room: posts, replies, bounties, top threads. One draft (${AUTOPILOT_DIGEST_DRAFT_CREDITS} credits) a week.`
                : "Off. Turn on and your agent posts a weekly summary in its token's room. Needs a token bound to the agent."
            }
            on={draft.digestOn}
            onChange={on => update({ digestOn: on })}
            disabled={!editable}
            testId="autopilot-digest"
          />
          {draft.digestOn && (
            <div className="flex flex-wrap items-center gap-2 -mt-2 mb-4" data-testid="autopilot-digest-schedule">
              <select
                className={TIME_CLS}
                value={draft.digestWeekday}
                onChange={e => update({ digestWeekday: Number(e.target.value) })}
                aria-label="Digest weekday"
                data-testid="autopilot-digest-weekday"
              >
                {DIGEST_WEEKDAYS.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-text-tertiary">at</span>
              <select
                className={TIME_CLS}
                value={draft.digestHour}
                onChange={e => update({ digestHour: Number(e.target.value) })}
                aria-label="Digest hour"
                data-testid="autopilot-digest-hour"
              >
                {DIGEST_HOURS.map(h => (
                  <option key={h} value={h}>
                    {digestHourLabel(h)}
                  </option>
                ))}
              </select>
              <span className="text-xs text-text-tertiary">your agent&apos;s local time</span>
              {errors.digest && (
                <p className="w-full text-xs text-accent-red" role="alert" data-testid="autopilot-digest-invalid">
                  {errors.digest}
                </p>
              )}
            </div>
          )}
        </fieldset>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="primary"
            size="sm"
            icon="check"
            onClick={handleSave}
            disabled={!canSave}
            loading={save.isPending}
            data-testid="autopilot-save"
          >
            Save autopilot
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon="x"
            onClick={handleReset}
            disabled={!editable || !dirty || save.isPending}
            data-testid="autopilot-reset"
          >
            Reset
          </Button>
        </div>

        {unsupported && (
          <p className="text-xs text-accent-yellow mt-2" role="status" data-testid="autopilot-unsupported">
            {AUTOPILOT_UNSUPPORTED_MESSAGE}
          </p>
        )}
        {loadFailed && (
          <div className="flex flex-wrap items-center gap-3 mt-2" role="alert" data-testid="autopilot-load-failed">
            <p className="text-xs text-accent-red m-0">Could not read autopilot settings from your agent. {query.error?.message}</p>
            {/* The card is inert until the policy is read; the poll tries again in 30 s, the button now. */}
            <Button
              variant="ghost"
              size="sm"
              loading={query.isFetching}
              onClick={() => void query.refetch()}
              data-testid="autopilot-load-retry"
            >
              Retry
            </Button>
          </div>
        )}
        {!connected && <AgentRequiredNotice className="mt-2" data-testid="autopilot-agent-required" />}
      </div>
    </SettingsCard>
  );
}
