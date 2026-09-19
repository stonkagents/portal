/**
 * Purpose: "Allow local access", the dialog in front of the installer download.
 *          It explains that the site must talk to the agent on this computer,
 *          then "Allow and download" makes the browser ask (Chrome and Edge
 *          138+, see local-network-access.ts) and reads the answer:
 *            denied                        -> three illustrated steps to unblock it
 *                                             (LocalAccessUnblockSteps.tsx), with Recheck
 *            allowed                       -> "Access allowed" for a moment: the user
 *                                             unblocked it in the site settings and the
 *                                             hook noticed on its own; the probe follows
 *            prompt (dismissed)            -> choose Allow, with Try again
 *            granted / no such permission  -> the agent on this computer is probed:
 *              nothing there   -> the download starts, dialog closes
 *              mismatch        -> "wrong build, downloading this site's", then the download
 *              installed       -> "already up to date", Close, with Download anyway
 *              update          -> "v<new> is available", Download update, with Not now
 *          After two failed attempts "Download anyway" appears, so a browser
 *          that misreports the permission never traps the user.
 *          mode "access" is the same dialog opened from the "needs permission"
 *          banner of an agent-dependent page: "Allow access" instead of "Allow
 *          and download", and no bypass (there is nothing to download).
 */
'use client';

