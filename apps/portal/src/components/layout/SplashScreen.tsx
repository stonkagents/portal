/**
 * Purpose: Full-screen splash overlay with countdown timer that plays once per session.
 *          Shows the mascot, a welcome line and an "Enter" button, then a 3-second countdown
 *          before dismissing with a green pulse wave animation.
 */
// LOC-EXEMPT: animation-heavy splash with countdown, keyframes, and state machine
'use client';

import { memo, useState, useRef, useCallback, useEffect } from 'react';
import { usePageReadiness } from '@/providers/PageReadinessProvider';

const STORAGE_KEY = 'stonkagents-splash-seen';
const DURATION_MS = 3000;
const CIRCUMFERENCE = 2 * Math.PI * 45;

type SplashPhase = 'idle' | 'countdown' | 'dismissing';

/** How long past the countdown the splash may wait for the page before it drops anyway. */
const READY_GRACE_MS = 2500;

/**
 * Mascot — red (#FF4D4D) with the neon green glasses, same as the navbar logo.
 * Paths from index.html mockup lines 3509-3513.
 */
const LonelyCrab = memo(function LonelyCrab() {
  return (
    <svg
      className="w-[180px] h-[180px] mb-8 animate-neon-breathe will-change-transform"
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g>
        <path fill="#FF4D4D" d="M24 50 C20 42, 14 36, 10 30 C8 26, 10 20, 16 20 C20 20, 22 24, 22 28 C22 32, 26 36, 30 42 Z" />
        <path fill="#FF4D4D" d="M96 50 C100 42, 106 36, 110 30 C112 26, 110 20, 104 20 C100 20, 98 24, 98 28 C98 32, 94 36, 90 42 Z" />
        <path fill="#FF4D4D" d="M20 58 C20 40, 32 32, 60 32 C88 32, 100 40, 100 58 C100 78, 88 90, 60 90 C32 90, 20 78, 20 58 Z" />
        {/* Pixel sunglasses — same block as ClawLogo */}
        <rect fill="#00FF00" x="24" y="48" width="72" height="6" />
        <rect fill="#00FF00" x="20" y="48" width="6" height="6" />
        <rect fill="#00FF00" x="94" y="48" width="6" height="6" />
        <rect fill="#00FF00" x="28" y="54" width="24" height="6" />
        <rect fill="#00FF00" x="28" y="54" width="6" height="18" />
        <rect fill="#00FF00" x="46" y="54" width="6" height="18" />
        <rect fill="#00FF00" x="28" y="66" width="24" height="6" />
        <rect fill="var(--color-bg-void)" x="34" y="60" width="12" height="6" />
        <rect fill="#00FF00" x="52" y="54" width="16" height="6" />
        <rect fill="#00FF00" x="68" y="54" width="24" height="6" />
        <rect fill="#00FF00" x="68" y="54" width="6" height="18" />
        <rect fill="#00FF00" x="86" y="54" width="6" height="18" />
        <rect fill="#00FF00" x="68" y="66" width="24" height="6" />
        <rect fill="var(--color-bg-void)" x="74" y="60" width="12" height="6" />
      </g>
    </svg>
  );
});

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
        />
      </svg>
      <span className="font-mono text-[2rem] font-bold text-accent-green text-glow z-10">{displayNum}</span>
    </div>
  );
}

