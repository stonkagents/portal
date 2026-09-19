/**
 * Purpose: Shared speech/thought bubble system for in-game Agent meme quips.
 *          Renders canvas speech bubbles with on-brand, meme-style text.
 */

/* ── Quip banks ── */

/** Swarm node idle chatter — short, fits in tiny bubble */
export const SWARM_QUIPS = [
  'sync me, agent',
  'wagmi',
  'lfg',
  'gm ser',
  'need link',
  'no cap',
  'based',
  'vibes only',
  'ser pls',
  'ngmi alone',
  'bruh moment',
  'wen sync',
  'agent szn',
  'degen hrs',
  'hodl me',
  'to the moon',
  'trust the network',
  '1000x incoming',
  'wen lambo',
  'stay frosty',
] as const;

/** Swarm connect celebration */
export const SWARM_CONNECT_QUIPS = ['SYNCED!', 'LFG!', 'BASED.', 'EZ.', 'WAGMI!', 'BIG BRAIN', 'AGENT POWER', 'NOICE'] as const;

/** Racer speed quips — driver trash talk */
export const RACER_SPEED_QUIPS = [
  'too easy',
  'catch me',
  'no brakes, agent',
  'smoking em',
  'eat dust',
  'vroom vroom',
  'not even close',
  'built different',
  'speed is life',
  'lfg',
  'max velocity',
  'they mad',
  'gap = massive',
  'skill diff',
] as const;

/** Racer crash quips — post-crash comedy */
export const RACER_CRASH_QUIPS = [
  'bruh.',
  'that wall came outta nowhere',
  'skill issue',
  'lag.',
  'controller died',
  'meant to do that',
  'just a scratch',
  'ow my claw',
  'need new glasses',
  'cigar still lit tho',
  'insurance covers this right',
  'walked it off nbd',
] as const;

/** Racer lap quips */
export const RACER_LAP_QUIPS = ['ANOTHER ONE', 'LAP KING', 'EASY MONEY', 'BUILT DIFFERENT', 'TOO FAST'] as const;

/* ── Drawing helpers ── */

/** Pick a deterministic quip from a bank based on frame seed */
export function pickQuip(bank: readonly string[], seed: number): string {
  return bank[Math.abs(seed) % bank.length];
}

/**
 * Draw a speech bubble with text at (x, y).
 * Bubble appears above the point with a small triangle tail.
 */
export function drawBubble(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: {
    font?: string;
    bgColor?: string;
    textColor?: string;
    borderColor?: string;
    alpha?: number;
    tailDir?: 'down' | 'up';
    maxWidth?: number;
  } = {},
) {
  const {
    font = 'bold 8px monospace',
    bgColor = 'rgba(8, 10, 15, 0.85)',
    textColor = '#00FF00',
    borderColor = '#00FF00',
    alpha = 1,
    tailDir = 'down',
    maxWidth = 120,
  } = opts;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  /* Measure text */
  const metrics = ctx.measureText(text);
  const tw = Math.min(metrics.width, maxWidth);
  const padX = 6;
  const bw = tw + padX * 2;
  const bh = 14;
  const tailH = 5;

  const bx = x - bw / 2;
  const by = tailDir === 'down' ? y - bh - tailH : y + tailH;

  /* Bubble background */
  ctx.fillStyle = bgColor;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;

  /* Rounded rect */
  const r = 3;
  ctx.beginPath();
  ctx.moveTo(bx + r, by);
  ctx.lineTo(bx + bw - r, by);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
  ctx.lineTo(bx + bw, by + bh - r);
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
  ctx.lineTo(bx + r, by + bh);
  ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
  ctx.lineTo(bx, by + r);
  ctx.quadraticCurveTo(bx, by, bx + r, by);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  /* Tail triangle */
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  if (tailDir === 'down') {
    ctx.moveTo(x - 4, by + bh);
    ctx.lineTo(x, by + bh + tailH);
    ctx.lineTo(x + 4, by + bh);
  } else {
    ctx.moveTo(x - 4, by);
    ctx.lineTo(x, by - tailH);
    ctx.lineTo(x + 4, by);
  }
  ctx.fill();

  /* Text */
  ctx.fillStyle = textColor;
  ctx.fillText(text, x, by + bh / 2, maxWidth);

  ctx.restore();
}

/**
 * Manages timed bubble display. Each bubble has an expiry frame.
 * Call tick() each frame — it handles showing/hiding.
 */
export interface ActiveBubble {
  text: string;
  x: number;
  y: number;
  startFrame: number;
  duration: number;
  alpha: number;
}

/** Fade calculation — 1.0 during visible, fades out in last 20 frames */
export function bubbleAlpha(bubble: ActiveBubble, currentFrame: number): number {
  const elapsed = currentFrame - bubble.startFrame;
  if (elapsed >= bubble.duration) return 0;
  const fadeStart = bubble.duration - 20;
  if (elapsed > fadeStart) {
    return (bubble.duration - elapsed) / 20;
  }
  return 1;
}
