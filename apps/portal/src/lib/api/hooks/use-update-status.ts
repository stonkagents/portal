/**
 * Purpose: React Query hook polling Controller's /update/status via daemon proxy
 */
'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { safeFetch, DAEMON_API_V1, CONTROLLER_URL } from '@/lib/api/daemon';
import { queryKeys } from '@/lib/api/keys';
import { appConfig } from '@/lib/config/app.config';
import { getSiteRelease } from '@/lib/api/manifest';
import { useDaemon } from '@/providers/DaemonProvider';
import type { ControllerUpdateStatus, UpdateState } from '@/lib/types/backend';

const NORMAL_POLL_MS = 10_000;
const ACTIVE_POLL_MS = 3_000;

const ACTIVE_STATES: ReadonlySet<string> = new Set(['DOWNLOADING', 'VERIFYING', 'INSTALLING', 'RESTARTING']);

/** Frontend-friendly shape (camelCase) */
export interface UpdateStatus {
  state: UpdateState;
  currentVersion: string;
  latestVersion: string;
  releaseNotes: string;
  force: boolean;
  progress: number;
  bytesDownloaded: number;
  bytesTotal: number;
  error: string | null;
  /** Installer download for the offered release, once known. */
  installerUrl: string | null;
  /** Windows: no in-place update; the user downloads and runs installerUrl. */
  manualInstall: boolean;
}

function transformUpdateStatus(raw: ControllerUpdateStatus): UpdateStatus {
  return {
    state: raw.state,
    currentVersion: raw.current_version,
    latestVersion: raw.latest_version,
    releaseNotes: raw.release_notes,
    force: raw.force,
    progress: raw.progress,
    bytesDownloaded: raw.bytes_downloaded,
    bytesTotal: raw.bytes_total,
    error: raw.error,
    installerUrl: raw.installer_url ?? null,
    manualInstall: raw.manual_install === true,
  };
}

/** Fetch update status with daemon-down fallback to direct controller */
async function fetchUpdateStatus(): Promise<UpdateStatus> {
  // Primary: via daemon proxy
  const primary = await safeFetch<ControllerUpdateStatus>(`${DAEMON_API_V1}/controller/update/status`);
  if (primary) return withSiteRelease(transformUpdateStatus(primary));

  // Fallback: direct to controller (when daemon restarts during update)
  const fallback = await safeFetch<ControllerUpdateStatus>(`${CONTROLLER_URL}/update/status`);
  if (fallback) return withSiteRelease(transformUpdateStatus(fallback));

  throw new Error('Controller unreachable via daemon and direct');
}

/**
 * The agent reports the manifest of the tracker IT talks to. A manual (Windows)
 * update must hand out THIS site's build, so the link, version and notes come
 * from this site's own manifest; the agent's answer only says an update exists.
 * Exported for tests.
 */
export async function withSiteRelease(status: UpdateStatus): Promise<UpdateStatus> {
  if (status.state !== 'AVAILABLE' || !status.manualInstall) return status;
  const site = await getSiteRelease();
  if (!site?.windowsInstallerUrl) return status;
  return {
    ...status,
    latestVersion: site.version || status.latestVersion,
    releaseNotes: site.releaseNotes || status.releaseNotes,
    installerUrl: site.windowsInstallerUrl,
  };
}

export function useUpdateStatus() {
  const queryClient = useQueryClient();
  /* PERF-3: only a connected daemon is asked about updates; nothing here probes localhost on its own. */
  const { connected } = useDaemon();
  const enabled = appConfig.useRealDaemon && connected;

  const query = useQuery<UpdateStatus>({
    queryKey: queryKeys.update.status,
    queryFn: fetchUpdateStatus,
    enabled,
    // Passive polling; never show global snackbar for transport/offline errors here.
    meta: { skipGlobalErrorHandler: true },
    refetchInterval: query => {
      if (!enabled) return false;
      const state = query.state.data?.state;
      if (state && ACTIVE_STATES.has(state)) return ACTIVE_POLL_MS;
      return NORMAL_POLL_MS;
    },
  });

  const pollInterval = query.data && ACTIVE_STATES.has(query.data.state) ? ACTIVE_POLL_MS : NORMAL_POLL_MS;

  async function startUpdate() {
    await safeFetch(`${DAEMON_API_V1}/controller/update/start`, 5000, {
      method: 'POST',
    });
    queryClient.invalidateQueries({ queryKey: queryKeys.update.status });
  }

  async function cancelUpdate() {
    await safeFetch(`${DAEMON_API_V1}/controller/update/cancel`, 5000, {
      method: 'POST',
    });
    queryClient.invalidateQueries({ queryKey: queryKeys.update.status });
  }

  return {
    ...query,
    pollInterval,
    startUpdate,
    cancelUpdate,
  };
}
