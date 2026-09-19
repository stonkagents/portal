/**
 * Purpose: "This site needs permission to reach your agent on this computer",
 *          the banner every agent-dependent surface shows while the browser's
 *          local network permission is not granted and the agent is not
 *          connected. Its "Allow access" opens the same dialog as the download
 *          gate (mode "access") and fires the browser prompt at once; granted
 *          refreshes the agent poll so the page shows it online right away,
 *          denied gets the dialog's fix text with Recheck. Nothing renders when
 *          the permission is granted, when the browser has no such permission,
 *          when the platform runs no agent, or when the agent is connected;
 *          one banner per page whatever mounts it (use-local-access-notice.ts).
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils/cn';
import { useLocalAccessGate } from '@/lib/installer/use-local-access-gate';
import type { DownloadDecision } from '@/lib/installer/installed-agent';
import { localAccessBlocked, useLocalAccessNoticeSlot, useLocalAccessState } from '@/lib/installer/use-local-access-notice';
import { useDaemon } from '@/providers/DaemonProvider';
import { useTranslation } from '@/providers/I18nProvider';
import { LocalAccessGate } from './LocalAccessGate';

/** The banner asks for the permission only; nothing is downloaded, so the agent probe is skipped. */
const NO_PROBE = async (): Promise<DownloadDecision> => ({ kind: 'download' });

export interface LocalAccessNoticeProps {
  /** A page-top banner passes 1 so it wins over the inline notices of the controls below it. */
  priority?: number;
  className?: string;
  'data-testid'?: string;
}

/** Whether the banner has anything to say; exported for the surfaces that lay out around it. */
export function useLocalAccessNoticeNeeded(): boolean {
  const { support, connected } = useDaemon();
  const state = useLocalAccessState();
  return support === 'supported' && !connected && localAccessBlocked(state);
}

export function LocalAccessNotice({ priority = 0, className, 'data-testid': testId }: LocalAccessNoticeProps) {
  const { t } = useTranslation();
  const { refresh } = useDaemon();
  const needed = useLocalAccessNoticeNeeded();
  const mine = useLocalAccessNoticeSlot(priority);
  const [open, setOpen] = useState(false);

  /* Granted: the agent poll runs now, so a running agent shows online without waiting for the next tick. */
  const proceed = useCallback(() => {
    setOpen(false);
    void Promise.resolve(refresh?.()).catch(() => {});
  }, [refresh]);
  const gate = useLocalAccessGate(proceed, { checkAgent: NO_PROBE });
  const { attempt, reset } = gate;

  const allow = useCallback(() => {
    reset();
    setOpen(true);
    void attempt();
  }, [attempt, reset]);

  /* Granted from the browser's site settings while the dialog shows the fix: the banner clears itself
     (nothing left to say), the gate stands down, and the agent poll runs now, as after the browser prompt. */
  useEffect(() => {
    if (!open || needed) return;
    reset();
    proceed();
  }, [open, needed, reset, proceed]);

  if (!needed || !mine) return null;

  return (
    <>
      <div
        role="status"
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-accent-yellow/40 bg-accent-yellow/10 px-3 py-2.5 text-xs text-text-primary leading-relaxed',
          className,
        )}
        data-testid={testId ?? 'local-access-notice'}
      >
        <Icon name="alert-triangle" size="sm" className="shrink-0 text-accent-yellow" />
        <span className="min-w-0 flex-1">{t('localAccess.needed')}</span>
        <button
          type="button"
          onClick={allow}
          className="shrink-0 rounded-md bg-accent-green px-3 py-1.5 text-xs font-bold text-black border-none cursor-pointer hover:shadow-[0_0_12px_rgba(0,255,0,0.4)] transition-shadow min-h-[36px]"
          data-testid="local-access-notice-allow"
        >
          {t('localAccess.allowAccess')}
        </button>
      </div>
      <LocalAccessGate
        open={open}
        onClose={() => {
          setOpen(false);
          reset();
        }}
        gate={gate}
        mode="access"
      />
    </>
  );
}
