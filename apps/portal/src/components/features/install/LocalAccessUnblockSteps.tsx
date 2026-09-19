/**
 * Purpose: The three illustrated steps that unblock local access once the
 *          user has told the browser to block it (the browser never asks
 *          again on its own; the site settings are the only way back):
 *            1. click the icon at the left of the address bar (a drawing of
 *               the bar, that icon highlighted),
 *            2. switch the local network row on (a drawing of the site
 *               settings panel with the row's toggle on, and for Chrome and
 *               Edge the Reset permissions button),
 *            3. come back and press Recheck (the button sits right below).
 *          The row's name and the icon follow the browser (browser-family.ts):
 *          Chrome and Edge show "Apps on device" behind a sliders icon,
 *          Firefox and Safari "Local network access" behind a lock. Both
 *          drawings are inline SVG on the theme tokens, so they follow every
 *          theme and scale to the dialog's width.
 */
'use client';

import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { isChromium, useBrowserFamily } from '@/lib/installer/browser-family';
import { useTranslation } from '@/providers/I18nProvider';

const STEP_TEXT = 'm-0 pt-0.5 text-sm text-text-primary leading-relaxed';
const BUBBLE = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-green text-xs font-bold text-black';

/** `{name}` placeholders swapped for nodes (a <strong>), the rest kept as text. */
function fillNodes(text: string, values: Record<string, ReactNode>): ReactNode[] {
  return text.split(/(\{\w+\})/).map((part, i) => {
    const match = /^\{(\w+)\}$/.exec(part);
    const value = match ? values[match[1]] : undefined;
    return <Fragment key={i}>{value === undefined ? part : value}</Fragment>;
  });
}

interface AddressBarFigureProps {
  /** Firefox and Safari show a lock where Chrome and Edge show sliders. */
  lock: boolean;
  host: string;
  label: string;
}

function AddressBarFigure({ lock, host, label }: AddressBarFigureProps) {
  return (
    <svg
      viewBox="0 0 300 40"
      role="img"
      aria-label={label}
      className="block h-auto w-full max-w-[300px]"
      data-testid="local-access-figure-address-bar"
      data-icon={lock ? 'lock' : 'sliders'}
    >
      <rect x="1" y="1" width="298" height="38" rx="19" strokeWidth="1.5" className="fill-bg-tertiary stroke-border-default" />
      <circle cx="22" cy="20" r="14" strokeWidth="2" className="fill-accent-green/15 stroke-accent-green" />
      {lock ? (
        <g>
          <path
            d="M18.5 19v-3.5a3.5 3.5 0 0 1 7 0V19"
            fill="none"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="stroke-accent-green"
          />
          <rect x="16" y="19" width="12" height="9" rx="2" className="fill-accent-green" />
        </g>
      ) : (
        <g fill="none" strokeWidth="1.8" strokeLinecap="round" className="stroke-accent-green">
          <path d="M15 14h14M15 20h14M15 26h14" />
          <circle cx="25" cy="14" r="2.2" className="fill-bg-tertiary" />
          <circle cx="18" cy="20" r="2.2" className="fill-bg-tertiary" />
          <circle cx="23" cy="26" r="2.2" className="fill-bg-tertiary" />
        </g>
      )}
      <text x="44" y="24.5" fontSize="12" className="fill-text-primary">
        {host}
      </text>
    </svg>
  );
}

interface PanelFigureProps {
  row: string;
  /** The Reset permissions button, drawn for Chrome and Edge only. */
  reset: string | null;
  label: string;
}

function PanelFigure({ row, reset, label }: PanelFigureProps) {
  const height = reset ? 100 : 56;
  return (
    <svg
      viewBox={`0 0 300 ${height}`}
      role="img"
      aria-label={label}
      className="block h-auto w-full max-w-[300px]"
      data-testid="local-access-figure-panel"
    >
      <rect x="1" y="1" width="298" height={height - 2} rx="10" strokeWidth="1.5" className="fill-bg-tertiary stroke-border-default" />
      <rect x="10" y="10" width="280" height="36" rx="8" strokeWidth="2" className="fill-accent-green/10 stroke-accent-green" />
      <text x="24" y="32.5" fontSize="12" fontWeight="600" className="fill-text-primary">
        {row}
      </text>
      <rect x="242" y="18" width="36" height="20" rx="10" className="fill-accent-green" />
      <circle cx="268" cy="28" r="7.5" className="fill-bg-primary" />
      {reset && (
        <g>
          <rect x="10" y="58" width="150" height="30" rx="15" strokeWidth="1.5" className="fill-bg-secondary stroke-border-default" />
          <text x="85" y="77.5" fontSize="11.5" textAnchor="middle" className="fill-text-primary">
            {reset}
          </text>
        </g>
      )}
    </svg>
  );
}

export function LocalAccessUnblockSteps() {
  const { t } = useTranslation();
  const family = useBrowserFamily();
  const [host, setHost] = useState('');
  useEffect(() => {
    setHost(window.location.hostname);
  }, []);

  const chromium = isChromium(family);
  const row = chromium
    ? t('localAccess.rowAppsOnDevice')
    : family === 'unknown'
      ? t('localAccess.rowGeneric')
      : t('localAccess.rowLocalNetwork');
  const reset = t('localAccess.resetPermissions');
  const recheck = t('localAccess.recheck');
  const step2 = chromium
    ? fillNodes(t('localAccess.step2Chromium'), { row: <strong>{row}</strong>, reset: <strong>{reset}</strong> })
    : family === 'unknown'
      ? t('localAccess.step2Unknown')
      : fillNodes(t('localAccess.step2Other'), { row: <strong>{row}</strong> });
  const panelLabel = (chromium ? t('localAccess.figurePanel') : t('localAccess.figurePanelOther')).replace('{row}', row);

  return (
    <ol role="list" className="m-0 flex list-none flex-col gap-4 p-0" data-testid="local-access-steps" data-browser={family}>
      <li className="flex items-start gap-3" data-testid="local-access-step-1">
        <span aria-hidden="true" className={BUBBLE}>
          1
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className={STEP_TEXT}>{t('localAccess.step1')}</p>
          <AddressBarFigure lock={family === 'firefox' || family === 'safari'} host={host} label={t('localAccess.figureAddressBar')} />
        </div>
      </li>
      <li className="flex items-start gap-3" data-testid="local-access-step-2">
        <span aria-hidden="true" className={BUBBLE}>
          2
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className={STEP_TEXT}>{step2}</p>
          <PanelFigure row={row} reset={chromium ? reset : null} label={panelLabel} />
        </div>
      </li>
      <li className="flex items-start gap-3" data-testid="local-access-step-3">
        <span aria-hidden="true" className={BUBBLE}>
          3
        </span>
        <p className={STEP_TEXT}>{fillNodes(t('localAccess.step3'), { recheck: <strong>{recheck}</strong> })}</p>
      </li>
    </ol>
  );
}
