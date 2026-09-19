/**
 * Purpose: Sprite renderers for the racer — thug Agent driver (cigar + smoke),
 *          crash ejection animation, and traffic cars.
 */

import type { CrashAgent } from './engine';
import { CANVAS_WIDTH, CANVAS_HEIGHT, COLORS } from './constants';

/**
 * Draw the thug Agent sitting in the car. Cigar glowing, smoke drifting.
 * Origin is roughly center-top of car windshield.
 */
export function drawThugAgentDriver(ctx: CanvasRenderingContext2D, cx: number, cy: number, frame: number) {
  const size = 14;

  ctx.save();
  ctx.translate(cx, cy);

  /* Head (red circle) */
  ctx.fillStyle = COLORS.agentBody;
  ctx.beginPath();
  ctx.arc(0, -size * 0.3, size * 0.6, 0, Math.PI * 2);
  ctx.fill();

  /* Pixel glasses bar */
  const gw = size * 0.9;
  const gh = size * 0.18;
  ctx.fillStyle = COLORS.agentGlasses;
  ctx.fillRect(-gw / 2, -size * 0.45, gw, gh);
  /* Left lens */
  ctx.fillRect(-gw / 2, -size * 0.45 + gh, gw * 0.35, gh * 1.5);
  /* Right lens */
  ctx.fillRect(gw / 2 - gw * 0.35, -size * 0.45 + gh, gw * 0.35, gh * 1.5);

  /* Dark pupils */
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(-gw * 0.2, -size * 0.45 + gh + gh * 0.3, gw * 0.12, gh * 0.8);
  ctx.fillRect(gw * 0.12, -size * 0.45 + gh + gh * 0.3, gw * 0.12, gh * 0.8);

  /* Cigar */
  const cigarX = size * 0.35;
  const cigarY = -size * 0.05;
  ctx.fillStyle = '#8B6914';
  ctx.fillRect(cigarX, cigarY, size * 0.5, size * 0.1);
  /* Cigar tip (ember) */
  ctx.fillStyle = COLORS.cigarTip;
  const emberPulse = 0.7 + Math.sin(frame * 0.15) * 0.3;
  ctx.globalAlpha = emberPulse;
  ctx.fillRect(cigarX + size * 0.45, cigarY - 1, size * 0.08, size * 0.12);
  ctx.globalAlpha = 1;

  /* Smoke wisps */
  const smokeX = cigarX + size * 0.5;
  const smokeY = cigarY - 3;
  ctx.fillStyle = COLORS.smoke;
  for (let i = 0; i < 3; i++) {
    const t = (frame * 0.03 + i * 0.7) % 1;
    const sx = smokeX + Math.sin(frame * 0.05 + i * 2) * 3;
    const sy = smokeY - t * 12;
    const sr = 1.5 + t * 2;
    ctx.globalAlpha = (1 - t) * 0.4;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.restore();
}

/**
 * Draw the Agent being ejected from the car during a crash.
 * Falls out, tumbles, gets back up when grounded.
 */
export function drawCrashAgent(ctx: CanvasRenderingContext2D, agent: CrashAgent) {
  const cx = CANVAS_WIDTH / 2 + agent.x;
  const groundY = CANVAS_HEIGHT - 70;
  const cy = groundY + agent.y;
  const size = 22;

  ctx.save();
  ctx.translate(cx, cy);

  if (!agent.grounded) {
    /* Tumbling through the air */
    ctx.rotate(agent.rotation);

    /* Body */
    ctx.fillStyle = COLORS.agentBody;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2);
    ctx.fill();

    /* Claws flailing */
    const flail = Math.sin(agent.rotation * 3) * 0.4;
    ctx.fillStyle = COLORS.agentBody;
    ctx.beginPath();
    ctx.ellipse(-size * 0.7, -size * 0.1, size * 0.25, size * 0.15, flail, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(size * 0.7, -size * 0.1, size * 0.25, size * 0.15, -flail, 0, Math.PI * 2);
    ctx.fill();

    /* Glasses (askew) */
    ctx.fillStyle = COLORS.agentGlasses;
    const gw = size * 0.8;
    const gh = size * 0.15;
    ctx.fillRect(-gw / 2, -size * 0.15, gw, gh);
    ctx.fillRect(-gw / 2, -size * 0.15 + gh, gw * 0.3, gh * 1.4);
    ctx.fillRect(gw / 2 - gw * 0.3, -size * 0.15 + gh, gw * 0.3, gh * 1.4);

    /* Cigar flying off separately */
    const cigarDist = Math.min(agent.timer, 30) * 1.5;
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(size * 0.5 + cigarDist * 0.3, -size * 0.3 - cigarDist * 0.5, 8, 3);
    ctx.fillStyle = COLORS.cigarTip;
    ctx.fillRect(size * 0.5 + cigarDist * 0.3 + 7, -size * 0.3 - cigarDist * 0.5, 3, 3);
  } else {
    /* Getting back up animation */
    const getUpProgress = Math.min((CANVAS_HEIGHT - agent.timer) / 30, 1);
    const lean = (1 - getUpProgress) * 0.5;

    ctx.rotate(lean);

    /* Body */
    ctx.fillStyle = COLORS.agentBody;
    ctx.beginPath();
    ctx.arc(0, -size * getUpProgress * 0.3, size * 0.5, 0, Math.PI * 2);
    ctx.fill();

    /* Legs (standing up) */
    ctx.fillStyle = COLORS.agentBody;
    ctx.fillRect(-size * 0.2, size * 0.2, 4, size * 0.4 * getUpProgress);
    ctx.fillRect(size * 0.1, size * 0.2, 4, size * 0.4 * getUpProgress);

    /* Claws */
    ctx.fillStyle = COLORS.agentBody;
    ctx.beginPath();
    ctx.ellipse(-size * 0.6, -size * getUpProgress * 0.1, size * 0.2, size * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(size * 0.6, -size * getUpProgress * 0.1, size * 0.2, size * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    /* Glasses (straightening) */
    const glassesOff = (1 - getUpProgress) * 0.15;
    ctx.fillStyle = COLORS.agentGlasses;
    const gw = size * 0.8;
    const gh = size * 0.15;
    ctx.save();
    ctx.rotate(glassesOff);
    ctx.fillRect(-gw / 2, -size * 0.45 * getUpProgress, gw, gh);
    ctx.fillRect(-gw / 2, -size * 0.45 * getUpProgress + gh, gw * 0.3, gh * 1.4);
    ctx.fillRect(gw / 2 - gw * 0.3, -size * 0.45 * getUpProgress + gh, gw * 0.3, gh * 1.4);
    ctx.restore();

    /* Stars circling head (dazed) */
    if (getUpProgress < 0.8) {
      ctx.fillStyle = COLORS.accent;
      for (let i = 0; i < 3; i++) {
        const angle = agent.timer * 0.1 + (i * Math.PI * 2) / 3;
        const starX = Math.cos(angle) * size * 0.7;
        const starY = -size * 0.7 + Math.sin(angle) * size * 0.3;
        ctx.globalAlpha = 0.6;
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('*', starX, starY);
      }
      ctx.globalAlpha = 1;
    }
  }

  ctx.restore();
}

/**
 * Draw a traffic car at screen position with given scale.
 */
export function drawTrafficCarSprite(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  size: number,
  color: string,
  oncoming = false,
) {
  if (size < 2) return;

  const w = Math.max(size * 0.06, 4);
  const h = w * 0.6;

  ctx.save();
  ctx.translate(screenX, screenY);

  /* Car body */
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-w / 2, 0);
  ctx.lineTo(-w / 2 + w * 0.15, -h);
  ctx.lineTo(w / 2 - w * 0.15, -h);
  ctx.lineTo(w / 2, 0);
  ctx.closePath();
  ctx.fill();

  /* Windshield */
  ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
  ctx.fillRect(-w * 0.25, -h + 1, w * 0.5, h * 0.3);

  if (oncoming) {
    /* Headlights (bright white/yellow glow facing player) */
    ctx.fillStyle = '#ffffaa';
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(-w * 0.3, -1, Math.max(w * 0.06, 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(w * 0.3, -1, Math.max(w * 0.06, 2), 0, Math.PI * 2);
    ctx.fill();
    /* Headlight glow spread */
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#ffffcc';
    ctx.beginPath();
    ctx.arc(0, 2, w * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else {
    /* Tail lights */
    ctx.fillStyle = '#FF4D4D';
    ctx.fillRect(-w / 2, -2, 3, 2);
    ctx.fillRect(w / 2 - 3, -2, 3, 2);
  }

  ctx.restore();
}
