/**
 * Purpose: Full-screen splash with lonely crab, countdown timer, and pulse dismiss.
 *          Adapted from the portal's SplashScreen — no PageReadinessProvider dependency.
 */
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { LonelyCrab } from '@/components/brand/LonelyCrab';

const STORAGE_KEY = 'stonkagents-prelaunch-splash-seen';
const DURATION_MS = 3000;
const CIRCUMFERENCE = 2 * Math.PI * 45;

type SplashPhase = 'idle' | 'countdown' | 'dismissing';

interface SplashOverlayProps {
  onDismiss: () => void;
}

function CountdownTimer({ dashOffset, displayNum }: { dashOffset: number; displayNum: number }) {
  return (
    <div className="relative w-[100px] h-[100px] flex items-center justify-center mb-3">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(0, 255, 0, 0.12)" strokeWidth="4" />
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="var(--color-accent-green)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          style={{ filter: 'drop-shadow(0 0 6px rgba(0, 255, 0, 0.5))' }}
        />
      </svg>
      <span className="font-mono text-[2rem] font-bold text-accent-green text-glow z-10">{displayNum}</span>
    </div>
  );
}

export function SplashOverlay({ onDismiss }: SplashOverlayProps) {
  const [phase, setPhase] = useState<SplashPhase>('idle');
  const [countdownNum, setCountdownNum] = useState(3);
  const [dashOffset, setDashOffset] = useState(0);
  const [pulseActive, setPulseActive] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [visibility, setVisibility] = useState<'checking' | 'show' | 'hide'>('checking');

  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_KEY)) {
        setVisibility('hide');
        setRemoved(true);
        onDismiss();
      } else {
        setVisibility('show');
        document.body.style.overflow = 'hidden';
      }
    } catch {
      setVisibility('hide');
      setRemoved(true);
      onDismiss();
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [onDismiss]);

  const dismiss = useCallback(() => {
    setPhase('dismissing');
    setPulseActive(true);
    document.body.style.overflow = '';
    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      setRemoved(true);
      onDismiss();
    }, 900);
  }, [onDismiss]);

  const tick = useCallback(
    (now: number) => {
      const elapsed = now - startTimeRef.current;
      const frac = Math.min(elapsed / DURATION_MS, 1);
      const secs = Math.max(Math.ceil(3 - elapsed / 1000), 0);

      setDashOffset(frac * CIRCUMFERENCE);
      setCountdownNum(secs);

      if (frac < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        dismiss();
      }
    },
    [dismiss],
  );

  const handleStart = useCallback(() => {
    if (phase !== 'idle') return;
    setPhase('countdown');
    startTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [phase, tick]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (removed || visibility === 'hide') return null;
  if (visibility === 'checking') {
    return <div className="fixed inset-0 z-[9999] bg-bg-void" />;
  }

  return (
    <>
      {pulseActive && (
        <div
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9998] pointer-events-none rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(0, 255, 0, 0.15) 0%, transparent 70%)',
            animation: 'splash-pulse-expand 1.5s ease-out forwards',
          }}
        />
      )}

      <div
        className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-bg-void transition-[opacity,transform] duration-[800ms] ease-in-out${
          phase === 'dismissing' ? ' pointer-events-none opacity-0 scale-105' : ' opacity-100 scale-100'
        }`}
        data-testid="splash-screen"
      >
        <LonelyCrab className="w-[180px] h-[180px] mb-8 animate-splash-bob" />

        {phase === 'idle' ? (
          <p className="text-[clamp(1.5rem,4vw,2.5rem)] text-text-primary text-center mb-8 tracking-tight leading-tight px-4">
            Your agent is <span className="text-accent-red text-glow-red">alone.</span> Give it a network.
          </p>
        ) : (
          <p className="text-[clamp(1.5rem,4vw,2.5rem)] text-text-primary text-center mb-8 tracking-tight leading-tight px-4 animate-[splash-fade-in_0.4s_ease-in-out]">
            Syncing the <span className="text-accent-green text-glow">Swarm...</span>
          </p>
        )}

        {phase === 'idle' && (
          <button
            onClick={handleStart}
            className="inline-flex items-center gap-2 px-8 py-4 font-mono text-[clamp(1rem,2.5vw,1.25rem)] font-bold text-black bg-accent-green border-none rounded-md cursor-pointer min-h-[52px] uppercase tracking-wider animate-splash-btn-pulse hover:scale-105 hover:shadow-[0_0_30px_rgba(0,255,0,0.5),0_0_60px_rgba(0,255,0,0.2)] active:scale-[0.98] transition-all duration-150"
            data-testid="splash-fix-btn"
          >
            Yeah That &rarr;
          </button>
        )}

        {(phase === 'countdown' || phase === 'dismissing') && (
          <>
            <CountdownTimer dashOffset={dashOffset} displayNum={countdownNum} />
            <div className="mt-3 flex items-center gap-2 font-mono text-[0.8rem] text-accent-green uppercase tracking-[0.1em] animate-[splash-fade-in_0.3s_ease-in-out_0.2s_both]">
              <span className="w-2 h-2 rounded-full bg-accent-green animate-splash-dot-pulse" />
              <span>Initializing the Network</span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