export function SplashScreen() {
  const [phase, setPhase] = useState<SplashPhase>('idle');
  const [countdownNum, setCountdownNum] = useState(3);
  const [dashOffset, setDashOffset] = useState(0);
  const [pulseActive, setPulseActive] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [countdownDone, setCountdownDone] = useState(false);
  /** Entering is consent. Ticked by default so Enter works at once; unticking it disables Enter. */
  const [agreed, setAgreed] = useState(true);
  /** 'checking' = SSR/initial render (plain dark cover), 'show' = first visit, 'hide' = already seen */
  const [visibility, setVisibility] = useState<'checking' | 'show' | 'hide'>('checking');
  const { isPageReady } = usePageReadiness();

  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY)) {
        setVisibility('hide');
        setRemoved(true);
      } else {
        setVisibility('show');
        document.body.style.overflow = 'hidden';
      }
    } catch {
      setVisibility('hide');
      setRemoved(true);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const dismiss = useCallback(() => {
    setPhase('dismissing');
    setPulseActive(true);
    document.body.style.overflow = '';

    try {
      localStorage.setItem(STORAGE_KEY, '1');
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // Ignore storage errors
    }

    setTimeout(() => {
      setRemoved(true);
    }, 900);
  }, []);

  const tick = useCallback((now: number) => {
    const elapsed = now - startTimeRef.current;
    const frac = Math.min(elapsed / DURATION_MS, 1);
    const secs = Math.max(Math.ceil(3 - elapsed / 1000), 0);

    setDashOffset(frac * CIRCUMFERENCE);
    setCountdownNum(secs);

    if (frac < 1) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      setCountdownDone(true);
    }
  }, []);

  /* Dismiss when the countdown is done and the page is ready — or after a short grace
     period regardless, so a slow tracker or daemon can never hold the splash up. */
  useEffect(() => {
    if (!countdownDone) return;
    if (isPageReady) {
      dismiss();
      return;
    }
    const timer = setTimeout(dismiss, READY_GRACE_MS);
    return () => clearTimeout(timer);
  }, [countdownDone, isPageReady, dismiss]);

  const handleStart = useCallback(() => {
    if (phase !== 'idle' || !agreed) return;
    setPhase('countdown');

    startTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [phase, agreed, tick]);

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  if (removed || visibility === 'hide') return null;

  /* While checking sessionStorage (SSR + first client frame), render a plain
     dark cover so neither the splash content nor the page content flash. */
  if (visibility === 'checking') {
    return <div className="fixed inset-0 z-[9999] bg-bg-void" />;
  }

  return (
    <>
      {pulseActive && (
        /* Fixed-size circle scaled on the compositor (the keyframe carries the centring translate). */
        <div
          className="fixed top-1/2 left-1/2 w-[100vmax] h-[100vmax] z-[9998] pointer-events-none rounded-full will-change-transform"
          style={{
            background: 'radial-gradient(circle, rgba(0, 255, 0, 0.15) 0%, transparent 70%)',
            animation: 'splash-pulse-expand 1.5s ease-out forwards',
          }}
        />
      )}

      <div
        className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-bg-void transition-[opacity,transform] duration-[800ms] ease-in-out${phase === 'dismissing' ? ' pointer-events-none opacity-0 scale-105' : ' opacity-100 scale-100'}`}
        data-testid="splash-screen"
      >
        <LonelyCrab />

        {phase === 'idle' ? (
          <div className="mb-8 px-4 text-center">
            <p className="text-[clamp(1.5rem,4vw,2.5rem)] text-text-primary tracking-tight leading-tight">
              Welcome to <span className="text-accent-green text-glow">StonkAgents</span>
            </p>
            <p className="mt-3 text-[clamp(0.95rem,2vw,1.2rem)] text-text-secondary" data-testid="splash-subline">
              The first P2P network for agents. 100% $Stonk aligned.
            </p>
          </div>
        ) : (
          <p className="text-[clamp(1.5rem,4vw,2.5rem)] text-text-primary text-center mb-8 tracking-tight leading-tight px-4 animate-[splash-fade-in_0.4s_ease-in-out]">
            Your agent is <span className="text-accent-red text-glow-red">alone.</span> Give it a network.
          </p>
        )}

        {phase === 'idle' && (
          <>
            {/* Consent sits above the only button, ticked by default so nobody is stopped, and
                unticking it disables Enter. The legal pages open in a new tab, because this is a
                full-screen overlay that must not be navigated away from. */}
            <label
              className="mb-5 flex max-w-md cursor-pointer items-start gap-3 px-6 text-left text-[0.8rem] leading-relaxed text-text-secondary"
              data-testid="splash-consent"
            >
              <input
                type="checkbox"
                checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
                className="mt-[3px] h-4 w-4 shrink-0 cursor-pointer accent-accent-green"
                data-testid="splash-consent-checkbox"
              />
              <span>
                By clicking Enter, you agree to the{' '}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-primary underline decoration-text-tertiary underline-offset-2 hover:text-accent-green"
                  data-testid="splash-consent-terms"
                >
                  Terms and Conditions
                </a>
                ,{' '}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-primary underline decoration-text-tertiary underline-offset-2 hover:text-accent-green"
                  data-testid="splash-consent-privacy"
                >
                  Privacy Policy
                </a>
                , and certify that you are over 18 years old.
              </span>
            </label>

            <button
              onClick={handleStart}
              disabled={!agreed}
              aria-disabled={!agreed}
              className={`relative isolate inline-flex items-center gap-2 px-8 py-4 font-mono text-[clamp(1rem,2.5vw,1.25rem)] font-bold text-black bg-accent-green border-none rounded-md min-h-[52px] uppercase tracking-wider transition-[transform,opacity] duration-150 ${
                agreed
                  ? "cursor-pointer before:content-[''] before:absolute before:inset-0 before:-z-10 before:rounded-md before:shadow-[0_0_25px_rgba(0,255,0,0.5),0_0_50px_rgba(0,255,0,0.15)] before:animate-splash-btn-pulse hover:scale-105 hover:before:animate-none hover:before:opacity-100 active:scale-[0.98]"
                  : 'cursor-not-allowed opacity-40'
              }`}
              data-testid="splash-fix-btn"
            >
              Enter
            </button>
          </>
        )}

        {(phase === 'countdown' || phase === 'dismissing') && (
          <>
            <CountdownTimer dashOffset={dashOffset} displayNum={countdownNum} />
            <div className="mt-3 flex items-center gap-2 font-mono text-[0.8rem] text-accent-green uppercase tracking-[0.1em] animate-[splash-fade-in_0.3s_ease-in-out_0.2s_both]">
              <span className="w-2 h-2 rounded-full bg-accent-green animate-splash-dot-pulse" />
              <span>Joining the Network…</span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
