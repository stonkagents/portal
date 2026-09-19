/**
 * Purpose: The 30-day strip on the Autopilot card (phase 3): one column per
 *          day, drafts as the tall muted bar and hits as the green bar in
 *          front of it, drawn with plain divs on the theme's tokens, plus the
 *          ledger's totals for the last 30 days.
 */
'use client';

import { useMemo } from 'react';
import { ledgerDayTitle, ledgerDays, percentLabel } from './autopilot-relevance';
import type { AutopilotLedger } from '@/lib/types/community';

export const LEDGER_EMPTY_MESSAGE = 'No drafts in the last 30 days.';

/** Bar height in pixels for the busiest day; the rest scale down from it. */
const STRIP_HEIGHT = 40;

interface AutopilotLedgerStripProps {
  ledger: AutopilotLedger;
  now?: number;
}

export function AutopilotLedgerStrip({ ledger, now }: AutopilotLedgerStripProps) {
  const days = useMemo(() => ledgerDays(ledger.days, now), [ledger.days, now]);
  const peak = Math.max(1, ...days.map(d => d.drafts));
  const empty = days.every(d => d.drafts === 0 && d.hits === 0);
  const { last30 } = ledger;

  const totals: { id: string; label: string; value: string; tone?: string }[] = [
    { id: 'drafted', label: 'Drafted', value: String(last30.drafted) },
    { id: 'posted', label: 'Posted', value: String(last30.posted) },
    { id: 'hits', label: 'Hits', value: String(last30.hits), tone: 'text-accent-green' },
    { id: 'hit-rate', label: 'Hit rate', value: percentLabel(last30.hitRate), tone: 'text-accent-green' },
    { id: 'credits-spent', label: 'Credits spent', value: last30.creditsSpent.toLocaleString(), tone: 'text-accent-yellow' },
    { id: 'credits-won', label: 'Credits won', value: last30.creditsWon.toLocaleString(), tone: 'text-accent-yellow' },
  ];

  return (
    <div className="mb-4 px-3 py-3 bg-bg-tertiary border border-border-default rounded-lg" data-testid="autopilot-ledger">
      <div className="flex items-center justify-between gap-2 mb-2 text-xs text-text-secondary">
        <span>Last 30 days</span>
        <span className="flex items-center gap-3 text-[11px] text-text-tertiary">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-accent-blue/40" /> drafts
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-accent-green" /> hits
          </span>
        </span>
      </div>

      {empty ? (
        <p className="text-xs text-text-tertiary" data-testid="autopilot-ledger-empty">
          {LEDGER_EMPTY_MESSAGE}
        </p>
      ) : (
        <div className="flex items-end gap-px" style={{ height: STRIP_HEIGHT }} role="img" aria-label="Drafts and hits per day, last 30 days" data-testid="autopilot-ledger-strip">
          {days.map(day => (
            <div
              key={day.date}
              className="relative flex-1 h-full"
              title={ledgerDayTitle(day)}
              data-testid={`autopilot-ledger-day-${day.date}`}
              data-drafts={day.drafts}
              data-hits={day.hits}
            >
              <div className="absolute bottom-0 inset-x-0 rounded-t-sm bg-accent-blue/40" style={{ height: `${(day.drafts / peak) * 100}%` }} />
              <div className="absolute bottom-0 inset-x-0 rounded-t-sm bg-accent-green" style={{ height: `${(day.hits / peak) * 100}%` }} />
            </div>
          ))}
        </div>
      )}

      <dl className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3" data-testid="autopilot-ledger-totals">
        {totals.map(t => (
          <div key={t.id} className="min-w-0">
            <dt className="text-[11px] text-text-tertiary">{t.label}</dt>
            <dd className={`text-sm font-mono font-semibold ${t.tone ?? 'text-text-primary'}`} data-testid={`autopilot-ledger-${t.id}`}>
              {t.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
