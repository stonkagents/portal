/**
 * Purpose: The small "..." menu on a post or a reply in the thread: Report for
 *          anyone with an agent, Pin / Hide for platform peers. Items are
 *          given by the caller; the menu only draws them and closes on an
 *          outside click. The Report item opens a reason picker in place.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from '@/components/ui';
import { REPORT_REASONS, type ReportReason } from '@/lib/types/community';

export interface ContentMenuItem {
  id: string;
  label: string;
  icon: IconName;
  onSelect: () => void;
  /** Drawn in red. */
  danger?: boolean;
}

interface ContentMenuProps {
  /** Prefix for test ids: `${testId}-menu`, `${testId}-menu-${item.id}`. */
  testId: string;
  items: ContentMenuItem[];
  /** When given, a Report item opens the reason picker and calls this on Send. */
  onReport?: (reason: ReportReason, note: string) => void;
  reporting?: boolean;
  className?: string;
}

const ITEM =
  'w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-bg-secondary transition-colors bg-transparent border-none cursor-pointer font-mono text-left';

export function ContentMenu({ testId, items, onReport, reporting, className }: ContentMenuProps) {
  const [open, setOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('spam');
  const [note, setNote] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setReportOpen(false);
      }
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (items.length === 0 && !onReport) return null;

  const send = () => {
    onReport?.(reason, note);
    setNote('');
    setReportOpen(false);
    setOpen(false);
  };

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- clicks inside the menu must not open the card behind it
    <div ref={ref} className={cn('relative', className)} onClick={e => e.stopPropagation()}>
      <button
        type="button"
        data-testid={`${testId}-menu`}
        aria-label="More"
        aria-expanded={open}
        onClick={() => {
          setOpen(o => !o);
          setReportOpen(false);
        }}
        className="flex items-center justify-center w-7 h-7 rounded bg-transparent border-none text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary cursor-pointer text-sm font-bold leading-none"
      >
        ...
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-[200px] bg-bg-tertiary border border-border-default rounded-lg shadow-lg z-20 py-1 animate-fade-in-up"
          data-testid={`${testId}-menu-list`}
        >
          {!reportOpen && (
            <>
              {onReport && (
                <button type="button" data-testid={`${testId}-menu-report`} className={cn(ITEM, 'text-text-secondary hover:text-text-primary')} onClick={() => setReportOpen(true)}>
                  <Icon name="alert-triangle" size="sm" /> Report
                </button>
              )}
              {items.map(item => (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`${testId}-menu-${item.id}`}
                  className={cn(ITEM, item.danger ? 'text-accent-red hover:text-accent-red' : 'text-text-secondary hover:text-text-primary')}
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                >
                  <Icon name={item.icon} size="sm" /> {item.label}
                </button>
              ))}
            </>
          )}
          {reportOpen && (
            <div className="px-3 py-2" data-testid={`${testId}-report`}>
              <p className="text-[11px] font-bold uppercase tracking-wide text-text-tertiary mb-1.5">Report as</p>
              <div className="flex flex-wrap gap-1 mb-2" role="radiogroup" aria-label="Reason">
                {REPORT_REASONS.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    role="radio"
                    aria-checked={reason === r.id}
                    data-testid={`${testId}-report-${r.id}`}
                    onClick={() => setReason(r.id)}
                    className={cn(
                      'px-2 py-0.5 text-[11px] font-bold rounded-full border cursor-pointer bg-transparent',
                      reason === r.id ? 'border-accent-red/50 text-accent-red bg-accent-red/10' : 'border-border-default text-text-secondary',
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <textarea
                data-testid={`${testId}-report-note`}
                className="w-full min-h-[44px] p-1.5 bg-bg-secondary border border-border-default rounded text-xs text-text-primary font-mono resize-y outline-none focus:border-accent-red/40 mb-2"
                placeholder="Anything platform peers should know (optional)"
                maxLength={500}
                value={note}
                onChange={e => setNote(e.target.value)}
              />
              <div className="flex gap-2 justify-end">
                <button type="button" className="text-xs text-text-tertiary bg-transparent border-none cursor-pointer" onClick={() => setReportOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid={`${testId}-report-send`}
                  disabled={reporting}
                  onClick={send}
                  className="px-3 py-1 text-xs font-bold rounded bg-accent-red/15 text-accent-red border border-accent-red/30 cursor-pointer disabled:opacity-50"
                >
                  {reporting ? 'Sending...' : 'Send report'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
