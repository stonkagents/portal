/**
 * Purpose: Pseudo-3D racing engine. Segment-based road, perspective projection,
 *          traffic AI, crash state with Agent ejection animation.
 */

import {
  SEGMENT_LENGTH,
  TRACK_LENGTH,
  ROAD_WIDTH,
  CAMERA_HEIGHT,
  CAMERA_DEPTH,
  PLAYER_SPEED_MAX,
  PLAYER_ACCEL,
  PLAYER_BRAKE,
  PLAYER_DECEL,
  PLAYER_STEER_SPEED,
  PLAYER_X_LIMIT,
  CENTRIFUGAL_FORCE,
  OFFROAD_DRAG,
  TRAFFIC_COUNT_MIN,
  TRAFFIC_COUNT_MAX,
  TRAFFIC_SPEED_MIN,
  TRAFFIC_SPEED_MAX,
  TRAFFIC_SPREAD,
  CURVE_EASY,
  CURVE_MEDIUM,
  CURVE_HARD,
  CURVE_INSANE,
  CRASH_DURATION,
  CRASH_AGENT_LAUNCH_VY,
  CRASH_AGENT_GRAVITY,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  COLORS,
} from './constants';
import { setHighScore } from '@/lib/storage';

/* ── Types ── */

export interface Segment {
  index: number;
  p1: WorldPoint;
  p2: WorldPoint;
  curve: number;
  color: { road: string; grass: string; rumble: string };
  hasTree: boolean;
  treeSide: number;
}

export interface WorldPoint {
  world: { x: number; y: number; z: number };
  camera: { x: number; y: number; z: number };
  screen: { x: number; y: number; w: number; scale: number };
}

export interface TrafficCar {
  segment: number;
  offset: number;
  speed: number;
  color: string;
  z: number;
  oncoming: boolean;
}

export interface CrashAgent {
  x: number;
  y: number;
  vy: number;
  rotation: number;
  grounded: boolean;
  timer: number;
}

export interface RoadObstacle {
  segment: number;
  offset: number; /* -1 to 1, lane position */
  kind: 'crab' | 'barrel' | 'cone';
}

export interface RacerState {
  phase: 'ready' | 'racing' | 'crashed' | 'dead';
  segments: Segment[];
  position: number;
  speed: number;
  playerX: number;
  score: number;
  lap: number;
  frame: number;
  steerDir: number;
  traffic: TrafficCar[];
  obstacles: RoadObstacle[];
  crashAgent: CrashAgent | null;
  crashTimer: number;
  trackLength: number;
}

/* ── Projection ── */

function project(p: WorldPoint, cameraX: number, cameraY: number, cameraZ: number) {
  p.camera.x = p.world.x - cameraX;
  p.camera.y = p.world.y - cameraY;
  p.camera.z = p.world.z - cameraZ;

  const depth = CAMERA_DEPTH / p.camera.z;
  p.screen.x = Math.round(CANVAS_WIDTH / 2 + (depth * p.camera.x * CANVAS_WIDTH) / 2);
  p.screen.y = Math.round(CANVAS_HEIGHT / 2 - (depth * p.camera.y * CANVAS_HEIGHT) / 2);
  p.screen.w = Math.round((depth * ROAD_WIDTH * CANVAS_WIDTH) / 2);
  p.screen.scale = depth;
}

/* ── Road Builder ── */

function makePoint(x: number, y: number, z: number): WorldPoint {
  return {
    world: { x, y, z },
    camera: { x: 0, y: 0, z: 0 },
    screen: { x: 0, y: 0, w: 0, scale: 0 },
  };
}

