/**
 * Purpose: State behind the "Allow local access" dialog (local-network-access.ts
 *          does the browser work, installed-agent.ts the agent probe). `phase`
 *          drives the dialog: `intro` before the first attempt, `checking` while
 *          the browser asks or the agent is probed, `prompt` when the user
 *          dismissed the browser's dialog, `denied` when they blocked it. Once
 *          the permission is granted (or absent) the agent on this computer is
 *          probed before anything downloads: nothing there calls `onProceed`
 *          and the dialog closes; another environment's build shows `mismatch`
 *          for a moment and then proceeds; an agent that is already up to date
 *          shows `installed` and downloads nothing; an older one shows `update`
 *          and waits for the click. Two failed permission attempts unlock
 *          "Download anyway" so nobody is ever stuck behind a permission the
 *          browser will not report. The permission is also watched live
 *          (use-local-access-notice.ts): when the user unblocks the site in
 *          the browser's settings while the dialog shows `denied` or `prompt`,
 *          it switches to `allowed` on its own and goes on to the agent probe
 *          after a short pause, no Recheck needed.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  checkLocalAccessInBrowser,
  localAccessRemembered,
  permissionsApiPresent,
  queryLocalAccessPermission,
  rememberLocalAccessGranted,
  type LocalAccessOutcome,
} from './local-network-access';
import { checkInstalledAgentInBrowser, type DownloadDecision } from './installed-agent';
import { useLocalAccessState } from './use-local-access-notice';

export type LocalAccessPhase = 'intro' | 'checking' | 'prompt' | 'denied' | 'allowed' | 'mismatch' | 'installed' | 'update';

/** Failed attempts after which the dialog offers to download anyway. */
export const LOCAL_ACCESS_MAX_ATTEMPTS = 2;

/** How long the "wrong build, downloading this site's" line stays before the download starts. */
export const MISMATCH_NOTICE_MS = 2_500;

/** How long "Access allowed" stays, after the user unblocked the site, before the agent probe runs. */
export const ALLOWED_NOTICE_MS = 1_200;

export interface LocalAccessGateState {
  phase: LocalAccessPhase;
  attempts: number;
  /** Two attempts have failed: the dialog may let the download through. */
  canBypass: boolean;
  /** What the agent probe found, for the copy of the mismatch, installed and update phases. */
  agent: DownloadDecision | null;
  /** "Allow and download", "Recheck", "Try again": the permission check, then the agent probe. */
  attempt: () => Promise<void>;
  /**
   * The agent probe alone, for a click that found the permission granted or absent.
   * Resolves true when the download started (nothing to show), false when the
   * dialog has something to say and should be opened.
   */
  checkAgent: () => Promise<boolean>;
  /** "Download anyway", "Download update": proceeds without any further check. */
  bypass: () => void;
  reset: () => void;
}

export interface LocalAccessGateOptions {
  /** The browser permission check; the real one by default. */
  check?: () => Promise<LocalAccessOutcome>;
  /** The agent probe and decision; the real one by default. */
  checkAgent?: () => Promise<DownloadDecision>;
  /** Called when the probe found an agent that is already up to date (the site can show it online at once). */
  onInstalled?: () => void;
}

