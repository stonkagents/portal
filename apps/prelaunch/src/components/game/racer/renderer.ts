/**
 * Purpose: Canvas renderer for the pseudo-3D racer. Draws road segments,
 *          traffic, player car with thug Agent driver, HUD, and overlays.
 */

import type { RacerState, Segment, TrafficCar, RoadObstacle } from './engine';
import { projectSegments } from './engine';
import { CANVAS_WIDTH, CANVAS_HEIGHT, COLORS, SEGMENT_LENGTH, TRACK_LENGTH, PLAYER_SPEED_MAX } from './constants';
import { drawThugAgentDriver, drawCrashAgent, drawTrafficCarSprite } from './sprites';

export function renderRacer(ctx: CanvasRenderingContext2D, state: RacerState) {
  /* Sky gradient */
  ctx.fillStyle = COLORS.sky;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  /* Horizon glow */
  const horizonY = CANVAS_HEIGHT / 2 - 20;
  const grad = ctx.createLinearGradient(0, horizonY - 40, 0, horizonY + 20);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(0.5, 'rgba(0, 255, 0, 0.03)');
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.fillRect(0, horizonY - 40, CANVAS_WIDTH, 60);

  /* Stars */
  drawStars(ctx, state.frame);

  /* Project and draw road */
  const projected = projectSegments(state);

  /* Draw back to front */
  for (let i = projected.length - 1; i >= 0; i--) {
    const seg = projected[i];
    drawSegment(ctx, seg);
  }

  /* Draw traffic (back to front) */
  drawTraffic(ctx, state, projected);

  /* Draw road obstacles (back to front) */
  drawObstacles(ctx, state, projected);

  /* Player car */
  if (state.phase !== 'crashed' && state.phase !== 'dead') {
    drawPlayerCar(ctx, state);
  }

  /* Crash animation */
  if (state.crashAgent) {
    drawCrashAgent(ctx, state.crashAgent);
  }

  /* HUD */
  drawHUD(ctx, state);

  /* Overlays */
  if (state.phase === 'ready') {
    drawReadyOverlay(ctx);
  } else if (state.phase === 'dead') {
    drawDeadOverlay(ctx, state.score);
  }
}

