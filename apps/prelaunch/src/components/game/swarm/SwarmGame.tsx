/**
 * Purpose: React wrapper for the Swarm connector puzzle canvas game.
 *          Supports fullscreen hi-res scaling via FullscreenWrapper context.
 *          Sound effects on connect, error, round clear, and death.
 */
'use client';

import { useRef, useEffect, useCallback } from 'react';
import { createSwarmState, startRound, updateSwarm, tapNode, hitTestNode } from './engine';
import { renderSwarm } from './renderer';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';
import { useFullscreenContext } from '@/components/game/FullscreenWrapper';
import { sfxConnect, sfxError, sfxVictory, sfxDeath, sfxStart } from '@/lib/audio/sfx';
import { startSwarmBGM, stopBGM } from '@/lib/audio/bgm';

interface SwarmGameProps {
  onGameOver: (score: number) => void;
}

export function SwarmGame({ onGameOver }: SwarmGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(createSwarmState());
  const rafRef = useRef(0);
  const lastTimeRef = useRef(0);
  const reportedRef = useRef(false);
  const frameRef = useRef(0);
  const { isFullscreen, scaleFactor } = useFullscreenContext();

  /* Scale canvas resolution when entering/exiting fullscreen */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = Math.round(CANVAS_WIDTH * scaleFactor);
    canvas.height = Math.round(CANVAS_HEIGHT * scaleFactor);
  }, [scaleFactor]);

  const handleTap = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    /* Map screen coords to game coords (always 640x400 logical) */
    const rect = canvas.getBoundingClientRect();
    const cx = (clientX - rect.left) * (CANVAS_WIDTH / rect.width);
    const cy = (clientY - rect.top) * (CANVAS_HEIGHT / rect.height);

    const s = stateRef.current;

    if (s.phase === 'ready') {
      stateRef.current = startRound(stateRef.current);
      sfxStart();
      startSwarmBGM();
      return;
    }

    if (s.phase === 'dead') {
      stateRef.current = createSwarmState();
      stateRef.current = startRound(stateRef.current);
      reportedRef.current = false;
      sfxStart();
      startSwarmBGM();
      return;
    }

    if (s.phase === 'round-clear') {
      stateRef.current = startRound(stateRef.current);
      sfxStart();
      return;
    }

    const nodeId = hitTestNode(s, cx, cy);
    if (nodeId !== null) {
      const prevConnections = s.playerConnections.length;
      const prevTimeLeft = s.timeLeft;
      stateRef.current = tapNode(s, nodeId);

      /* Detect what happened and play sound */
      if (stateRef.current.playerConnections.length > prevConnections) {
        sfxConnect();
      } else if (stateRef.current.timeLeft < prevTimeLeft - 1) {
        sfxError();
      }
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function tick(now: number) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dt = lastTimeRef.current ? now - lastTimeRef.current : 16;
      lastTimeRef.current = now;
      frameRef.current++;

      const prevPhase = stateRef.current.phase;
      stateRef.current = updateSwarm(stateRef.current, dt);

      /* Sound: round cleared */
      if (prevPhase === 'playing' && stateRef.current.phase === 'round-clear') {
        sfxVictory();
      }

      /* Sound: died */
      if (prevPhase === 'playing' && stateRef.current.phase === 'dead') {
        sfxDeath();
        stopBGM();
      }

      /* Scale context so game logic coordinates (640x400) map to actual canvas pixels */
      ctx.save();
      const sx = canvas.width / CANVAS_WIDTH;
      const sy = canvas.height / CANVAS_HEIGHT;
      ctx.scale(sx, sy);

      renderSwarm(ctx, stateRef.current, frameRef.current);

      ctx.restore();

      if (stateRef.current.phase === 'dead' && !reportedRef.current) {
        reportedRef.current = true;
        onGameOver(stateRef.current.score);
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      stopBGM();
    };
  }, [onGameOver]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      onClick={e => handleTap(e.clientX, e.clientY)}
      onTouchStart={e => {
        e.preventDefault();
        const touch = e.touches[0];
        handleTap(touch.clientX, touch.clientY);
      }}
      className={`w-full rounded-lg border border-border-default cursor-pointer touch-none ${isFullscreen ? 'max-h-screen' : 'max-w-[640px] aspect-[640/400]'}`}
      style={{ imageRendering: 'auto' }}
      data-testid="swarm-canvas"
    />
  );
}
