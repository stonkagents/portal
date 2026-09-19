/**
 * Purpose: React wrapper for the pseudo-3D racer canvas game.
 *          Handles keyboard/touch input, RAF lifecycle, fullscreen scaling,
 *          sound effects, and game-over callback.
 */
'use client';

import { useRef, useEffect, useCallback } from 'react';
import { createRacerState, updateRacer } from './engine';
import { renderRacer } from './renderer';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';
import { useFullscreenContext } from '@/components/game/FullscreenWrapper';
import { sfxDeath, sfxStart, sfxCollect } from '@/lib/audio/sfx';
import { startRacerBGM, stopBGM } from '@/lib/audio/bgm';

interface RacerGameProps {
  onGameOver: (score: number) => void;
}

export function RacerGame({ onGameOver }: RacerGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(createRacerState());
  const rafRef = useRef(0);
  const reportedRef = useRef(false);
  const keysRef = useRef({ up: false, down: false, left: false, right: false });
  const prevPhaseRef = useRef(stateRef.current.phase);
  const prevLapRef = useRef(0);
  const { isFullscreen, scaleFactor } = useFullscreenContext();

  /* Scale canvas when entering/exiting fullscreen */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = Math.round(CANVAS_WIDTH * scaleFactor);
    canvas.height = Math.round(CANVAS_HEIGHT * scaleFactor);
  }, [scaleFactor]);

  const handleTap = useCallback(() => {
    const s = stateRef.current;
    if (s.phase === 'ready') {
      stateRef.current = { ...s, phase: 'racing' };
      sfxStart();
      startRacerBGM();
      return;
    }
    if (s.phase === 'dead') {
      stateRef.current = createRacerState();
      stateRef.current = { ...stateRef.current, phase: 'racing' };
      reportedRef.current = false;
      prevLapRef.current = 0;
      sfxStart();
      startRacerBGM();
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function tick() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const keys = keysRef.current;
      /* Auto-accelerate unless braking — arcade racer feel */
      const brake = keys.down;
      const accel = !brake;
      let steer = 0;
      if (keys.left) steer = -1;
      if (keys.right) steer = 1;

      prevPhaseRef.current = stateRef.current.phase;
      const prevLap = stateRef.current.lap;
      stateRef.current = updateRacer(stateRef.current, accel, brake, steer);
      const s = stateRef.current;

      /* Sound: lap complete */
      if (s.lap > prevLap && s.phase === 'racing') {
        sfxCollect();
      }

      /* Sound: crashed */
      if (prevPhaseRef.current === 'racing' && s.phase === 'crashed') {
        sfxDeath();
        stopBGM();
      }

      /* Scale context */
      ctx.save();
      const sx = canvas.width / CANVAS_WIDTH;
      const sy = canvas.height / CANVAS_HEIGHT;
      ctx.scale(sx, sy);

      renderRacer(ctx, s);
      ctx.restore();

      if (s.phase === 'dead' && !reportedRef.current) {
        reportedRef.current = true;
        onGameOver(s.score);
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']);

    function onKeyDown(e: KeyboardEvent) {
      /* Don't capture keys when typing in an input/textarea (e.g. chat) */
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      /* Always prevent default for game keys to stop page scrolling */
      if (GAME_KEYS.has(e.code)) e.preventDefault();

      const s = stateRef.current;
      if (s.phase === 'ready' || s.phase === 'dead') {
        handleTap();
        /* Fall through — also register the key so first press isn't lost */
      }

      switch (e.code) {
        case 'ArrowUp':
        case 'KeyW':
          keysRef.current = { ...keysRef.current, up: true };
          break;
        case 'ArrowDown':
        case 'KeyS':
          keysRef.current = { ...keysRef.current, down: true };
          break;
        case 'ArrowLeft':
        case 'KeyA':
          keysRef.current = { ...keysRef.current, left: true };
          break;
        case 'ArrowRight':
        case 'KeyD':
          keysRef.current = { ...keysRef.current, right: true };
          break;
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      switch (e.code) {
        case 'ArrowUp':
        case 'KeyW':
          keysRef.current = { ...keysRef.current, up: false };
          break;
        case 'ArrowDown':
        case 'KeyS':
          keysRef.current = { ...keysRef.current, down: false };
          break;
        case 'ArrowLeft':
        case 'KeyA':
          keysRef.current = { ...keysRef.current, left: false };
          break;
        case 'ArrowRight':
        case 'KeyD':
          keysRef.current = { ...keysRef.current, right: false };
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      stopBGM();
    };
  }, [handleTap, onGameOver]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      onClick={handleTap}
      onTouchStart={e => {
        e.preventDefault();
        handleTap();
      }}
      className={`w-full rounded-lg border border-border-default cursor-pointer touch-none ${isFullscreen ? 'max-h-screen' : 'max-w-[640px] aspect-[640/360]'}`}
      style={{ imageRendering: 'auto' }}
      data-testid="racer-canvas"
    />
  );
}
