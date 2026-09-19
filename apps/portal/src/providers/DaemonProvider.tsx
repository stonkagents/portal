/**
 * Purpose: DaemonContext — single source of truth for daemon connection state
 *          and the ONLY place the portal ever talks to localhost (PERF-3).
 *
 * Platform gate, in order:
 *   - No installer for this platform (macOS, iOS, Android, other): `support` is
 *     'unsupported' and nothing here opens a connection. Every daemon-driven
 *     hook reads `connected === false` and stays idle.
 *   - Windows, nothing recorded: discovery, one probe on load and then every
 *     30 s backing off to 2 min, so an agent installed from a downloaded exe,
 *     another browser or after cleared storage is still found. The first answer
 *     records the install (`hasInstalledDaemon`).
 *   - Windows, install recorded (`hasInstalledDaemon`): one probe on load, then
 *     5 s while connected, exponential back-off to 60 s while it fails, paused
 *     while the tab is hidden.
 *   - Download click: the install watch probes at 3 → 6 → 12 s and gives up at
 *     120 s with a manual Retry. It never restarts on its own.
 *
 * Environment gate: a healthy agent built for another environment (its status
 * names a tracker host other than this site's, or an environment label that
 * differs) reads as not connected everywhere, with `envMismatch` saying which
 * build to install instead. Older daemons name neither and are assumed to match.
 */
'use client';

import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { config } from '@/config';
import { usePoll } from '@/lib/api/use-poll';
import { daemonApi, daemonControl } from '@/lib/api/daemon';
import { asAgentEnv, detectEnvMismatch, type AgentEnvMismatch } from '@/lib/api/agent-environment';
import { getProfile, recordDaemonInstall } from '@/lib/user-profile';
import { currentPlatform, platformSupportsAgent, type Platform } from '@/lib/installer/use-installer-downloads';

export type DaemonStatus = 'online' | 'degraded' | 'offline';

/** Whether this platform can run the agent at all. 'unknown' only before hydration. */
export type DaemonSupport = 'unknown' | 'unsupported' | 'supported';

export interface DaemonTransferStats {
  uploadSpeedBps: number;
  downloadSpeedBps: number;
  shareRatio: number;
  totalUploadedBytes: number;
  totalDownloadedBytes: number;
}

interface DaemonHealthIndicators {
  natStatus: string;
  dhtReady: boolean;
  mdnsReady: boolean;
  relayConnected: boolean;
}

interface DaemonHealth {
  status: string;
  peerId: string;
  peers: number;
  uptimeSeconds: number;
  sharedAssets: number;
  transfer: DaemonTransferStats;
  healthIndicators: DaemonHealthIndicators;
  /** The tracker the agent talks to and its build (dev | stg | prd); absent on older daemons. */
  trackerUrl?: string;
  environment?: string;
}

export interface DaemonInstallWatch {
  /** Watching for a freshly installed daemon (started by the Download click). */
  active: boolean;
  /** The watch reached its limit without a healthy daemon; waits for a manual retry. */
  timedOut: boolean;
}

export interface DaemonContextType {
  /** Whether daemon is reachable AND healthy AND built for this environment */
  connected: boolean;
  /** Derived status: online | degraded | offline */
  daemonStatus: DaemonStatus;
  /** A healthy agent of another environment: which build it is and which this site needs. Null otherwise. */
  envMismatch: AgentEnvMismatch | null;
  /** Raw health response from daemon */
  health: DaemonHealth;
  /** Platform support for the agent; 'unsupported' means localhost is never contacted. */
  support: DaemonSupport;
  platform: Platform;
  /** Install detection started by the Download click. */
  installWatch: DaemonInstallWatch;
  /** Start (or manually retry) install detection. No-op on unsupported platforms. */
  startInstallWatch: () => void;
  /** Stop install detection without a result. */
  stopInstallWatch: () => void;
  /** Force an immediate health re-poll. No-op on unsupported platforms. */
  refresh: () => Promise<void>;
  /** Toggle daemon: shutdown if connected, start if not */
  toggleDaemon: () => Promise<void>;
  /**
   * The owner stopped the agent from the portal (Kill Switch / Safe Mode) and has not
   * resumed it yet. Cleared by `startAgent` or when the agent comes back on its own.
   */
  stoppedByUser: boolean;
  /** Stop the agent through the controller (POST /stop). Resolves false when the controller refused. */
  stopAgent: () => Promise<boolean>;
  /** Start the agent through the controller (POST /start). Resolves false when the controller refused. */
  startAgent: () => Promise<boolean>;
}

