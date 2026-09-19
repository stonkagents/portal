/**
 * Purpose: Pixel-art sprite renderers — crab player, bug obstacles, agent collectibles.
 *          All drawn via Canvas 2D API, no image assets needed.
 */

import { COLORS } from './constants';

/** Draw the crab player (mini mascot with glasses) */
export function drawCrab(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frame: number) {
  const legOffset = Math.sin(frame * 0.3) * 2;

  /* Body */
  ctx.fillStyle = COLORS.player;
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h * 0.6, w * 0.45, h * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  /* Claws */
  ctx.fillStyle = COLORS.player;
  /* Left claw */
  ctx.beginPath();
  ctx.ellipse(x + 2, y + h * 0.3 + legOffset, 5, 4, -0.3, 0, Math.PI * 2);
  ctx.fill();
  /* Right claw */
  ctx.beginPath();
  ctx.ellipse(x + w - 2, y + h * 0.3 - legOffset, 5, 4, 0.3, 0, Math.PI * 2);
  ctx.fill();

  /* Glasses (the signature) */
  ctx.fillStyle = COLORS.playerGlasses;
  ctx.fillRect(x + w * 0.15, y + h * 0.45, w * 0.28, h * 0.18);
  ctx.fillRect(x + w * 0.57, y + h * 0.45, w * 0.28, h * 0.18);
  /* Bridge */
  ctx.fillRect(x + w * 0.43, y + h * 0.48, w * 0.14, h * 0.1);
  /* Lens darkening */
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(x + w * 0.22, y + h * 0.5, w * 0.14, h * 0.08);
  ctx.fillRect(x + w * 0.64, y + h * 0.5, w * 0.14, h * 0.08);

  /* Legs (little nubs that animate) */
  ctx.fillStyle = COLORS.player;
  for (let i = 0; i < 3; i++) {
    const lx = x + w * 0.2 + i * w * 0.25;
    const ly = y + h * 0.85 + (i % 2 === 0 ? legOffset : -legOffset);
    ctx.fillRect(lx, ly, 3, 4);
  }
}

/** Draw a bug obstacle (corrupted data) */
export function drawBug(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  /* Glitchy rectangle body */
  ctx.fillStyle = COLORS.obstacleBug;
  ctx.fillRect(x, y, w, h);

  /* Glitch lines */
  ctx.fillStyle = COLORS.obstacle;
  const slices = Math.floor(h / 6);
  for (let i = 0; i < slices; i++) {
    if (i % 2 === 0) {
      const offset = (Math.random() - 0.5) * 4;
      ctx.fillRect(x + offset, y + i * 6, w, 2);
    }
  }

  /* Corrupted X mark (pixel art style) */
  const cx = x + w / 2;
  const cy = y + h / 2;
  const s = Math.min(w, h) * 0.3;
  ctx.strokeStyle = COLORS.obstacle;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - s, cy - s);
  ctx.lineTo(cx + s, cy + s);
  ctx.moveTo(cx + s, cy - s);
  ctx.lineTo(cx - s, cy + s);
  ctx.stroke();
}

/** Draw a Agent collectible (glowing green orb) */
export function drawAgent(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, frame: number) {
  const pulse = 1 + Math.sin(frame * 0.1) * 0.15;
  const r = (size / 2) * pulse;

  /* Glow */
  ctx.fillStyle = COLORS.collectibleGlow;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, r * 1.8, 0, Math.PI * 2);
  ctx.fill();

  /* Core */
  ctx.fillStyle = COLORS.collectible;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, r, 0, Math.PI * 2);
  ctx.fill();

  /* Inner "B" */
  ctx.fillStyle = COLORS.bg;
  ctx.font = `bold ${Math.round(size * 0.6)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('B', x + size / 2, y + size / 2 + 1);
}

/** Draw ground with scan lines */
export function drawGround(ctx: CanvasRenderingContext2D, groundY: number, canvasW: number, canvasH: number, scrollOffset: number) {
  /* Ground fill */
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, groundY, canvasW, canvasH - groundY);

  /* Top edge line */
  ctx.strokeStyle = COLORS.groundLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(canvasW, groundY);
  ctx.stroke();

  /* Scrolling grid lines */
  ctx.strokeStyle = COLORS.groundLine;
  ctx.lineWidth = 0.5;
  const gridSize = 40;
  const offset = scrollOffset % gridSize;

  for (let x = -offset; x < canvasW; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, groundY);
    ctx.lineTo(x, canvasH);
    ctx.stroke();
  }
  for (let y = groundY + gridSize; y < canvasH; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasW, y);
    ctx.stroke();
  }
}

/** Draw floating particles */
export function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Array<{ x: number; y: number; vx: number; vy: number; life: number; color: string }>,
) {
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 3, 3);
  }
  ctx.globalAlpha = 1;
}