export function useLocalAccessGate(onProceed: () => void, options: LocalAccessGateOptions = {}): LocalAccessGateState {
  const { check = checkLocalAccessInBrowser, checkAgent: probeAgent = checkInstalledAgentInBrowser, onInstalled } = options;
  const [phase, setPhase] = useState<LocalAccessPhase>('intro');
  const [attempts, setAttempts] = useState(0);
  const [agent, setAgent] = useState<DownloadDecision | null>(null);
  const running = useRef(false);
  /* One notice at a time waits on this: the mismatch line before its download, the allowed line before its probe. */
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onProceedRef = useRef(onProceed);
  onProceedRef.current = onProceed;
  const onInstalledRef = useRef(onInstalled);
  onInstalledRef.current = onInstalled;

  const clearNoticeTimer = useCallback(() => {
    if (noticeTimer.current !== undefined) clearTimeout(noticeTimer.current);
    noticeTimer.current = undefined;
  }, []);
  useEffect(() => clearNoticeTimer, [clearNoticeTimer]);

  const proceed = useCallback(() => {
    clearNoticeTimer();
    setPhase('intro');
    setAttempts(0);
    setAgent(null);
    onProceedRef.current();
  }, [clearNoticeTimer]);

  /** The agent probe; true when the download started. */
  const runAgentCheck = useCallback(async (): Promise<boolean> => {
    let decision: DownloadDecision;
    try {
      decision = await probeAgent();
    } catch {
      decision = { kind: 'download' };
    }
    if (decision.kind === 'download') {
      proceed();
      return true;
    }
    setAgent(decision);
    setPhase(decision.kind);
    if (decision.kind === 'mismatch') {
      clearNoticeTimer();
      noticeTimer.current = setTimeout(proceed, MISMATCH_NOTICE_MS);
    } else if (decision.kind === 'installed') {
      onInstalledRef.current?.();
    }
    return false;
  }, [probeAgent, proceed, clearNoticeTimer]);

  const attempt = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setPhase('checking');
    try {
      let outcome: LocalAccessOutcome;
      try {
        outcome = await check();
      } catch {
        outcome = 'unsupported';
      }
      if (outcome === 'granted') rememberLocalAccessGranted();
      if (outcome === 'granted' || outcome === 'unsupported') {
        await runAgentCheck();
        return;
      }
      setAttempts(n => n + 1);
      setPhase(outcome);
    } finally {
      running.current = false;
    }
  }, [check, runAgentCheck]);

  const checkAgent = useCallback(async (): Promise<boolean> => {
    if (running.current) return false;
    running.current = true;
    setPhase('checking');
    try {
      return await runAgentCheck();
    } finally {
      running.current = false;
    }
  }, [runAgentCheck]);

  /* The permission watched live: the user who unblocks the site in the browser's settings while the
     dialog shows the fix (or the dismissed prompt) sees "Access allowed" at once, and the agent probe
     follows on its own. Recheck stays for browsers that never fire the change event. */
  const live = useLocalAccessState();
  useEffect(() => {
    if (live !== 'granted' || (phase !== 'denied' && phase !== 'prompt')) return;
    rememberLocalAccessGranted();
    setPhase('allowed');
    clearNoticeTimer();
    noticeTimer.current = setTimeout(() => {
      noticeTimer.current = undefined;
      if (running.current) return;
      running.current = true;
      void runAgentCheck().finally(() => {
        running.current = false;
      });
    }, ALLOWED_NOTICE_MS);
  }, [live, phase, runAgentCheck, clearNoticeTimer]);

  const reset = useCallback(() => {
    clearNoticeTimer();
    setPhase('intro');
    setAttempts(0);
    setAgent(null);
  }, [clearNoticeTimer]);

  return { phase, attempts, canBypass: attempts >= LOCAL_ACCESS_MAX_ATTEMPTS, agent, attempt, checkAgent, bypass: proceed, reset };
}

/**
 * Whether the Download click needs the gate at all: false when the browser has
 * no local network permission or granted it earlier this session, null while
 * the (async) feature test is still out. A click during null opens the gate,
 * which settles it on the spot.
 */
export function useLocalAccessGateNeeded(): boolean | null {
  const [needed, setNeeded] = useState<boolean | null>(() => (permissionsApiPresent() ? null : false));
  useEffect(() => {
    if (!permissionsApiPresent()) {
      setNeeded(false);
      return;
    }
    if (localAccessRemembered()) {
      setNeeded(false);
      return;
    }
    let cancelled = false;
    queryLocalAccessPermission()
      .then(status => {
        if (cancelled) return;
        if (status?.state === 'granted') {
          rememberLocalAccessGranted();
          setNeeded(false);
        } else {
          setNeeded(status !== null);
        }
      })
      .catch(() => {
        if (!cancelled) setNeeded(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return needed;
}
