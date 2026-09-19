/**
 * Purpose: Canvas renderer for the Swarm connector puzzle.
 */

import type { SwarmState } from './engine';
import { CANVAS_WIDTH, CANVAS_HEIGHT, NODE_RADIUS, ROUND_TIME_MS, TIME_BONUS_PER_ROUND, COLORS } from './constants';

export function renderSwarm(ctx: CanvasRenderingContext2D, state: SwarmState, frame: number) {
  /* Clear */
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  if (state.phase === 'ready') {
    drawReadyOverlay(ctx);
    return;
  }

  /* Target connections (ghosted) */
  ctx.strokeStyle = COLORS.linePreview;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  for (const conn of state.targetConnections) {
    const a = state.nodes[conn.a];
    const b = state.nodes[conn.b];
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  /* Player connections (solid, glowing) */
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 2;
  ctx.shadowColor = COLORS.nodeGlow;
  ctx.shadowBlur = 8;
  for (const conn of state.playerConnections) {
    const a = state.nodes[conn.a];
    const b = state.nodes[conn.b];
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  /* Nodes — draw as mini Claw mascots */
  for (const node of state.nodes) {
    const isSelected = state.selectedNode === node.id;
    const pulse = isSelected ? 1 + Math.sin(frame * 0.15) * 0.2 : 1;
    const r = NODE_RADIUS * pulse;

    /* Glow for connected */
    if (node.connected) {
      ctx.save();
      ctx.shadowColor = COLORS.nodeGlow;
      ctx.shadowBlur = 16;
      ctx.fillStyle = COLORS.nodeGlow;
      ctx.beginPath();
      ctx.arc(node.x, node.y, r * 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawMiniClaw(ctx, node.x, node.y, r, node.connected, isSelected);

    /* Node ID below */
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${node.id}`, node.x, node.y + r + 3);
  }

  /* Chat bubbles — onboarding hints from nodes */
  if (state.phase === 'playing') {
    drawChatBubbles(ctx, state, frame);
  }

  /* HUD */
  drawSwarmHUD(ctx, state);

  /* Dead overlay */
  if (state.phase === 'dead') {
    drawDeadOverlay(ctx, state.score);
  }

  /* Round clear */
  if (state.phase === 'round-clear') {
    drawRoundClear(ctx, state.round, state.score);
  }
}

/** Draw a simplified Claw mascot head at (cx, cy) with radius r.
 *  Red body + green pixel glasses. Connected nodes get brighter. */
function drawMiniClaw(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, connected: boolean, selected: boolean) {
  const bodyColor = connected ? '#FF6B6B' : selected ? '#FF4D4D' : '#CC3333';
  const glassesColor = connected ? '#33FF33' : '#00FF00';

  ctx.save();
  ctx.translate(cx, cy);

  /* Body (circle) */
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  /* Left claw (tiny) */
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.ellipse(-r * 0.9, -r * 0.2, r * 0.35, r * 0.2, -0.4, 0, Math.PI * 2);
  ctx.fill();

  /* Right claw (tiny) */
  ctx.beginPath();
  ctx.ellipse(r * 0.9, -r * 0.2, r * 0.35, r * 0.2, 0.4, 0, Math.PI * 2);
  ctx.fill();

  /* Pixel glasses bar */
  const gw = r * 1.4;
  const gh = r * 0.25;
  ctx.fillStyle = glassesColor;
  ctx.fillRect(-gw / 2, -r * 0.2, gw, gh);

  /* Left lens */
  ctx.fillRect(-gw / 2, -r * 0.2 + gh, gw * 0.35, gh * 1.5);
  /* Right lens */
  ctx.fillRect(gw / 2 - gw * 0.35, -r * 0.2 + gh, gw * 0.35, gh * 1.5);

  /* Dark pupils */
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(-gw / 4, -r * 0.2 + gh + gh * 0.3, gw * 0.15, gh * 0.8);
  ctx.fillRect(gw / 4 - gw * 0.08, -r * 0.2 + gh + gh * 0.3, gw * 0.15, gh * 0.8);

  ctx.restore();
}

function drawSwarmHUD(ctx: CanvasRenderingContext2D, state: SwarmState) {
  if (state.phase !== 'playing') return;

  /* Timer bar */
  const maxTime = ROUND_TIME_MS + (state.round - 1) * TIME_BONUS_PER_ROUND;
  const frac = Math.max(state.timeLeft / maxTime, 0);
  const barW = CANVAS_WIDTH - 40;

  ctx.fillStyle = COLORS.timerBg;
  ctx.fillRect(20, CANVAS_HEIGHT - 28, barW, 12);
  ctx.fillStyle = frac < 0.25 ? COLORS.timerFill : COLORS.accent;
  ctx.fillRect(20, CANVAS_HEIGHT - 28, barW * frac, 12);

  /* Score */
  ctx.fillStyle = COLORS.hudBg;
  ctx.fillRect(CANVAS_WIDTH - 140, 8, 132, 32);
  ctx.fillStyle = COLORS.accent;
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`SCORE: ${state.score}`, CANVAS_WIDTH - 18, 30);

  /* Round */
  ctx.fillStyle = COLORS.text;
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`ROUND ${state.round}`, 12, 22);

  /* Connection progress */
  ctx.fillText(`${state.playerConnections.length}/${state.targetConnections.length} synced`, 12, 38);
}

function drawReadyOverlay(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = 'rgba(8, 10, 15, 0.5)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.fillStyle = COLORS.accent;
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('SYNC THE SWARM', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30);

  ctx.fillStyle = COLORS.text;
  ctx.font = '13px monospace';
  ctx.fillText('Tap two nodes to connect them', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 5);
  ctx.fillText('Match the dotted pattern before time runs out', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 25);

  ctx.fillStyle = COLORS.accent;
  ctx.font = 'bold 15px monospace';
  ctx.fillText('[ TAP TO START ]', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 60);
}

function drawDeadOverlay(ctx: CanvasRenderingContext2D, score: number) {
  ctx.fillStyle = 'rgba(8, 10, 15, 0.7)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.fillStyle = COLORS.timerFill;
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('DESYNC', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30);

  ctx.fillStyle = COLORS.text;
  ctx.font = '14px monospace';
  ctx.fillText(`Score: ${score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 5);

  ctx.fillStyle = COLORS.accent;
  ctx.font = 'bold 13px monospace';
  ctx.fillText('[ TAP TO RETRY ]', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40);
}

function drawRoundClear(ctx: CanvasRenderingContext2D, round: number, score: number) {
  ctx.fillStyle = 'rgba(8, 10, 15, 0.6)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.fillStyle = COLORS.accent;
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`ROUND ${round} SYNCED!`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);

  ctx.fillStyle = COLORS.text;
  ctx.font = '14px monospace';
  ctx.fillText(`Score: ${score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 10);

  ctx.fillStyle = COLORS.accent;
  ctx.font = 'bold 13px monospace';
  ctx.fillText('[ TAP FOR NEXT ROUND ]', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 45);
}

/* ── Chat bubbles — floating hints from nodes ── */

const BUBBLE_HINTS = [
  'sync me, agent!',
  'tap two nodes!',
  'match the pattern!',
  'connect us!',
  'we need links!',
  'hurry up, agent!',
  'wrong link = time penalty!',
  'every agent needs a network',
  'the swarm awaits...',
  'link the dotted lines!',
];

function drawChatBubbles(ctx: CanvasRenderingContext2D, state: SwarmState, frame: number) {
  /* Show a bubble from one node at a time, cycling every ~3 seconds (180 frames) */
  const cycleLen = 180;
  const bubbleIdx = Math.floor(frame / cycleLen);
  const progress = (frame % cycleLen) / cycleLen;

  /* Only show during the first 70% of cycle (fade in/out) */
  if (progress > 0.7) return;

  const nodeIdx = bubbleIdx % state.nodes.length;
  const node = state.nodes[nodeIdx];
  if (!node) return;

  /* Pick a hint based on round + cycle */
  const hint = BUBBLE_HINTS[(bubbleIdx + state.round) % BUBBLE_HINTS.length];

  /* Fade: quick in, hold, quick out */
  let alpha: number;
  if (progress < 0.1) alpha = progress / 0.1;
  else if (progress > 0.55) alpha = (0.7 - progress) / 0.15;
  else alpha = 1;

  /* Float upward slightly */
  const floatY = -8 - progress * 12;

  ctx.save();
  ctx.globalAlpha = alpha * 0.9;

  /* Measure text */
  ctx.font = '9px monospace';
  const textW = ctx.measureText(hint).width;
  const padX = 6;
  const padY = 4;
  const bw = textW + padX * 2;
  const bh = 14 + padY * 2;
  const bx = node.x - bw / 2;
  const by = node.y - NODE_RADIUS - bh - 4 + floatY;

  /* Bubble background */
  ctx.fillStyle = 'rgba(8, 10, 15, 0.85)';
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 1;
  roundRect(ctx, bx, by, bw, bh, 4);
  ctx.fill();
  ctx.stroke();

  /* Tiny tail triangle */
  ctx.fillStyle = 'rgba(8, 10, 15, 0.85)';
  ctx.beginPath();
  ctx.moveTo(node.x - 4, by + bh);
  ctx.lineTo(node.x + 4, by + bh);
  ctx.lineTo(node.x, by + bh + 5);
  ctx.closePath();
  ctx.fill();

  /* Text */
  ctx.fillStyle = COLORS.accent;
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(hint, node.x, by + bh / 2);

  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
