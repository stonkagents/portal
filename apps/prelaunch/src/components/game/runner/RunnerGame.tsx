/**
 * Purpose: React wrapper around the canvas game loop.
 *          Handles input, RAF lifecycle, fullscreen hi-res scaling, sound effects,
 *          and game-over callback.
 */
'use client';

import { useRef, useEffect, useCallback } from 'react';
import { createInitialState, updateState, jump } from './engine';
import { render } from './renderer';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';
import { useFullscreenContext } from '@/components/game/FullscreenWrapper';
import { sfxJump, sfxCollect, sfxDeath, sfxStart } from '@/lib/audio/sfx';
import { startRunnerBGM, stopBGM } from '@/lib/audio/bgm';

interface RunnerGameProps {
  onGameOver: (score: number) => void;
}

export function RunnerGame({ onGameOver }: RunnerGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(createInitialState());
  const rafRef = useRef(0);
  const reportedRef = useRef(false);
  const prevScoreRef = useRef(0);
  const prevCollectiblesRef = useRef(0);
  const { isFullscreen, scaleFactor } = useFullscreenContext();

  /* Scale canvas resolution when entering/exiting fullscreen */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = Math.round(CANVAS_WIDTH * scaleFactor);
    canvas.height = Math.round(CANVAS_HEIGHT * scaleFactor);
  }, [scaleFactor]);

  const handleInput = useCallback(() => {
    const s = stateRef.current;
    if (s.phase === 'dead') {
      stateRef.current = createInitialState();
      stateRef.current.phase = 'playing';
      reportedRef.current = false;
      prevScoreRef.current = 0;
      prevCollectiblesRef.current = s.collectibles.length;
      sfxStart();
      startRunnerBGM();
      return;
    }
    if (s.phase === 'ready') {
      sfxStart();
      startRunnerBGM();
    } else if (s.player.grounded) {
      sfxJump();
    }
    stateRef.current = jump(s);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function tick() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const prevState = stateRef.current;
      stateRef.current = updateState(stateRef.current);
      const s = stateRef.current;

      /* Sound: collected a Agent (score jumped by 5+) */
      if (s.score > prevScoreRef.current + 4 && s.phase === 'playing') {
        sfxCollect();
      }
      prevScoreRef.current = s.score;

      /* Scale context so game logic coordinates (640x360) map to actual canvas pixels */
      ctx.save();
      const sx = canvas.width / CANVAS_WIDTH;
      const sy = canvas.height / CANVAS_HEIGHT;
      ctx.scale(sx, sy);

      render(ctx, s);

      ctx.restore();

      if (s.phase === 'dead' && prevState.phase === 'playing') {
        sfxDeath();
        stopBGM();
      }

      if (s.phase === 'dead' && !reportedRef.current) {
        reportedRef.current = true;
        onGameOver(s.score);
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    function onKey(e: KeyboardEvent) {
      /* Don't capture keys when typing in an input/textarea (e.g. chat) */
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space' || e.code === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        handleInput();
      }
    }
    window.addEventListener('keydown', onKey);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('keydown', onKey);
      stopBGM();
    };
  }, [handleInput, onGameOver]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      onClick={handleInput}
      onTouchStart={e => {
        e.preventDefault();
        handleInput();
      }}
      className={`w-full rounded-lg border border-border-default cursor-pointer touch-none ${isFullscreen ? 'max-h-screen' : 'max-w-[640px] aspect-[640/360]'}`}
      style={{ imageRendering: isFullscreen ? 'auto' : 'pixelated' }}
      data-testid="runner-canvas"
    />
  );
}