/** Seeded PRNG (mulberry32) — deterministic per track but different each game */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTrack(): Segment[] {
  const rng = mulberry32(Date.now() ^ (Math.random() * 0xffffffff));
  const segs: Segment[] = [];

  /* Curve magnitudes, picked from for variety */
  const magnitudes = [CURVE_EASY, CURVE_MEDIUM, CURVE_HARD, CURVE_INSANE];

  /* Generate curve zones procedurally */
  const curveMap = new Float32Array(TRACK_LENGTH);

  let i = 8; /* first 8 segments are straight (starting line) */
  while (i < TRACK_LENGTH - 5) {
    /* Random straight gap (3-15 segments) */
    const gap = 3 + Math.floor(rng() * 13);
    i += gap;
    if (i >= TRACK_LENGTH - 5) break;

    /* Pick a curve type */
    const roll = rng();
    const dir = rng() > 0.5 ? 1 : -1;

    if (roll < 0.2) {
      /* Chicane — sharp left-right-left (or reverse) in quick succession */
      const intensity = magnitudes[1 + Math.floor(rng() * 3)];
      const len = 4 + Math.floor(rng() * 4);
      for (let j = 0; j < len && i + j < TRACK_LENGTH; j++) {
        curveMap[i + j] = (j % 2 === 0 ? dir : -dir) * intensity * (0.7 + rng() * 0.6);
      }
      i += len;
    } else if (roll < 0.45) {
      /* S-curve — sweeps one way then the other */
      const intensity = magnitudes[1 + Math.floor(rng() * 2)];
      const halfLen = 5 + Math.floor(rng() * 8);
      for (let j = 0; j < halfLen && i + j < TRACK_LENGTH; j++) {
        const ease = Math.sin((j / halfLen) * Math.PI);
        curveMap[i + j] = dir * intensity * ease;
      }
      i += halfLen;
      for (let j = 0; j < halfLen && i + j < TRACK_LENGTH; j++) {
        const ease = Math.sin((j / halfLen) * Math.PI);
        curveMap[i + j] = -dir * intensity * ease * (0.8 + rng() * 0.4);
      }
      i += halfLen;
    } else if (roll < 0.7) {
      /* Sustained curve — long sweeping bend */
      const tier = Math.floor(rng() * magnitudes.length);
      const intensity = magnitudes[tier];
      const len = 8 + Math.floor(rng() * 16);
      const wobble = rng() > 0.6; /* irregularity */
      for (let j = 0; j < len && i + j < TRACK_LENGTH; j++) {
        const ease = Math.sin((j / len) * Math.PI);
        const jitter = wobble ? 0.7 + rng() * 0.6 : 1;
        curveMap[i + j] = dir * intensity * ease * jitter;
      }
      i += len;
    } else if (roll < 0.85) {
      /* Hairpin — short, brutal */
      const intensity = magnitudes[2 + Math.floor(rng() * 2)]; /* hard or insane */
      const len = 3 + Math.floor(rng() * 3);
      for (let j = 0; j < len && i + j < TRACK_LENGTH; j++) {
        curveMap[i + j] = dir * intensity * 1.2;
      }
      i += len;
    } else {
      /* Surprise kink — 1-2 segments of brutal snap */
      const intensity = CURVE_INSANE * (0.9 + rng() * 0.4);
      curveMap[i] = dir * intensity;
      if (i + 1 < TRACK_LENGTH && rng() > 0.4) {
        curveMap[i + 1] = dir * intensity * 0.6;
      }
      i += 2;
    }
  }

  /* Build segments from curve map */
  for (let si = 0; si < TRACK_LENGTH; si++) {
    const dark = si % 2 === 0;
    segs.push({
      index: si,
      p1: makePoint(0, 0, si * SEGMENT_LENGTH),
      p2: makePoint(0, 0, (si + 1) * SEGMENT_LENGTH),
      curve: curveMap[si],
      color: {
        road: dark ? COLORS.roadDark : COLORS.roadLight,
        grass: dark ? COLORS.grassDark : COLORS.grassLight,
        rumble: dark ? COLORS.rumbleDark : COLORS.rumbleLight,
      },
      hasTree: rng() < 0.18,
      treeSide: rng() > 0.5 ? 1 : -1,
    });
  }
  return segs;
}

/* ── Traffic spawner ── */

const TRAFFIC_COLORS = [COLORS.trafficCar1, COLORS.trafficCar2, COLORS.trafficCar3, COLORS.trafficCar4];

