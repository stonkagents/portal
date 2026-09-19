/**
 * Purpose: Shared UI helpers for settings tab components: FormField, Switch, SectionTitle,
 *          SettingsCard, InputWithSuffix, and the client-side file download every
 *          export button uses. Every control here is controlled by its caller: nothing
 *          in Settings keeps state the agent does not have.
 */
'use client';

import { cn } from '@/lib/utils/cn';

/* ── Form field wrapper ────────────────────────────────────────────── */

export function FormField({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide border-l-[3px] border-l-accent-green pl-2 mb-2">
        {label}
      </label>
      {children}
      {helper && <p className="text-xs text-text-tertiary mt-1">{helper}</p>}
    </div>
  );
}

/* ── Switch row (controlled) ───────────────────────────────────────── */

export function SwitchRow({
  label,
  helper,
  on,
  onChange,
  disabled = false,
  testId,
}: {
  label: string;
  helper?: React.ReactNode;
  on: boolean;
  /** Omitted for a read-only switch: shown, never toggled. */
  onChange?: (on: boolean) => void;
  disabled?: boolean;
  testId: string;
}) {
  const readOnly = !onChange;
  const btnCls = cn(
    'w-10 h-[22px] rounded-full relative border-none shrink-0 transition-colors overflow-hidden',
    on ? 'bg-accent-green shadow-[0_0_8px_rgba(0,255,65,0.3)]' : 'bg-bg-tertiary',
    disabled || readOnly ? 'opacity-60 cursor-default' : 'cursor-pointer',
  );
  return (
    <div className="flex items-start gap-4 min-h-[44px] py-2 mb-4">
      <button
        type="button"
        onClick={() => !disabled && onChange?.(!on)}
        className={btnCls}
        role="switch"
        aria-checked={on}
        aria-readonly={readOnly || undefined}
        disabled={disabled}
        data-testid={testId}
      >
        <span
          className={cn(
            'absolute left-0 top-[3px] w-4 h-4 rounded-full bg-white transition-transform duration-200',
            on ? 'translate-x-[24px]' : 'translate-x-[3px]',
          )}
        />
      </button>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-text-primary">{label}</div>
        {helper && <div className="text-xs text-text-tertiary mt-0.5">{helper}</div>}
      </div>
    </div>
  );
}

/* ── Section title (green left border) ─────────────────────────────── */

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide border-l-[3px] border-l-accent-green pl-2 mb-4">
      {children}
    </h3>
  );
}

/* ── Settings card ─────────────────────────────────────────────────── */

export function SettingsCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('bg-bg-secondary border border-border-default rounded-lg p-6 mb-4', className)}>{children}</div>;
}

/* ── Inputs ────────────────────────────────────────────────────────── */

export const INPUT_CLS =
  'w-full min-h-[44px] px-3 py-2 bg-bg-tertiary border border-border-default rounded-lg text-sm text-text-primary font-mono outline-none focus:border-accent-green/50 disabled:cursor-not-allowed';

export const READONLY_CLS =
  'flex-1 min-h-[44px] px-3 py-2 bg-bg-input border border-border-default rounded-lg text-sm text-text-secondary font-mono cursor-default';

/** Controlled input with a unit suffix (Mbps, GB, ...). */
export function InputWithSuffix({
  suffix,
  value,
  onChange,
  testId,
  type = 'text',
  disabled = false,
  placeholder,
  ariaLabel,
  min,
  max,
  step,
}: {
  suffix: string;
  value: string;
  onChange: (value: string) => void;
  testId: string;
  type?: string;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="flex items-center">
      <input
        className="flex-1 min-w-0 min-h-[44px] px-3 py-2 bg-bg-tertiary border border-border-default rounded-l-lg text-sm text-text-primary font-mono outline-none focus:border-accent-green/50 disabled:cursor-not-allowed"
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={step}
        inputMode={type === 'number' ? 'decimal' : undefined}
        data-testid={testId}
      />
      <span className="min-h-[44px] px-3 flex items-center bg-bg-tertiary border border-l-0 border-border-default rounded-r-lg text-xs text-text-secondary font-semibold">
        {suffix}
      </span>
    </div>
  );
}

/* ── Client-side download ──────────────────────────────────────────── */

/** Hand the browser a file built in the page (identity export, CSV log). Nothing leaves the machine. */
export function downloadBlob(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