const TRANSFER_FALLBACK: DaemonTransferStats = {
  uploadSpeedBps: 0,
  downloadSpeedBps: 0,
  shareRatio: 0,
  totalUploadedBytes: 0,
  totalDownloadedBytes: 0,
};
const HEALTH_INDICATORS_FALLBACK: DaemonHealthIndicators = {
  natStatus: 'unknown',
  dhtReady: false,
  mdnsReady: false,
  relayConnected: false,
};
const HEALTH_FALLBACK: DaemonHealth = {
  status: 'offline',
  peerId: '',
  peers: 0,
  uptimeSeconds: 0,
  sharedAssets: 0,
  transfer: TRANSFER_FALLBACK,
  healthIndicators: HEALTH_INDICATORS_FALLBACK,
};

/** Steady state once the daemon is known: 5 s, backing off to 60 s while it fails. */
const POLL_INTERVAL_MS = 5000;
const POLL_MAX_INTERVAL_MS = 60_000;
/** Discovery when nothing is recorded: 30 s, backing off to 2 min, until something answers. */
const DISCOVERY_POLL_INTERVAL_MS = 30_000;
const DISCOVERY_POLL_MAX_INTERVAL_MS = 120_000;
/** Install watch after the Download click: 3 → 6 → 12 s, then stop. */
const INSTALL_POLL_INTERVAL_MS = 3000;
const INSTALL_POLL_MAX_INTERVAL_MS = 12_000;
export const INSTALL_TIMEOUT_MS = 120_000;
/** Defer first health check to keep main thread free during initial paint. */
const POLL_DEFER_MS = 100;

const DaemonContext = createContext<DaemonContextType | null>(null);

