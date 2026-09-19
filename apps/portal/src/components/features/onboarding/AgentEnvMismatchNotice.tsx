/**
 * Purpose: The notice for an installed agent of another environment (a Staging
 *          build answering the Dev site): which build is installed, which
 *          tracker it talks to, which build this site needs, and where to get
 *          it. AgentRequiredNotice swaps to this wherever it appears, and the
 *          navbar shows the badge, so the owner never reads a healthy agent as
 *          "offline" without being told why nothing works.
 *
 * The download link is this environment's installer from its own releases
 * manifest (NEXT_PUBLIC_DOWNLOAD_BASE_URL), never the home page's Download
 * button: that one unlocks only after a launch on this site, which an owner
 * who launched elsewhere has not made.
 */
'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon } from '@/components/ui/Icon';
import { appConfig } from '@/lib/config/app.config';
import { getMacOSInstallerUrl, getWindowsInstallerUrl } from '@/lib/api/manifest';
import { AGENT_ENV_LABELS, envMismatchMessage, envMismatchSummary, type AgentEnvMismatch } from '@/lib/api/agent-environment';
import type { Platform } from '@/lib/installer/use-installer-downloads';
import { useDaemon } from '@/providers/DaemonProvider';

/** The releases host of this environment, the link until the manifest names the installer. */
export function envDownloadBaseUrl(): string {
  return appConfig.downloadBaseUrl.replace(/\/+$/, '');
}

/** This environment's installer for the platform; the releases host while the manifest is unread or names none. */
export function useEnvBuildDownloadUrl(platform: Platform): string {
  const [url, setUrl] = useState<string>(envDownloadBaseUrl());
  useEffect(() => {
    if (platform !== 'windows' && platform !== 'macos') return;
    let cancelled = false;
    const read = platform === 'windows' ? getWindowsInstallerUrl : getMacOSInstallerUrl;
    void read().then(found => {
      if (!cancelled && found) setUrl(found);
    });
    return () => {
      cancelled = true;
    };
  }, [platform]);
  return url;
}

interface DownloadLinkProps {
  mismatch: AgentEnvMismatch;
  className?: string;
}

/** "Download the <Dev> build", to this environment's installer. */
export function EnvBuildDownloadLink({ mismatch, className }: DownloadLinkProps) {
  const { platform } = useDaemon();
  const href = useEnvBuildDownloadUrl(platform);
  return (
    <a
      href={href}
      className={cn('font-medium text-accent-green no-underline hover:underline whitespace-nowrap', className)}
      data-testid="agent-env-mismatch-download"
    >
      Download the {AGENT_ENV_LABELS[mismatch.siteEnv]} build
    </a>
  );
}

interface AgentEnvMismatchNoticeProps {
  mismatch: AgentEnvMismatch;
  /** 'inline' sits next to a control; 'panel' fills an empty region (a list, a modal body). */
  variant?: 'inline' | 'panel';
  className?: string;
  'data-testid'?: string;
}

export function AgentEnvMismatchNotice({ mismatch, variant = 'inline', className, 'data-testid': testId }: AgentEnvMismatchNoticeProps) {
  const panel = variant === 'panel';
  return (
    <div
      className={cn(
        'text-xs text-text-secondary',
        panel
          ? 'flex flex-col items-center gap-2 px-4 py-6 text-center bg-bg-tertiary border border-border-default rounded-lg'
          : 'flex flex-wrap items-center gap-x-2 gap-y-1',
        className,
      )}
      data-testid={testId ?? 'agent-env-mismatch'}
      data-env-mismatch="true"
      role="status"
    >
      <span className={cn('flex items-start gap-1.5', panel && 'justify-center')}>
        <Icon name="alert-triangle" size="sm" className="shrink-0 text-accent-yellow" />
        <span>{envMismatchMessage(mismatch)}</span>
      </span>
      <EnvBuildDownloadLink mismatch={mismatch} />
    </div>
  );
}

/** The navbar's word on it: a yellow badge linking to the right installer, the full notice as its tooltip. */
export function AgentEnvMismatchBadge({ mismatch }: { mismatch: AgentEnvMismatch }) {
  const { platform } = useDaemon();
  const href = useEnvBuildDownloadUrl(platform);
  return (
    <a
      href={href}
      title={envMismatchMessage(mismatch)}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-accent-yellow border border-accent-yellow/50 rounded-md min-h-[32px] no-underline hover:bg-accent-yellow/10 transition-[background-color]"
      data-testid="nav-env-mismatch"
      role="status"
    >
      <Icon name="alert-triangle" size="sm" className="shrink-0" />
      <span className="whitespace-nowrap">{envMismatchSummary(mismatch)}</span>
    </a>
  );
}
