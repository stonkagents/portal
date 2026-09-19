/**
 * Purpose: Non-blocking floating panel — same download + verify flow as home (HeroInstallFlow), does not trap focus or dim the page.
 *          Starts minimized (an "Agent offline. Set up" pill) so a deep link never opens the install flow uninvited.
 *          The installer is Step 2: a wallet that has not launched a token sees no download here,
 *          only the way to the launchpad. A healthy agent of another environment is not offline:
 *          the pill and the panel name the wrong build and link this site's installer instead.
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import { HeroInstallFlow } from '@/app/_components/HeroInstallFlow';
import { INSTALLER_LOCKED_MESSAGE, useInstallerDownloads } from '@/lib/installer/use-installer-downloads';
import { useInstallerUnlocked } from '@/lib/installer/use-installer-unlock';
import { useTranslation } from '@/providers/I18nProvider';
import { useDaemon } from '@/providers/DaemonProvider';
import { AgentEnvMismatchNotice } from '@/components/features/onboarding/AgentEnvMismatchNotice';
import { agentAddress } from '@/lib/agent-address';
import { useChatDaemonInstallFlow } from './use-chat-daemon-install-flow';

interface ChatDaemonSetupPanelProps {
  daemonConnected: boolean;
  onRefreshDaemon: () => Promise<void>;
}

export function ChatDaemonSetupPanel({ daemonConnected, onRefreshDaemon }: ChatDaemonSetupPanelProps) {
  const { t } = useTranslation();
  const { envMismatch } = useDaemon();
  const [dismissed, setDismissed] = useState(false);
  const [minimized, setMinimized] = useState(true);
  /** A manual Check connection that came back with the agent still offline. */
  const [checkFailed, setCheckFailed] = useState(false);
  const installerUnlocked = useInstallerUnlocked();
  const { os, downloadUrl, downloads } = useInstallerDownloads(installerUnlocked);
  const { installStep, installTimeout, setInstallTimeout, installStartRef, handleDownload } = useChatDaemonInstallFlow(() => {
    void onRefreshDaemon();
  });

  useEffect(() => {
    // Any change of connection state outdates the last manual check.
    setCheckFailed(false);
    if (daemonConnected) {
      setDismissed(false);
      setMinimized(true);
    }
  }, [daemonConnected]);

  const checkConnection = async () => {
    await onRefreshDaemon();
    // The parent re-renders this panel away once connected; still here means the probe failed.
    setCheckFailed(true);
  };

  if (daemonConnected || dismissed) return null;

  const primaryDownloadUrl = downloadUrl ?? (os === 'macos' ? downloads.macos : os === 'windows' ? downloads.windows : undefined);

  if (minimized) {
    return (
      <div className="fixed bottom-[calc(156px+env(safe-area-inset-bottom))] right-4 z-[100] pointer-events-none flex flex-col items-end gap-2 lg:bottom-4">
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="pointer-events-auto inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-accent-yellow/40 bg-bg-secondary text-xs font-semibold text-accent-yellow shadow-lg hover:bg-bg-tertiary transition-colors min-h-[44px]"
          data-testid="chat-daemon-panel-expand"
        >
          <Icon name="alert-triangle" size="sm" /> {envMismatch ? 'Wrong agent build' : 'Agent offline. Set up'}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-[100] w-[calc(100%-2rem)] max-w-md pointer-events-none flex flex-col items-end gap-2 lg:bottom-4">
      <div
        className="pointer-events-auto w-full rounded-lg border border-border-default bg-bg-primary shadow-xl max-h-[min(70vh,520px)] overflow-y-auto"
        data-testid="chat-daemon-setup-panel"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-2 px-4 py-3 border-b border-border-default bg-bg-primary">
          <div>
            <h2 className="text-sm font-bold text-text-primary">
              {envMismatch ? 'Your agent is another build.' : 'Your agent is offline.'}
            </h2>
            <p className="text-[11px] text-text-tertiary mt-0.5">
              {envMismatch ? (
                'Chat goes through the agent installed for this site; the one running here talks to another tracker.'
              ) : installerUnlocked ? (
                <>
                  Chat needs your agent running on this machine. Download it, start it, then verify on{' '}
                  <code className="text-text-secondary">{agentAddress()}</code>.
                </>
              ) : (
                'Chat needs your agent running on this machine. Your agent unlocks after you launch a token.'
              )}
            </p>
            {checkFailed && (
              <p className="text-[11px] text-accent-yellow mt-1" data-testid="chat-daemon-panel-check-failed">
                Still no answer on {agentAddress()}. {t('agent.localNetworkHint')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => void checkConnection()}
              className="p-2 rounded-md text-text-tertiary hover:text-accent-green hover:bg-accent-green/10 transition-colors min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
              title="Check connection"
              data-testid="chat-daemon-panel-refresh"
            >
              <Icon name="activity" size="sm" />
            </button>
            <button
              type="button"
              onClick={() => setMinimized(true)}
              className="p-2 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
              title="Minimize"
              data-testid="chat-daemon-panel-minimize"
            >
              <Icon name="minus" size="sm" />
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="p-2 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
              title="Dismiss"
              data-testid="chat-daemon-panel-dismiss"
            >
              <Icon name="x" size="sm" />
            </button>
          </div>
        </div>

        <div className="px-4 py-4">
          {envMismatch ? (
            <AgentEnvMismatchNotice mismatch={envMismatch} variant="panel" data-testid="chat-daemon-panel-env-mismatch" />
          ) : installerUnlocked ? (
            <>
              <HeroInstallFlow
                installStep={installStep}
                installTimeout={installTimeout}
                setInstallTimeout={setInstallTimeout}
                installStartRef={installStartRef}
                installerUnlocked={installerUnlocked}
                os={os}
                downloadUrl={primaryDownloadUrl}
                downloads={downloads}
                handleDownload={handleDownload}
              />
              <div className="mt-4 pt-4 border-t border-border-default">
                <Link
                  href="/"
                  className="text-xs text-accent-green font-medium hover:underline"
                  data-testid="chat-daemon-panel-home-install"
                >
                  Full install steps on home
                </Link>
              </div>
            </>
          ) : (
            <div data-testid="chat-daemon-panel-locked">
              <div className="flex items-start gap-3 p-3 rounded-md bg-bg-tertiary border border-border-default">
                <Icon name="lock" size="sm" className="text-text-tertiary shrink-0 mt-0.5" />
                <p className="m-0 text-sm text-text-primary leading-relaxed">{INSTALLER_LOCKED_MESSAGE}</p>
              </div>
              <Link
                href="/"
                className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold bg-accent-green text-black rounded-lg no-underline hover:shadow-[0_0_20px_rgba(0,255,0,0.4)] transition-shadow min-h-[44px]"
                data-testid="chat-daemon-panel-launchpad"
              >
                <Icon name="rocket" size="sm" />
                Launch a token on the launchpad
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
