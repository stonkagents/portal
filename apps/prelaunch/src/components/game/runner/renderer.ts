/**
 * Purpose: Canvas renderer — draws game state each frame.
 */

import type { GameState } from './engine';
import { CANVAS_WIDTH, CANVAS_HEIGHT, GROUND_Y, COLORS } from './constants';
import { drawCrab, drawBug, drawAgent, drawGround, drawParticles } from './sprites';

export function render(ctx: CanvasRenderingContext2D, state: GameState) {
  /* Clear */
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  /* Stars / background dots */
  drawStarfield(ctx, state.frame);

  /* Ground */
  drawGround(ctx, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT, state.scrollOffset);

  /* Collectibles */
  for (const c of state.collectibles) {
    if (!c.collected) {
      drawAgent(ctx, c.x, c.y, c.size, state.frame);
    }
  }

  /* Obstacles */
  for (const o of state.obstacles) {
    drawBug(ctx, o.x, o.y, o.width, o.height);
  }

  /* Player */
  drawCrab(ctx, state.player.x, state.player.y, state.player.width, state.player.height, state.frame);

  /* Particles */
  drawParticles(ctx, state.particles);

  /* HUD */
  drawHUD(ctx, state);

  /* Overlays */
  if (state.phase === 'ready') {
    drawReadyOverlay(ctx);
  } else if (state.phase === 'dead') {
    drawDeadOverlay(ctx, state.score);
  }
}

function drawStarfield(ctx: CanvasRenderingContext2D, frame: number) {
  ctx.fillStyle = COLORS.accent;
  /* Deterministic "stars" */
  for (let i = 0; i < 30; i++) {
    const seed = i * 7919;
    const x = (seed * 13) % CANVAS_WIDTH;
    const y = (seed * 17) % (GROUND_Y - 20);
    const twinkle = Math.sin(frame * 0.02 + i) * 0.5 + 0.5;
    ctx.globalAlpha = twinkle * 0.15;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.globalAlpha = 1;
}

function drawHUD(ctx: CanvasRenderingContext2D, state: GameState) {
  if (state.phase === 'ready') return;

  /* Score background */
  ctx.fillStyle = COLORS.scoreBg;
  ctx.fillRect(CANVAS_WIDTH - 130, 8, 122, 32);
  ctx.strokeStyle = COLORS.groundLine;
  ctx.strokeRect(CANVAS_WIDTH - 130, 8, 122, 32);

  /* Score text */
  ctx.fillStyle = COLORS.accent;
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`SCORE: ${state.score}`, CANVAS_WIDTH - 18, 30);

  /* Speed indicator */
  ctx.fillStyle = COLORS.text;
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`SPD: ${state.speed.toFixed(1)}`, 12, 22);
}

function drawReadyOverlay(ctx: CanvasRenderingContext2D) {
  /* Semi-transparent overlay */
  ctx.fillStyle = 'rgba(8, 10, 15, 0.5)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  /* Title */
  ctx.fillStyle = COLORS.accent;
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('FIND YOUR AGENT', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30);

  /* Instructions */
  ctx.fillStyle = COLORS.text;
  ctx.font = '13px monospace';
  ctx.fillText('TAP / SPACE / ↑ to jump', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 5);
  ctx.fillText('Dodge bugs, collect Agents', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 25);

  /* Pulsing prompt */
  ctx.fillStyle = COLORS.accent;
  ctx.font = 'bold 15px monospace';
  ctx.fillText('[ TAP TO START ]', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 60);
}

function drawDeadOverlay(ctx: CanvasRenderingContext2D, score: number) {
  ctx.fillStyle = 'rgba(8, 10, 15, 0.7)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.fillStyle = COLORS.obstacle;
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('REKT', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30);

  ctx.fillStyle = COLORS.text;
  ctx.font = '14px monospace';
  ctx.fillText(`Score: ${score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 5);

  ctx.fillStyle = COLORS.accent;
  ctx.font = 'bold 13px monospace';
  ctx.fillText('[ TAP TO RETRY ]', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40);
}
