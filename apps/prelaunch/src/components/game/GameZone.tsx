/**
 * Purpose: Tab container for runner, swarm, and racer games with score display,
 *          replay prompt, and always-visible share-on-X CTA tagging @stonkagents.
 */
'use client';

import { useState, useCallback, useEffect } from 'react';
import { RunnerGame } from '@/components/game/runner/RunnerGame';
import { SwarmGame } from '@/components/game/swarm/SwarmGame';
// import { RacerGame } from '@/components/game/racer/RacerGame'; /* Racer disabled */
import { FullscreenWrapper } from '@/components/game/FullscreenWrapper';
import { ShareOnX } from '@/components/ui/ShareOnX';
import { getHighScore, xr7, xw7 } from '@/lib/storage';
import { setMuted, isMuted } from '@/lib/audio/sfx';

type GameTab = 'runner' | 'swarm' | 'racer';
type ZonePhase = 'loading' | 'welcome-back' | 'playing' | 'game-over';

const TIER_A_MIN = 50;
const TIER_B_MIN = 100;

/** Inline lock icon (no emoji) */
function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" fill="currentColor" aria-hidden="true">
      <path d="M8 1a4 4 0 0 0-4 4v2H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1V5a4 4 0 0 0-4-4zm-2 4a2 2 0 1 1 4 0v2H6V5z" />
    </svg>
  );
}

/** Inline unlock icon (no emoji) */
function UnlockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" fill="currentColor" aria-hidden="true">
      <path d="M8 1a4 4 0 0 0-4 4v2H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1H6V5a2 2 0 1 1 4 0h2a4 4 0 0 0-4-4z" />
    </svg>
  );
}

