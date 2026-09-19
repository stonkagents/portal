/**
 * Purpose: The installer link with the "Allow local access" gate in front of
 *          it. A plain link (copyable, opens in a new tab) whose click is
 *          intercepted on every platform that runs the agent: the browser's
 *          local network permission is read live (use-local-access-gate.ts),
 *          a missing one opens the dialog that makes the browser ask, and once
 *          it is granted (or the browser has no such permission) the agent on
 *          this computer is probed before the exe is handed out. Nothing
 *          installed downloads at once; an installed agent gets the dialog's
 *          verdict (already up to date, update available, wrong build).
 *          Platforms without an agent get the link as it always was.
 *          `onDownload` (the install watch) runs whenever the download actually
 *          starts.
 */
'use client';

import { useCallback, useState, type MouseEvent, type ReactNode } from 'react';
import { launchDownload, permissionsApiPresent, queryLocalAccessPermission } from '@/lib/installer/local-network-access';
import { useLocalAccessGate } from '@/lib/installer/use-local-access-gate';
import { useDaemon } from '@/providers/DaemonProvider';
import { LocalAccessGate } from './LocalAccessGate';

export interface GatedDownloadLinkProps {
  href: string;
  onDownload?: () => void;
  className?: string;
  children: ReactNode;
  'data-testid'?: string;
}

export function GatedDownloadLink({ href, onDownload, className, children, 'data-testid': testId }: GatedDownloadLinkProps) {
  const { support, refresh } = useDaemon();
  const [open, setOpen] = useState(false);

  const proceed = useCallback(() => {
    setOpen(false);
    launchDownload(href);
    onDownload?.();
  }, [href, onDownload]);
  /* An agent that is already up to date: the site shows it online at once. */
  const onInstalled = useCallback(() => {
    void Promise.resolve(refresh?.()).catch(() => {});
  }, [refresh]);
  const gate = useLocalAccessGate(proceed, { onInstalled });
  const { checkAgent, reset } = gate;

  /* The permission is settled: probe the agent, and open the dialog only when it has a verdict to show. */
  const probeThenDownload = useCallback(() => {
    void checkAgent().then(started => {
      if (!started) setOpen(true);
    });
  }, [checkAgent]);

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    /* No agent on this platform: the link works as a link. */
    if (support !== 'supported') {
      onDownload?.();
      return;
    }
    e.preventDefault();
    /* A browser without the permission (Firefox, Safari) still gets the agent probe. */
    if (!permissionsApiPresent()) {
      probeThenDownload();
      return;
    }
    /* The permission is read LIVE on every click: the user can block it in the site settings at any
       time, so nothing remembered earlier (a granted state at page load, a previous click) may skip
       the gate. Granted or absent goes on to the agent probe; prompt or denied opens the dialog. */
    void queryLocalAccessPermission()
      .then(status => {
        if (status === null || status.state === 'granted') {
          probeThenDownload();
          return;
        }
        reset();
        setOpen(true);
      })
      .catch(() => probeThenDownload());
  };

  const probing = !open && gate.phase === 'checking';

  return (
    <>
      <a
        href={href}
        onClick={onClick}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        data-testid={testId}
        aria-busy={probing || undefined}
        data-probing={probing || undefined}
      >
        {children}
      </a>
      <LocalAccessGate
        open={open}
        onClose={() => {
          setOpen(false);
          reset();
        }}
        gate={gate}
      />
    </>
  );
}