export function DaemonProvider({ children }: { children: React.ReactNode }) {
  const [platform, setPlatform] = useState<Platform>('other');
  const [support, setSupport] = useState<DaemonSupport>('unknown');
  /** localStorage says an install was detected on this machine before. */
  const [installRecorded, setInstallRecorded] = useState(false);
  /** A probe succeeded during this page load: keep polling even if nothing was recorded. */
  const [seenOnline, setSeenOnline] = useState(false);
  const [watchStartedAt, setWatchStartedAt] = useState<number | null>(null);
  const [watchTimedOut, setWatchTimedOut] = useState(false);

  /* Platform and the install flag are only readable on the client; until then nothing probes. */
  useEffect(() => {
    const detected = currentPlatform();
    setPlatform(detected);
    setSupport(platformSupportsAgent(detected) ? 'supported' : 'unsupported');
    setInstallRecorded(getProfile()?.hasInstalledDaemon === true);
  }, []);

  const watching = watchStartedAt !== null;
  const enabled = support === 'supported';
  const known = installRecorded || seenOnline;

  const {
    data: health,
    isOnline,
    refresh: pollRefresh,
  } = usePoll({
    fetcher: daemonApi.health,
    interval: watching ? INSTALL_POLL_INTERVAL_MS : known ? POLL_INTERVAL_MS : DISCOVERY_POLL_INTERVAL_MS,
    maxInterval: watching ? INSTALL_POLL_MAX_INTERVAL_MS : known ? POLL_MAX_INTERVAL_MS : DISCOVERY_POLL_MAX_INTERVAL_MS,
    fallback: HEALTH_FALLBACK,
    enabled,
    defer: POLL_DEFER_MS,
  });

  const healthy = enabled && isOnline && (health.status === 'ok' || health.status === 'degraded');

  /* A healthy agent of another environment counts as not connected: its proxy would reach the wrong tracker. */
  const envMismatch = useMemo<AgentEnvMismatch | null>(
    () =>
      healthy
        ? detectEnvMismatch(
            { trackerUrl: health.trackerUrl ?? '', environment: asAgentEnv(health.environment) },
            { trackerUrl: config.api.trackerUrl, env: config.env },
          )
        : null,
    [healthy, health.trackerUrl, health.environment],
  );
  const connected = healthy && envMismatch === null;

  const daemonStatus: DaemonStatus = !connected ? 'offline' : health.status === 'degraded' ? 'degraded' : 'online';

  /* A healthy answer ends the install watch and keeps the steady poll alive, whichever build answered. */
  useEffect(() => {
    if (!healthy) return;
    setSeenOnline(true);
    setWatchStartedAt(null);
    setWatchTimedOut(false);
    if (!installRecorded) {
      try {
        recordDaemonInstall();
      } catch {
        /* storage unavailable: discovery simply runs again next load */
      }
      setInstallRecorded(true);
    }
  }, [healthy, installRecorded]);

  /* The install watch gives up after INSTALL_TIMEOUT_MS. Only a manual retry restarts it. */
  useEffect(() => {
    if (watchStartedAt === null) return;
    const remaining = Math.max(0, watchStartedAt + INSTALL_TIMEOUT_MS - Date.now());
    const timer = setTimeout(() => {
      setWatchStartedAt(null);
      setWatchTimedOut(true);
    }, remaining);
    return () => clearTimeout(timer);
  }, [watchStartedAt]);

  const refresh = useCallback(async () => {
    if (support !== 'supported') return;
    await pollRefresh();
  }, [support, pollRefresh]);

  const startInstallWatch = useCallback(() => {
    if (support !== 'supported') return;
    setWatchTimedOut(false);
    /* The cadence change restarts the poll chain with an immediate probe and a fresh back-off. */
    setWatchStartedAt(Date.now());
  }, [support]);

  const stopInstallWatch = useCallback(() => {
    setWatchStartedAt(null);
    setWatchTimedOut(false);
  }, []);

  /* Kill Switch state. The flag only says "the owner pressed stop"; whether the agent is
     actually down still comes from the health poll. Once the agent has been seen offline
     after the stop, a healthy answer (tray restart, service restart) clears the flag. */
  const [stoppedByUser, setStoppedByUser] = useState(false);
  const seenOfflineSinceStopRef = useRef(false);
  useEffect(() => {
    if (!stoppedByUser) return;
    if (!healthy) {
      seenOfflineSinceStopRef.current = true;
    } else if (seenOfflineSinceStopRef.current) {
      setStoppedByUser(false);
    }
  }, [healthy, stoppedByUser]);

  const stopAgent = useCallback(async () => {
    if (support !== 'supported') return false;
    const result = await daemonControl.shutdown();
    if (!result) return false;
    seenOfflineSinceStopRef.current = false;
    setStoppedByUser(true);
    await pollRefresh();
    return true;
  }, [support, pollRefresh]);

  const startAgent = useCallback(async () => {
    if (support !== 'supported') return false;
    const result = await daemonControl.start();
    if (!result) return false;
    setStoppedByUser(false);
    await pollRefresh();
    return true;
  }, [support, pollRefresh]);

  const toggleDaemon = useCallback(async () => {
    if (connected) {
      await stopAgent();
    } else {
      await startAgent();
    }
  }, [connected, stopAgent, startAgent]);

  const installWatch = useMemo<DaemonInstallWatch>(() => ({ active: watching, timedOut: watchTimedOut }), [watching, watchTimedOut]);

  const value = useMemo<DaemonContextType>(
    () => ({
      connected,
      daemonStatus,
      envMismatch,
      health: enabled ? health : HEALTH_FALLBACK,
      support,
      platform,
      installWatch,
      startInstallWatch,
      stopInstallWatch,
      refresh,
      toggleDaemon,
      stoppedByUser,
      stopAgent,
      startAgent,
    }),
    [
      connected,
      daemonStatus,
      envMismatch,
      health,
      enabled,
      support,
      platform,
      installWatch,
      startInstallWatch,
      stopInstallWatch,
      refresh,
      toggleDaemon,
      stoppedByUser,
      stopAgent,
      startAgent,
    ],
  );

  return <DaemonContext.Provider value={value}>{children}</DaemonContext.Provider>;
}

/** Hook to consume daemon state from any component. */
export function useDaemon(): DaemonContextType {
  const ctx = useContext(DaemonContext);
  if (!ctx) {
    throw new Error('useDaemon() must be used within <DaemonProvider>');
  }
  return ctx;
}
