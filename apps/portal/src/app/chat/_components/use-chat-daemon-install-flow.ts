/**
 * Purpose: Install stepper for the chat daemon setup panel (same behaviour as
 *          the home hero, without the fork/crash states). Detection is
 *          DaemonProvider's install watch: nothing here polls localhost (PERF-3).
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDaemon } from '@/providers/DaemonProvider';
import { recordDaemonInstall } from '@/lib/user-profile';
import type { InstallStep } from '@/app/_components/useHomePage';

const LIVE_HOLD_MS = 3000;

export function useChatDaemonInstallFlow(onLiveHoldComplete?: () => void) {
  const { connected, health, installWatch, startInstallWatch, stopInstallWatch } = useDaemon();
  const [installStep, setInstallStep] = useState<InstallStep>('idle');
  const installStartRef = useRef(0);
  const onLiveHoldCompleteRef = useRef(onLiveHoldComplete);
  onLiveHoldCompleteRef.current = onLiveHoldComplete;

  /** The Download click is the only thing that starts detection. */
  const handleDownload = useCallback(() => {
    if (installStep !== 'idle') return;
    setInstallStep('waiting');
    installStartRef.current = Date.now();
    startInstallWatch();
  }, [installStep, startInstallWatch]);

  /* React to the provider's health: healthy → live, answering-but-not-healthy → detecting. */
  const healthStatus = health.status;
  useEffect(() => {
    if (installStep !== 'waiting' && installStep !== 'detecting') return;
    if (connected) {
      setInstallStep('live');
      recordDaemonInstall();
    } else if (installStep === 'waiting' && (healthStatus === 'starting' || healthStatus === 'degraded')) {
      setInstallStep('detecting');
    }
  }, [connected, healthStatus, installStep]);

  /* "live" holds for a moment, then the panel hands over to the connected chat. */
  useEffect(() => {
    if (installStep !== 'live') return;
    const timer = setTimeout(() => {
      setInstallStep('idle');
      onLiveHoldCompleteRef.current?.();
    }, LIVE_HOLD_MS);
    return () => clearTimeout(timer);
  }, [installStep]);

  /** The watch gave up (120 s). `setInstallTimeout(false)` is the manual Retry. */
  const installTimeout = installWatch.timedOut && (installStep === 'waiting' || installStep === 'detecting');
  const setInstallTimeout = useCallback(
    (timedOut: boolean) => {
      if (timedOut) stopInstallWatch();
      else startInstallWatch();
    },
    [startInstallWatch, stopInstallWatch],
  );

  return {
    installStep,
    installTimeout,
    setInstallTimeout,
    installStartRef,
    handleDownload,
  };
}
