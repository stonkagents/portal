/**
 * Purpose: Game engine — physics, collision detection, spawning, score tracking.
 *          Adaptive difficulty: easy first few plays, progressively harder, but
 *          always beatable by a skilled player (30-40 plays in).
 */

import {
  CANVAS_WIDTH,
  GRAVITY,
  JUMP_FORCE,
  GROUND_Y,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_X,
  OBSTACLE_WIDTH,
  OBSTACLE_MIN_HEIGHT,
  OBSTACLE_MAX_HEIGHT,
  OBSTACLE_GAP_MIN,
  OBSTACLE_GAP_MAX,
  CLUSTER_CHANCE,
  CLUSTER_GAP,
  CLUSTER_MAX_SIZE,
  CLUSTER_MAX_OBSTACLE_HEIGHT,
  WIDE_OBSTACLE_CHANCE,
  WIDE_OBSTACLE_WIDTH,
  COLLECTIBLE_SIZE,
  COLLECTIBLE_SPAWN_CHANCE,
  BASE_SPEED,
  MAX_SPEED,
  SPEED_INCREMENT,
  COLORS,
} from './constants';
import { setHighScore, incrementPlayCount } from '@/lib/storage';

/* ── Types ── */

export interface Player {
  x: number;
  y: number;
  vy: number;
  width: number;
  height: number;
  grounded: boolean;
}

export interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Collectible {
  x: number;
  y: number;
  size: number;
  collected: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export interface GameState {
  player: Player;
  obstacles: Obstacle[];
  collectibles: Collectible[];
  particles: Particle[];
  score: number;
  distance: number;
  speed: number;
  frame: number;
  scrollOffset: number;
  phase: 'ready' | 'playing' | 'dead';
  nextObstacleX: number;
  difficulty: number;
  clusterRemaining: number;
}

/* ── Difficulty curve ── */

/**
 * Returns 0-1 difficulty factor based on play count.
 * Plays 1-3: 0.0-0.15 (easy, learning)
 * Plays 4-10: 0.15-0.5 (ramping)
 * Plays 11-25: 0.5-0.85 (challenging)
 * Plays 26+: 0.85-1.0 (hard but beatable)
 */
function calcDifficulty(playCount: number): number {
  if (playCount <= 3) return playCount * 0.05;
  if (playCount <= 10) return 0.15 + (playCount - 3) * 0.05;
  if (playCount <= 25) return 0.5 + (playCount - 10) * 0.023;
  return Math.min(0.85 + (playCount - 25) * 0.005, 1.0);
}

/* ── Factory ── */

export function createInitialState(): GameState {
  const playCount = incrementPlayCount();
  const difficulty = calcDifficulty(playCount);

  return {
    player: {
      x: PLAYER_X,
      y: GROUND_Y - PLAYER_HEIGHT,
      vy: 0,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
      grounded: true,
    },
    obstacles: [],
    collectibles: [],
    particles: [],
    score: 0,
    distance: 0,
    speed: BASE_SPEED,
    frame: 0,
    scrollOffset: 0,
    phase: 'ready',
    nextObstacleX: CANVAS_WIDTH + 100,
    difficulty,
    clusterRemaining: 0,
  };
}

/* ── Core update loop ── */

export function updateState(state: GameState): GameState {
  if (state.phase !== 'playing') return state;

  const s = { ...state };
  const d = s.difficulty;
  s.frame++;

  /* Speed scales with difficulty — veterans face faster speeds sooner */
  const speedBoost = d * 0.003;
  s.speed = Math.min(s.speed + SPEED_INCREMENT + speedBoost, MAX_SPEED);
  s.distance += s.speed;
  s.scrollOffset += s.speed;

  /* Score: 1 point per ~60px traveled */
  s.score = Math.floor(s.distance / 60);

  /* ── Player physics ── */
  const p = { ...s.player };
  p.vy += GRAVITY;
  p.y += p.vy;

  if (p.y >= GROUND_Y - p.height) {
    p.y = GROUND_Y - p.height;
    p.vy = 0;
    p.grounded = true;
  } else {
    p.grounded = false;
  }
  s.player = p;

  /* ── Move obstacles ── */
  s.obstacles = s.obstacles.map(o => ({ ...o, x: o.x - s.speed })).filter(o => o.x + o.width > -50);

  /* ── Spawn obstacles (adaptive) ── */
  s.nextObstacleX -= s.speed;

  if (s.nextObstacleX <= CANVAS_WIDTH) {
    const inCluster = s.clusterRemaining > 0;

    /* Cluster obstacles are shorter — always clearable with a well-timed jump */
    const maxH = inCluster ? CLUSTER_MAX_OBSTACLE_HEIGHT : OBSTACLE_MAX_HEIGHT;
    const heightRange = maxH - OBSTACLE_MIN_HEIGHT;
    const h = OBSTACLE_MIN_HEIGHT + Math.random() * heightRange;

    /* Wide obstacles only outside clusters — never combine cluster + wide */
    const isWide = !inCluster && Math.random() < WIDE_OBSTACLE_CHANCE * (0.5 + d);
    const w = isWide ? WIDE_OBSTACLE_WIDTH : OBSTACLE_WIDTH;

    s.obstacles.push({
      x: CANVAS_WIDTH + 20,
      y: GROUND_Y - h,
      width: w,
      height: h,
    });

    /* Maybe spawn a collectible above */
    if (Math.random() < COLLECTIBLE_SPAWN_CHANCE) {
      s.collectibles.push({
        x: CANVAS_WIDTH + 20 + w / 2 - COLLECTIBLE_SIZE / 2,
        y: GROUND_Y - h - 50 - Math.random() * 40,
        size: COLLECTIBLE_SIZE,
        collected: false,
      });
    }

    /* Decide next gap — always ensure minimum jumpable distance.
       At max speed (12), player needs ~120px to land and re-jump.
       We use CLUSTER_GAP (130px) as the minimum "tight but fair" gap. */
    const minJumpableGap = CLUSTER_GAP;

    if (inCluster) {
      /* In a cluster: controlled gap, always jumpable */
      s.clusterRemaining--;
      s.nextObstacleX = CANVAS_WIDTH + minJumpableGap + Math.random() * 40;
    } else if (Math.random() < CLUSTER_CHANCE * d && s.score > 15) {
      /* Start a new cluster (only after some distance, scales with difficulty) */
      const clusterSize = 1 + Math.floor(Math.random() * CLUSTER_MAX_SIZE);
      s.clusterRemaining = clusterSize;
      s.nextObstacleX = CANVAS_WIDTH + minJumpableGap + Math.random() * 30;
    } else {
      /* Normal gap — tighter at higher difficulty, with randomness */
      const gapRange = OBSTACLE_GAP_MAX - OBSTACLE_GAP_MIN;
      const gapShrink = d * 0.3;
      const baseGap = OBSTACLE_GAP_MIN + gapRange * (1 - gapShrink);
      const jitter = (Math.random() - 0.3) * gapRange * 0.4;
      s.nextObstacleX = CANVAS_WIDTH + Math.max(baseGap + jitter, minJumpableGap);
    }
  }

  /* ── Move collectibles ── */
  s.collectibles = s.collectibles.map(c => ({ ...c, x: c.x - s.speed })).filter(c => c.x + c.size > -50 && !c.collected);

  /* ── Collision: player vs obstacles ── */
  for (const o of s.obstacles) {
    if (aabb(p.x, p.y, p.width, p.height, o.x, o.y, o.width, o.height)) {
      s.phase = 'dead';
      s.particles = spawnDeathParticles(p.x + p.width / 2, p.y + p.height / 2);
      setHighScore('runner', s.score);
      return s;
    }
  }

  /* ── Collision: player vs collectibles ── */
  s.collectibles = s.collectibles.map(c => {
    if (!c.collected && aabb(p.x, p.y, p.width, p.height, c.x, c.y, c.size, c.size)) {
      s.score += 5;
      s.particles = [...s.particles, ...spawnCollectParticles(c.x + c.size / 2, c.y + c.size / 2)];
      return { ...c, collected: true };
    }
    return c;
  });

  /* ── Update particles ── */
  s.particles = s.particles
    .map(pt => ({
      ...pt,
      x: pt.x + pt.vx,
      y: pt.y + pt.vy,
      vy: pt.vy + 0.1,
      life: pt.life - 0.02,
    }))
    .filter(pt => pt.life > 0);

  return s;
}

/* ── Actions ── */

export function jump(state: GameState): GameState {
  if (state.phase === 'ready') {
    return { ...state, phase: 'playing' };
  }
  if (state.phase === 'playing' && state.player.grounded) {
    return {
      ...state,
      player: { ...state.player, vy: JUMP_FORCE, grounded: false },
    };
  }
  return state;
}

/* ── AABB collision ── */

function aabb(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean {
  const pad = 4;
  return ax + pad < bx + bw - pad && ax + aw - pad > bx + pad && ay + pad < by + bh - pad && ay + ah - pad > by + pad;
}

/* ── Particle spawners ── */

function spawnDeathParticles(cx: number, cy: number): Particle[] {
  const pts: Particle[] = [];
  for (let i = 0; i < 20; i++) {
    const angle = (Math.PI * 2 * i) / 20;
    const speed = 2 + Math.random() * 3;
    pts.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: 1,
      color: COLORS.particles[Math.floor(Math.random() * COLORS.particles.length)],
    });
  }
  return pts;
}

function spawnCollectParticles(cx: number, cy: number): Particle[] {
  const pts: Particle[] = [];
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 * i) / 8;
    pts.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * 1.5,
      vy: Math.sin(angle) * 1.5 - 1,
      life: 0.8,
      color: COLORS.collectible,
    });
  }
  return pts;
}