export function GameZone() {
  const [activeTab, setActiveTab] = useState<GameTab>('runner');
  const [lastScore, setLastScore] = useState(0);
  const [tierA, setTierA] = useState(() => xr7(0));
  const [phase, setPhase] = useState<ZonePhase>('loading');
  const [previousBest, setPreviousBest] = useState(0);
  const [soundMuted, setSoundMuted] = useState(() => isMuted());

  const toggleMute = useCallback(() => {
    const next = !soundMuted;
    setSoundMuted(next);
    setMuted(next);
  }, [soundMuted]);

  /* Detect returning player on mount */
  useEffect(() => {
    const best = getHighScore('runner');
    if (best > 0) {
      setPreviousBest(best);
      setPhase('welcome-back');
    } else {
      setPhase('playing');
    }
  }, []);

  const handleGameOver = useCallback(
    (score: number) => {
      setLastScore(score);
      setPhase('game-over');
      if (score >= TIER_A_MIN && !tierA) {
        setTierA(true);
        xw7(0);
      }
      /* Racer unlock disabled — revisit later */
    },
    [tierA],
  );

  const handlePlayAgain = useCallback(() => {
    setLastScore(0);
    setPhase('playing');
  }, []);

  const tabBase =
    'px-4 py-2.5 font-mono text-[var(--text-sm)] font-bold rounded-md min-h-[44px] uppercase tracking-wider transition-all duration-150';
  const tabActive = 'bg-accent-green text-black';
  const tabInactive = 'bg-bg-tertiary text-text-secondary hover:text-text-primary';
  const tabLocked = 'bg-bg-secondary text-text-tertiary cursor-not-allowed opacity-50';

  const gameOverMessage =
    lastScore >= TIER_B_MIN
      ? 'Absolute legend.'
      : lastScore >= TIER_A_MIN
        ? 'Solid run, Agent.'
        : lastScore >= 25
          ? 'Not bad, Agent.'
          : 'The Network demands more.';

  return (
    <section id="games" className="relative px-4 py-16 flex flex-col items-center" data-testid="game-zone">
      <h2 className="font-mono font-bold text-text-primary text-[var(--text-3xl)] mb-2 text-center">
        Play a <span className="text-accent-green text-glow">Game</span>
      </h2>
      <p className="text-text-secondary text-[var(--text-sm)] mb-8 text-center max-w-md">Score 50+ to unlock Sync the Swarm</p>

      {/* ── Welcome Back (returning player) ── */}
      {phase === 'welcome-back' && (
        <div className="flex flex-col items-center gap-4 mb-8 animate-fade-in-up">
          <p className="font-mono text-[var(--text-xl)] text-text-primary text-center">Yo, you&apos;re back, Agent.</p>
          <p className="text-text-secondary text-[var(--text-base)] text-center max-w-sm">
            Last time you scored <span className="text-accent-green text-glow font-bold">{previousBest}</span>.
            {previousBest < TIER_A_MIN ? ' Think you can hit 50 this time?' : ' Still got that fire?'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              data-testid="welcome-play-btn"
              onClick={handlePlayAgain}
              className="px-6 py-3 font-mono text-[var(--text-base)] font-bold text-black bg-accent-green rounded-md min-h-[44px] uppercase tracking-wider hover:scale-105 hover:shadow-[0_0_20px_rgba(0,255,0,0.4)] active:scale-[0.98] transition-all duration-150 animate-splash-btn-pulse"
            >
              Run It Back
            </button>
            <ShareOnX score={previousBest} game="runner" />
          </div>
        </div>
      )}

      {/* ── Tab bar (visible when playing or game-over) ── */}
      {(phase === 'playing' || phase === 'game-over') && (
        <>
          <div className="flex flex-wrap gap-2 mb-6 items-center justify-center" role="tablist">
            <button
              data-testid="tab-runner"
              role="tab"
              aria-selected={activeTab === 'runner'}
              onClick={() => {
                setActiveTab('runner');
                handlePlayAgain();
              }}
              className={`${tabBase} ${activeTab === 'runner' ? tabActive : tabInactive}`}
            >
              Find Your Agent
            </button>
            <button
              data-testid="tab-swarm"
              role="tab"
              aria-selected={activeTab === 'swarm'}
              onClick={() => {
                if (tierA) {
                  setActiveTab('swarm');
                  handlePlayAgain();
                }
              }}
              disabled={!tierA}
              className={`${tabBase} ${activeTab === 'swarm' && tierA ? tabActive : tierA ? tabInactive : tabLocked}`}
            >
              {!tierA && <LockIcon />}
              Sync the Swarm
            </button>
            {/* Racer tab hidden — controls need polish, will revisit */}
            <button
              data-testid="mute-toggle-btn"
              onClick={toggleMute}
              aria-label={soundMuted ? 'Unmute sound' : 'Mute sound'}
              className={`${tabBase} ${soundMuted ? 'bg-accent-red/20 text-accent-red' : 'bg-bg-tertiary text-text-secondary hover:text-accent-green'}`}
            >
              {soundMuted ? (
                <svg
                  viewBox="0 0 24 24"
                  className="w-5 h-5 mx-auto"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M11 5L6 9H2v6h4l5 4V5z" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  className="w-5 h-5 mx-auto"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M11 5L6 9H2v6h4l5 4V5z" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
              )}
            </button>
          </div>

          {/* Game canvas — with fullscreen support */}
          <FullscreenWrapper>
            {activeTab === 'runner' && <RunnerGame onGameOver={handleGameOver} />}
            {activeTab === 'swarm' && <SwarmGame onGameOver={handleGameOver} />}
            {/* activeTab === 'racer' && <RacerGame onGameOver={handleGameOver} /> */}
          </FullscreenWrapper>
        </>
      )}

      {/* ── Game Over — score + share + replay ── */}
      {phase === 'game-over' && lastScore > 0 && (
        <div className="mt-8 flex flex-col items-center gap-4 animate-fade-in-up">
          <p className="font-mono text-[var(--text-2xl)] text-text-primary text-center">{gameOverMessage}</p>
          <p className="font-mono text-[var(--text-lg)] text-text-primary">
            Score: <span className="text-accent-green text-glow font-bold">{lastScore}</span>
            {' \u00B7 '}
            Best: <span className="text-accent-yellow font-bold">{getHighScore(activeTab)}</span>
          </p>

          {/* Share first — always prominent */}
          <ShareOnX score={lastScore} game={activeTab} />

          {/* Replay */}
          <button
            data-testid="play-again-btn"
            onClick={handlePlayAgain}
            className="px-6 py-3 font-mono text-[var(--text-sm)] font-bold text-accent-green bg-transparent border border-accent-green rounded-md min-h-[44px] uppercase tracking-wider hover:bg-accent-green hover:text-black hover:scale-105 active:scale-[0.98] transition-all duration-150"
          >
            {lastScore < TIER_A_MIN ? 'Try Again \u2014 You Need 50' : 'Run It Back'}
          </button>

          {lastScore >= TIER_A_MIN && !xr7(0) && (
            <p className="text-accent-green text-glow text-[var(--text-sm)] font-mono animate-pulse">
              <UnlockIcon /> Sync the Swarm UNLOCKED
            </p>
          )}
        </div>
      )}

      {/* Fun disclaimer */}
      <p className="mt-12 text-text-tertiary text-[var(--text-xs)] text-center max-w-sm font-mono leading-relaxed">
        The Agent is still warming up. Have fun, don&apos;t judge too hard &mdash; the real thing is coming.
      </p>
    </section>
  );
}
