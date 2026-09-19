/**
 * Purpose: Retro synth sound effects using Web Audio API.
 *          Zero audio files — all generated at runtime. Short, punchy, 8-bit vibes.
 */

let audioCtx: AudioContext | null = null;
let muted = false;

/** Mute/unmute all sound effects */
export function setMuted(val: boolean) {
  muted = val;
}

export function isMuted(): boolean {
  return muted;
}

function getCtx(): AudioContext | null {
  if (muted) return null;
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(freq: number, duration: number, type: OscillatorType = 'square', volume = 0.15) {
  const ctx = getCtx();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

/** Jump — quick ascending bleep */
export function sfxJump() {
  const ctx = getCtx();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'square';
  osc.frequency.setValueAtTime(300, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.1);
  gain.gain.setValueAtTime(0.12, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.15);
}

/** Collect a Agent — bright sparkle chord */
export function sfxCollect() {
  playTone(523, 0.08, 'square', 0.1);
  setTimeout(() => playTone(659, 0.08, 'square', 0.1), 40);
  setTimeout(() => playTone(784, 0.12, 'square', 0.1), 80);
}

/** Death — descending buzz */
export function sfxDeath() {
  const ctx = getCtx();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(400, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.4);
  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.4);
}

/** Swarm node connect — satisfying click-pop */
export function sfxConnect() {
  playTone(440, 0.06, 'sine', 0.12);
  setTimeout(() => playTone(880, 0.1, 'sine', 0.08), 30);
}

/** Swarm wrong connection — error buzz */
export function sfxError() {
  playTone(150, 0.15, 'sawtooth', 0.1);
  setTimeout(() => playTone(120, 0.15, 'sawtooth', 0.1), 80);
}

/** Round complete — victory fanfare */
export function sfxVictory() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.15, 'square', 0.1), i * 100);
  });
}

/** Chat message received — soft blip */
export function sfxChat() {
  playTone(660, 0.06, 'sine', 0.08);
}

/** Game start — ready beep */
export function sfxStart() {
  playTone(440, 0.1, 'square', 0.1);
  setTimeout(() => playTone(660, 0.15, 'square', 0.12), 120);
}

/** Racer crash — crunchy impact */
export function sfxCrash() {
  const ctx = getCtx();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(200, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.3);
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.3);

  /* Additional crunch noise */
  setTimeout(() => playTone(80, 0.15, 'square', 0.1), 50);
}