function spawnTraffic(): TrafficCar[] {
  const sameDir = TRAFFIC_COUNT_MIN + Math.floor(Math.random() * (TRAFFIC_COUNT_MAX - TRAFFIC_COUNT_MIN));
  const cars: TrafficCar[] = [];

  /* Same-direction traffic (slower than player, dodge to pass) */
  for (let i = 0; i < sameDir; i++) {
    const seg = 20 + Math.floor(Math.random() * (TRACK_LENGTH - 30));
    cars.push({
      segment: seg,
      offset: (Math.random() - 0.5) * TRAFFIC_SPREAD * 2,
      speed: TRAFFIC_SPEED_MIN + Math.random() * (TRAFFIC_SPEED_MAX - TRAFFIC_SPEED_MIN),
      color: TRAFFIC_COLORS[i % TRAFFIC_COLORS.length],
      z: seg * SEGMENT_LENGTH,
      oncoming: false,
    });
  }

  /* Oncoming traffic — evenly spaced ahead so player encounters them regularly */
  const oncomingCount = 8 + Math.floor(Math.random() * 5);
  const spacing = Math.floor(TRACK_LENGTH / oncomingCount);
  for (let i = 0; i < oncomingCount; i++) {
    const seg = 15 + i * spacing + Math.floor(Math.random() * (spacing * 0.5));
    const side = Math.random() > 0.5 ? -1 : 1;
    cars.push({
      segment: seg % TRACK_LENGTH,
      offset: side * (0.3 + Math.random() * 0.4),
      speed: TRAFFIC_SPEED_MIN + Math.random() * (TRAFFIC_SPEED_MAX - TRAFFIC_SPEED_MIN),
      color: TRAFFIC_COLORS[(sameDir + i) % TRAFFIC_COLORS.length],
      z: (seg % TRACK_LENGTH) * SEGMENT_LENGTH,
      oncoming: true,
    });
  }

  return cars;
}

/* ── Road obstacle spawner ── */

const OBSTACLE_KINDS: RoadObstacle['kind'][] = ['crab', 'barrel', 'cone'];

function spawnObstacles(): RoadObstacle[] {
  const obs: RoadObstacle[] = [];
  /* Scatter 15-25 obstacles across the track, avoiding start zone */
  const count = 15 + Math.floor(Math.random() * 11);
  for (let i = 0; i < count; i++) {
    obs.push({
      segment: 15 + Math.floor(Math.random() * (TRACK_LENGTH - 20)),
      offset: (Math.random() - 0.5) * 1.4 /* can be slightly off-center */,
      kind: OBSTACLE_KINDS[Math.floor(Math.random() * OBSTACLE_KINDS.length)],
    });
  }
  return obs;
}

/* ── Factory ── */

export function createRacerState(): RacerState {
  return {
    phase: 'ready',
    segments: buildTrack(),
    position: 0,
    speed: 0,
    playerX: 0,
    score: 0,
    lap: 0,
    frame: 0,
    steerDir: 0,
    traffic: spawnTraffic(),
    obstacles: spawnObstacles(),
    crashAgent: null,
    crashTimer: 0,
    trackLength: TRACK_LENGTH * SEGMENT_LENGTH,
  };
}

/* ── Update ── */