function drawStars(ctx: CanvasRenderingContext2D, frame: number) {
  ctx.fillStyle = COLORS.accent;
  for (let i = 0; i < 20; i++) {
    const seed = i * 3571;
    const x = (seed * 13) % CANVAS_WIDTH;
    const y = (seed * 7) % (CANVAS_HEIGHT / 2 - 30);
    const twinkle = Math.sin(frame * 0.015 + i) * 0.5 + 0.5;
    ctx.globalAlpha = twinkle * 0.2;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.globalAlpha = 1;
}

function drawSegment(ctx: CanvasRenderingContext2D, seg: Segment) {
  const p1 = seg.p1.screen;
  const p2 = seg.p2.screen;

  /* Grass */
  ctx.fillStyle = seg.color.grass;
  ctx.fillRect(0, p2.y, CANVAS_WIDTH, p1.y - p2.y);

  /* Road */
  drawTrapezoid(ctx, p1.x, p1.y, p1.w, p2.x, p2.y, p2.w, seg.color.road);

  /* Rumble strips */
  const rumbleW1 = p1.w * 1.15;
  const rumbleW2 = p2.w * 1.15;
  drawTrapezoid(ctx, p1.x, p1.y, rumbleW1, p2.x, p2.y, rumbleW2, seg.color.rumble);
  drawTrapezoid(ctx, p1.x, p1.y, p1.w, p2.x, p2.y, p2.w, seg.color.road);

  /* Lane dashes */
  if (seg.index % 4 < 2) {
    const dw1 = p1.w * 0.01;
    const dw2 = p2.w * 0.01;
    ctx.fillStyle = COLORS.laneDash;
    drawTrapezoid(ctx, p1.x - p1.w * 0.25, p1.y, dw1, p2.x - p2.w * 0.25, p2.y, dw2, COLORS.laneDash);
    drawTrapezoid(ctx, p1.x + p1.w * 0.25, p1.y, dw1, p2.x + p2.w * 0.25, p2.y, dw2, COLORS.laneDash);
  }

  /* Trees */
  if (seg.hasTree && p1.w > 5) {
    const treeX = seg.treeSide > 0 ? p1.x + p1.w * 1.5 : p1.x - p1.w * 1.5;
    const treeH = p1.w * 0.4;
    if (treeH > 2) {
      ctx.fillStyle = '#0a2a0a';
      ctx.fillRect(treeX - 2, p1.y - treeH, 4, treeH);
      ctx.fillStyle = '#00FF00';
      ctx.globalAlpha = 0.15;
      ctx.beginPath();
      ctx.arc(treeX, p1.y - treeH, treeH * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

function drawTrapezoid(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  w1: number,
  x2: number,
  y2: number,
  w2: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1 - w1, y1);
  ctx.lineTo(x1 + w1, y1);
  ctx.lineTo(x2 + w2, y2);
  ctx.lineTo(x2 - w2, y2);
  ctx.closePath();
  ctx.fill();
}

function drawTraffic(ctx: CanvasRenderingContext2D, state: RacerState, projected: Segment[]) {
  const baseSegIdx = Math.floor(state.position / SEGMENT_LENGTH);

  /* Collect visible traffic with depth */
  const visible: Array<{ car: TrafficCar; screenX: number; screenY: number; scale: number }> = [];

  for (const car of state.traffic) {
    let relSeg = car.segment - baseSegIdx;
    if (relSeg < 0) relSeg += TRACK_LENGTH;
    if (relSeg < 0 || relSeg >= projected.length) continue;

    const seg = projected[relSeg];
    if (!seg) continue;

    const p = seg.p1.screen;
    if (p.w < 2) continue;

    const screenX = p.x + car.offset * p.w;
    visible.push({ car, screenX, screenY: p.y, scale: p.scale });
  }

  /* Sort by depth (farthest first) */
  visible.sort((a, b) => a.scale - b.scale);

  for (const v of visible) {
    drawTrafficCarSprite(ctx, v.screenX, v.screenY, v.scale * 800, v.car.color, v.car.oncoming);
  }
}

function drawObstacles(ctx: CanvasRenderingContext2D, state: RacerState, projected: Segment[]) {
  const baseSegIdx = Math.floor(state.position / SEGMENT_LENGTH);

  const visible: Array<{ obs: RoadObstacle; screenX: number; screenY: number; scale: number }> = [];

  for (const obs of state.obstacles) {
    let relSeg = obs.segment - baseSegIdx;
    if (relSeg < 0) relSeg += TRACK_LENGTH;
    if (relSeg < 0 || relSeg >= projected.length) continue;

    const seg = projected[relSeg];
    if (!seg) continue;

    const p = seg.p1.screen;
    if (p.w < 2) continue;

    const screenX = p.x + obs.offset * p.w;
    visible.push({ obs, screenX, screenY: p.y, scale: p.scale });
  }

  visible.sort((a, b) => a.scale - b.scale);

  for (const v of visible) {
    const sz = v.scale * 600;
    if (sz < 2) continue;
    if (v.obs.kind === 'crab') {
      drawCrabObstacle(ctx, v.screenX, v.screenY, sz, state.frame);
    } else if (v.obs.kind === 'barrel') {
      drawBarrelObstacle(ctx, v.screenX, v.screenY, sz);
    } else {
      drawConeObstacle(ctx, v.screenX, v.screenY, sz);
    }
  }
}

function drawCrabObstacle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, frame: number) {
  const s = Math.max(size, 4);
  const wobble = Math.sin(frame * 0.1) * 2;
  ctx.save();
  ctx.translate(x + wobble, y);
  /* Body */
  ctx.fillStyle = COLORS.agentBody;
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.4, s * 0.5, s * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  /* Claws */
  const clawAngle = Math.sin(frame * 0.15) * 0.3;
  ctx.strokeStyle = COLORS.agentBody;
  ctx.lineWidth = Math.max(s * 0.12, 1);
  ctx.lineCap = 'round';
  /* Left claw */
  ctx.beginPath();
  ctx.moveTo(-s * 0.45, -s * 0.4);
  ctx.lineTo(-s * 0.7 - Math.cos(clawAngle) * s * 0.15, -s * 0.7);
  ctx.lineTo(-s * 0.55, -s * 0.85);
  ctx.stroke();
  /* Right claw */
  ctx.beginPath();
  ctx.moveTo(s * 0.45, -s * 0.4);
  ctx.lineTo(s * 0.7 + Math.cos(clawAngle) * s * 0.15, -s * 0.7);
  ctx.lineTo(s * 0.55, -s * 0.85);
  ctx.stroke();
  /* Eyes */
  ctx.fillStyle = COLORS.agentGlasses;
  ctx.fillRect(-s * 0.2, -s * 0.6, s * 0.15, s * 0.08);
  ctx.fillRect(s * 0.05, -s * 0.6, s * 0.15, s * 0.08);
  ctx.restore();
}

function drawBarrelObstacle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const s = Math.max(size, 4);
  ctx.save();
  ctx.translate(x, y);
  /* Barrel body */
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(-s * 0.3, -s * 0.7, s * 0.6, s * 0.7);
  /* Green stripe */
  ctx.fillStyle = COLORS.accent;
  ctx.globalAlpha = 0.6;
  ctx.fillRect(-s * 0.3, -s * 0.45, s * 0.6, s * 0.12);
  ctx.globalAlpha = 1;
  /* Top rim */
  ctx.fillStyle = '#654321';
  ctx.fillRect(-s * 0.33, -s * 0.72, s * 0.66, s * 0.06);
  ctx.restore();
}

function drawConeObstacle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const s = Math.max(size, 4);
  ctx.save();
  ctx.translate(x, y);
  /* Cone body */
  ctx.fillStyle = '#ff6b00';
  ctx.beginPath();
  ctx.moveTo(-s * 0.25, 0);
  ctx.lineTo(0, -s * 0.7);
  ctx.lineTo(s * 0.25, 0);
  ctx.closePath();
  ctx.fill();
  /* White stripe */
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.7;
  ctx.fillRect(-s * 0.12, -s * 0.4, s * 0.24, s * 0.1);
  ctx.globalAlpha = 1;
  /* Base */
  ctx.fillStyle = '#cc5500';
  ctx.fillRect(-s * 0.3, -s * 0.04, s * 0.6, s * 0.06);
  ctx.restore();
}

function drawPlayerCar(ctx: CanvasRenderingContext2D, state: RacerState) {
  const carW = 60;
  const carH = 35;
  const carX = CANVAS_WIDTH / 2;
  const carY = CANVAS_HEIGHT - 70;
  const tilt = -state.steerDir * 3;

  ctx.save();
  ctx.translate(carX, carY);
  ctx.rotate((tilt * Math.PI) / 180);

  /* Car body */
  ctx.fillStyle = COLORS.playerCar;
  /* Main body */
  ctx.beginPath();
  ctx.moveTo(-carW / 2, 0);
  ctx.lineTo(-carW / 2 + 8, -carH);
  ctx.lineTo(carW / 2 - 8, -carH);
  ctx.lineTo(carW / 2, 0);
  ctx.closePath();
  ctx.fill();

  /* Windshield */
  ctx.fillStyle = 'rgba(0, 255, 0, 0.15)';
  ctx.fillRect(-carW / 4, -carH + 2, carW / 2, carH * 0.3);

  /* Green trim/stripe */
  ctx.fillStyle = COLORS.playerTrim;
  ctx.fillRect(-carW / 2, -2, carW, 4);

  /* Wheels */
  ctx.fillStyle = '#333';
  ctx.fillRect(-carW / 2 - 4, -5, 6, 10);
  ctx.fillRect(carW / 2 - 2, -5, 6, 10);

  /* Thug Agent driver */
  drawThugAgentDriver(ctx, 0, -carH + 4, state.frame);

  ctx.restore();

  /* Speed lines when fast */
  if (state.speed > 100) {
    const intensity = (state.speed - 100) / (PLAYER_SPEED_MAX - 100);
    ctx.strokeStyle = COLORS.accent;
    ctx.globalAlpha = intensity * 0.3;
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const lx = carX + (Math.random() - 0.5) * 100;
      const ly = carY + Math.random() * 20;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx, ly + 10 + Math.random() * 15);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

function drawHUD(ctx: CanvasRenderingContext2D, state: RacerState) {
  if (state.phase === 'ready') return;

  /* Score */
  ctx.fillStyle = COLORS.hudBg;
  ctx.fillRect(CANVAS_WIDTH - 140, 8, 132, 32);
  ctx.fillStyle = COLORS.accent;
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`SCORE: ${state.score}`, CANVAS_WIDTH - 18, 30);

  /* Speed bar */
  const barW = 100;
  const barH = 8;
  const barX = 12;
  const barY = 12;
  const speedFrac = state.speed / PLAYER_SPEED_MAX;

  ctx.fillStyle = COLORS.hudBg;
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = speedFrac > 0.8 ? COLORS.speedBarHot : COLORS.speedBar;
  ctx.fillRect(barX, barY, barW * speedFrac, barH);

  /* Speed text */
  ctx.fillStyle = COLORS.text;
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`${Math.floor(state.speed)} MPH`, barX, barY + barH + 12);

  /* Lap */
  ctx.fillText(`LAP ${state.lap + 1}`, barX, barY + barH + 24);
}

function drawReadyOverlay(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = 'rgba(8, 10, 15, 0.5)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.fillStyle = COLORS.accent;
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('AGENT RACING', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40);

  ctx.fillStyle = COLORS.text;
  ctx.font = '13px monospace';
  ctx.fillText('\u2190 \u2192 or A/D to steer', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 5);
  ctx.fillText('\u2193 or S to brake', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 15);
  ctx.fillText('Dodge traffic. Don\u2019t crash.', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 35);

  ctx.fillStyle = COLORS.accent;
  ctx.font = 'bold 15px monospace';
  ctx.fillText('[ TAP TO RACE ]', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 70);
}

function drawDeadOverlay(ctx: CanvasRenderingContext2D, score: number) {
  ctx.fillStyle = 'rgba(8, 10, 15, 0.7)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.fillStyle = COLORS.playerCar;
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('WRECKED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30);

  ctx.fillStyle = COLORS.text;
  ctx.font = '14px monospace';
  ctx.fillText(`Score: ${score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 5);

  ctx.fillStyle = COLORS.accent;
  ctx.font = 'bold 13px monospace';
  ctx.fillText('[ TAP TO RACE AGAIN ]', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40);
}