import { useEffect, useRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { AGENT_ENV_LABELS } from '@/lib/api/agent-environment';
import { cn } from '@/lib/utils/cn';
import { useTranslation } from '@/providers/I18nProvider';
import type { LocalAccessGateState } from '@/lib/installer/use-local-access-gate';
import { LocalAccessUnblockSteps } from './LocalAccessUnblockSteps';

const PRIMARY =
  'w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold bg-accent-green text-black rounded-lg border-none cursor-pointer hover:shadow-[0_0_20px_rgba(0,255,0,0.4)] transition-shadow min-h-[44px] disabled:opacity-60 disabled:cursor-wait';
const SECONDARY =
  'w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-text-primary bg-transparent rounded-lg border border-border-default cursor-pointer hover:border-accent-green/50 transition-colors min-h-[44px]';
const NOTICE = 'flex items-start gap-3 rounded-md border p-3 text-xs text-text-primary leading-relaxed';

/** The dictionary has no placeholders of its own; the few here are filled by hand. */
function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

export interface LocalAccessGateProps {
  open: boolean;
  onClose: () => void;
  gate: LocalAccessGateState;
  /** 'download' in front of the installer (default); 'access' from a page's permission banner. */
  mode?: 'download' | 'access';
}

export function LocalAccessGate({ open, onClose, gate, mode = 'download' }: LocalAccessGateProps) {
  const { t } = useTranslation();
  const { phase, canBypass, agent, attempt, bypass } = gate;
  const primaryRef = useRef<HTMLButtonElement>(null);

  /* Keyboard first: the primary action has focus as soon as the dialog opens, and again when the probe's verdict swaps it. */
  useEffect(() => {
    if (open && phase !== 'checking') primaryRef.current?.focus();
  }, [open, phase]);

  const checking = phase === 'checking';
  const primaryLabel =
    phase === 'denied'
      ? t('localAccess.recheck')
      : phase === 'prompt'
        ? t('localAccess.tryAgain')
        : mode === 'access'
          ? t('localAccess.allowAccess')
          : t('localAccess.allowAndDownload');

  const installed = agent?.kind === 'installed' ? agent : null;
  const update = agent?.kind === 'update' ? agent : null;
  const mismatch = agent?.kind === 'mismatch' ? agent.mismatch : null;
  const installedBuild = mismatch?.agentEnv
    ? fill(t('localAccess.envBuild'), { env: AGENT_ENV_LABELS[mismatch.agentEnv] })
    : t('localAccess.otherBuild');

  return (
    <Modal open={open} onClose={onClose} title={t('localAccess.title')} maxWidth="max-w-md">
      <div data-testid="local-access-gate" data-phase={phase} data-mode={mode} className="flex flex-col gap-4">
        {phase !== 'installed' && phase !== 'update' && phase !== 'denied' && phase !== 'allowed' && (
          <p className="m-0 text-sm text-text-secondary leading-relaxed">{t('localAccess.intro')}</p>
        )}

        {phase === 'denied' && (
          <div role="alert" className="flex flex-col gap-4" data-testid="local-access-denied">
            <div className={cn(NOTICE, 'border-accent-red/40 bg-accent-red/10')}>
              <Icon name="alert-triangle" size="sm" className="mt-0.5 shrink-0 text-accent-red" />
              <span>{t('localAccess.denied')}</span>
            </div>
            <LocalAccessUnblockSteps />
          </div>
        )}

        {phase === 'allowed' && (
          <div role="status" className={cn(NOTICE, 'border-accent-green/40 bg-accent-green/10')} data-testid="local-access-allowed">
            <Icon name="check" size="sm" className="mt-0.5 shrink-0 text-accent-green" />
            <span>{t('localAccess.allowed')}</span>
          </div>
        )}

        {phase === 'prompt' && (
          <div role="status" className={cn(NOTICE, 'border-accent-yellow/40 bg-accent-yellow/10')} data-testid="local-access-prompt">
            <Icon name="info" size="sm" className="mt-0.5 shrink-0 text-accent-yellow" />
            <span>{t('localAccess.prompt')}</span>
          </div>
        )}

        {phase === 'mismatch' && (
          <div role="status" className={cn(NOTICE, 'border-accent-yellow/40 bg-accent-yellow/10')} data-testid="local-access-mismatch">
            <Icon name="info" size="sm" className="mt-0.5 shrink-0 text-accent-yellow" />
            <span>
              {fill(t('localAccess.mismatch'), {
                installed: installedBuild,
                site: mismatch ? AGENT_ENV_LABELS[mismatch.siteEnv] : '',
              })}
            </span>
          </div>
        )}

        {phase === 'installed' && (
          <div role="status" className={cn(NOTICE, 'border-accent-green/40 bg-accent-green/10')} data-testid="local-access-installed">
            <Icon name="check" size="sm" className="mt-0.5 shrink-0 text-accent-green" />
            <span>{fill(t('localAccess.installed'), { version: installed?.version ? `v${installed.version}` : '' })}</span>
          </div>
        )}

        {phase === 'update' && (
          <div role="status" className={cn(NOTICE, 'border-accent-green/40 bg-accent-green/10')} data-testid="local-access-update">
            <Icon name="info" size="sm" className="mt-0.5 shrink-0 text-accent-green" />
            <span>{fill(t('localAccess.update'), { current: `v${update?.current ?? ''}`, latest: `v${update?.latest ?? ''}` })}</span>
          </div>
        )}

        {phase === 'installed' ? (
          <>
            <button ref={primaryRef} type="button" onClick={onClose} className={PRIMARY} data-testid="local-access-close">
              {t('localAccess.close')}
            </button>
            <button type="button" onClick={bypass} className={SECONDARY} data-testid="local-access-bypass">
              {t('localAccess.downloadAnyway')}
            </button>
          </>
        ) : phase === 'update' ? (
          <>
            <button ref={primaryRef} type="button" onClick={bypass} className={PRIMARY} data-testid="local-access-download-update">
              <Icon name="download" size="sm" />
              {t('localAccess.downloadUpdate')}
            </button>
            <button type="button" onClick={onClose} className={SECONDARY} data-testid="local-access-not-now">
              {t('localAccess.notNow')}
            </button>
          </>
        ) : phase === 'mismatch' || phase === 'allowed' ? null : (
          <button
            ref={primaryRef}
            type="button"
            onClick={() => void attempt()}
            disabled={checking}
            className={PRIMARY}
            data-testid="local-access-allow"
          >
            {checking ? (
              <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-black border-t-transparent" />
            ) : (
              <Icon name="download" size="sm" />
            )}
            {checking ? t('localAccess.checking') : primaryLabel}
          </button>
        )}

        {canBypass &&
          mode === 'download' &&
          phase !== 'installed' &&
          phase !== 'update' &&
          phase !== 'mismatch' &&
          phase !== 'allowed' && (
            <div className="flex flex-col gap-1">
              <button type="button" onClick={bypass} className={cn(SECONDARY)} data-testid="local-access-bypass">
                {t('localAccess.downloadAnyway')}
              </button>
              <p className="m-0 text-center text-[11px] text-text-tertiary">{t('localAccess.downloadAnywayHint')}</p>
            </div>
          )}
      </div>
    </Modal>
  );
}