export function updateRacer(state: RacerState, accel: boolean, brake: boolean, steer: number): RacerState {
  if (state.phase === 'ready' || state.phase === 'dead') return state;

  const s = { ...state };
  s.frame++;

  /* Crashed — animate Agent ejection */
  if (s.phase === 'crashed') {
    s.crashTimer--;
    if (s.crashAgent) {
      const b = { ...s.crashAgent };
      b.vy += CRASH_AGENT_GRAVITY;
      b.y += b.vy;
      b.rotation += 0.15;
      if (b.y >= 0 && b.vy > 0) {
        b.y = 0;
        b.vy = 0;
        b.grounded = true;
      }
      b.timer--;
      s.crashAgent = b;
    }
    if (s.crashTimer <= 0) {
      s.phase = 'dead';
      setHighScore('racer', s.score);
    }
    return s;
  }

  /* Speed */
  if (accel) {
    s.speed = Math.min(s.speed + PLAYER_ACCEL, PLAYER_SPEED_MAX);
  } else if (brake) {
    s.speed = Math.max(s.speed - PLAYER_BRAKE, 0);
  } else {
    s.speed = Math.max(s.speed - PLAYER_DECEL, 0);
  }

  /* Position */
  s.position += s.speed;
  while (s.position >= s.trackLength) {
    s.position -= s.trackLength;
    s.lap++;
    s.score += 100;
    /* Re-randomize obstacles every lap — never memorizable */
    s.obstacles = spawnObstacles();
  }

  /* Current segment curve → centrifugal */
  const segIdx = Math.floor(s.position / SEGMENT_LENGTH) % TRACK_LENGTH;
  const seg = s.segments[segIdx];
  const speedRatio = s.speed / PLAYER_SPEED_MAX;

  /* Minimum 50% steer responsiveness even at standstill — Mario Kart feel */
  const steerFactor = 0.5 + 0.5 * speedRatio;
  s.playerX += steer * PLAYER_STEER_SPEED * steerFactor;
  s.playerX -= (seg.curve * CENTRIFUGAL_FORCE * speedRatio * speedRatio) / 1000;
  s.playerX = Math.max(-PLAYER_X_LIMIT, Math.min(PLAYER_X_LIMIT, s.playerX));
  s.steerDir = steer;

  /* Off road — heavy drag */
  if (Math.abs(s.playerX) > 0.8) {
    s.speed = Math.max(s.speed - OFFROAD_DRAG, 0);
  }

  /* Score based on speed */
  if (s.speed > 50) {
    s.score += Math.floor(s.speed / 50);
  }

  /* Update traffic */
  const playerSeg = segIdx;
  s.traffic = s.traffic.map(car => {
    const c = { ...car };
    if (c.oncoming) {
      /* Oncoming traffic moves toward the player */
      c.z -= c.speed;
      if (c.z < 0) c.z += s.trackLength;
      c.segment = Math.floor(c.z / SEGMENT_LENGTH) % TRACK_LENGTH;

      /* Respawn ahead when car passes behind player */
      let behind = playerSeg - c.segment;
      if (behind < 0) behind += TRACK_LENGTH;
      if (behind > 0 && behind < 10) {
        /* Car just passed — reposition 40-70 segments ahead */
        const newSeg = (playerSeg + 40 + Math.floor(Math.random() * 30)) % TRACK_LENGTH;
        c.segment = newSeg;
        c.z = newSeg * SEGMENT_LENGTH;
        c.offset = (Math.random() > 0.5 ? 1 : -1) * (0.3 + Math.random() * 0.4);
      }
    } else {
      c.z += c.speed;
      if (c.z >= s.trackLength) c.z -= s.trackLength;
      c.segment = Math.floor(c.z / SEGMENT_LENGTH) % TRACK_LENGTH;
    }
    return c;
  });

  /* Collision with traffic */
  const playerSegIdx = segIdx;
  let crashed = false;
  for (const car of s.traffic) {
    const dist = Math.abs(car.segment - playerSegIdx);
    if (dist < 2 || dist > TRACK_LENGTH - 2) {
      const dx = Math.abs(car.offset - s.playerX);
      if (dx < 0.4 && s.speed > 30) {
        crashed = true;
        break;
      }
    }
  }

  /* Collision with road obstacles */
  if (!crashed) {
    for (const obs of s.obstacles) {
      const dist = Math.abs(obs.segment - playerSegIdx);
      if (dist < 2 || dist > TRACK_LENGTH - 2) {
        const dx = Math.abs(obs.offset - s.playerX);
        if (dx < 0.35 && s.speed > 20) {
          crashed = true;
          break;
        }
      }
    }
  }

  if (crashed) {
    s.phase = 'crashed';
    s.crashTimer = CRASH_DURATION;
    s.speed = 0;
    s.crashAgent = {
      x: 0,
      y: -20,
      vy: CRASH_AGENT_LAUNCH_VY,
      rotation: 0,
      grounded: false,
      timer: CRASH_DURATION,
    };
  }

  return s;
}

/* ── Projection helper for renderer ── */

export function projectSegments(state: RacerState): Segment[] {
  const baseSegIdx = Math.floor(state.position / SEGMENT_LENGTH);
  const projected: Segment[] = [];
  let x = 0;
  let dx = 0;

  for (let i = 0; i < state.segments.length && i < 80; i++) {
    const idx = (baseSegIdx + i) % TRACK_LENGTH;
    const seg = { ...state.segments[idx] };
    seg.p1 = { ...seg.p1, world: { ...seg.p1.world }, camera: { ...seg.p1.camera }, screen: { ...seg.p1.screen } };
    seg.p2 = { ...seg.p2, world: { ...seg.p2.world }, camera: { ...seg.p2.camera }, screen: { ...seg.p2.screen } };

    seg.p1.world.z = i * SEGMENT_LENGTH - (state.position % SEGMENT_LENGTH);
    seg.p2.world.z = (i + 1) * SEGMENT_LENGTH - (state.position % SEGMENT_LENGTH);
    seg.p1.world.x = x;
    seg.p2.world.x = x + dx;

    project(seg.p1, (state.playerX * ROAD_WIDTH) / 2, CAMERA_HEIGHT, 0);
    project(seg.p2, (state.playerX * ROAD_WIDTH) / 2, CAMERA_HEIGHT, 0);

    x += dx;
    dx += seg.curve;

    if (seg.p1.camera.z <= 0 || seg.p2.screen.y >= seg.p1.screen.y) continue;
    projected.push(seg);
  }

  return projected;
}

export { project as projectPoint };
