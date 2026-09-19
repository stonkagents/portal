/**
 * Purpose: Procedural background music for games using Web Audio API.
 *          Zero audio files — all generated at runtime. Each game has a
 *          distinct vibe: Swarm is ambient/puzzle, Racer is driving synthwave.
 */

import { isMuted } from './sfx';

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (isMuted()) return null;
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

/* ── Shared state ── */

interface BGMHandle {
  stop: () => void;
}

let activeHandle: BGMHandle | null = null;

/** Stop any currently playing background music */
export function stopBGM() {
  if (activeHandle) {
    activeHandle.stop();
    activeHandle = null;
  }
}

/* ── Note helpers ── */

const NOTE_FREQS: Record<string, number> = {
  C2: 65.41,
  D2: 73.42,
  E2: 82.41,
  F2: 87.31,
  G2: 98.0,
  A2: 110.0,
  B2: 123.47,
  C3: 130.81,
  D3: 146.83,
  Eb3: 155.56,
  E3: 164.81,
  F3: 174.61,
  G3: 196.0,
  A3: 220.0,
  Bb3: 233.08,
  B3: 246.94,
  C4: 261.63,
  D4: 293.66,
  Eb4: 311.13,
  E4: 329.63,
  F4: 349.23,
  G4: 392.0,
  A4: 440.0,
  Bb4: 466.16,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  Eb5: 622.25,
  E5: 659.25,
  G5: 783.99,
};

/* ── Swarm BGM: Ambient puzzle — gentle arpeggio + pad ── */

export function startSwarmBGM(): void {
  stopBGM();
  const ctx = getCtx();
  if (!ctx) return;

  let stopped = false;

  /* Master gain for this BGM */
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 1);
  master.connect(ctx.destination);

  /* Pad: low sustained chord (Cm: C3, Eb3, G3) */
  const padOscs: OscillatorNode[] = [];
  const padGain = ctx.createGain();
  padGain.gain.setValueAtTime(0.4, ctx.currentTime);
  padGain.connect(master);

  for (const note of ['C3', 'Eb3', 'G3']) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(NOTE_FREQS[note], ctx.currentTime);
    osc.connect(padGain);
    osc.start(ctx.currentTime);
    padOscs.push(osc);
  }

  /* Arpeggio: triangle wave cycling through C3 Eb3 G3 C4 G3 Eb3 */
  const arpNotes = ['C4', 'Eb4', 'G4', 'C5', 'G4', 'Eb4'];
  let arpIdx = 0;
  const BPM = 100;
  const eighthNote = 60 / BPM / 2;

  function scheduleArpNote() {
    if (stopped) return;
    const c = getCtx();
    if (!c || isMuted()) return;

    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'triangle';
    const freq = NOTE_FREQS[arpNotes[arpIdx % arpNotes.length]];
    osc.frequency.setValueAtTime(freq, c.currentTime);
    gain.gain.setValueAtTime(0.3, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + eighthNote * 0.9);

    osc.connect(gain);
    gain.connect(master);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + eighthNote);

    arpIdx++;
  }

  const timerId = setInterval(scheduleArpNote, eighthNote * 1000);
  scheduleArpNote();

  activeHandle = {
    stop() {
      stopped = true;
      clearInterval(timerId);
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
      padOscs.forEach(o => {
        try {
          o.stop(ctx.currentTime + 0.4);
        } catch {
          /* already stopped */
        }
      });
      setTimeout(() => {
        try {
          master.disconnect();
        } catch {
          /* ok */
        }
      }, 500);
    },
  };
}

/* ── Racer BGM: Driving synthwave — bass + hi-hat + lead ── */

export function startRacerBGM(): void {
  stopBGM();
  const ctx = getCtx();
  if (!ctx) return;

  let stopped = false;

  /* Master gain */
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0.07, ctx.currentTime + 0.5);
  master.connect(ctx.destination);

  const BPM = 140;
  const sixteenth = 60 / BPM / 4;
  let step = 0;

  /* Bass pattern: driving 8th-note pulse (C2 C2 G2 C2 | E2 E2 G2 C2) */
  const bassPattern = ['C2', 'C2', 'G2', 'C2', 'E2', 'E2', 'G2', 'C2', 'C2', 'C2', 'A2', 'C2', 'F2', 'F2', 'G2', 'C2'];

  /* Lead melody: simple 16-step phrase, rests as empty string */
  const leadPattern = ['E4', '', 'G4', '', 'A4', '', 'G4', 'E4', 'D4', '', 'E4', '', 'G4', '', 'E4', ''];

  function scheduleStep() {
    if (stopped) return;
    const c = getCtx();
    if (!c || isMuted()) return;

    const beatInBar = step % 16;

    /* Bass (every other step = 8th notes) */
    if (beatInBar % 2 === 0) {
      const bassNote = bassPattern[(beatInBar / 2) % bassPattern.length];
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(NOTE_FREQS[bassNote], c.currentTime);
      gain.gain.setValueAtTime(0.5, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + sixteenth * 1.8);
      osc.connect(gain);
      gain.connect(master);
      osc.start(c.currentTime);
      osc.stop(c.currentTime + sixteenth * 2);
    }

    /* Hi-hat (noise burst every step) */
    {
      const bufSize = c.sampleRate * 0.02;
      const buf = c.createBuffer(1, bufSize, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
      const noise = c.createBufferSource();
      noise.buffer = buf;
      const hiGain = c.createGain();
      const accent = beatInBar % 4 === 0 ? 0.35 : 0.15;
      hiGain.gain.setValueAtTime(accent, c.currentTime);
      hiGain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.03);
      noise.connect(hiGain);
      hiGain.connect(master);
      noise.start(c.currentTime);
      noise.stop(c.currentTime + 0.04);
    }

    /* Lead (square wave melody) */
    const leadNote = leadPattern[beatInBar % leadPattern.length];
    if (leadNote) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(NOTE_FREQS[leadNote], c.currentTime);
      gain.gain.setValueAtTime(0.12, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + sixteenth * 1.5);
      osc.connect(gain);
      gain.connect(master);
      osc.start(c.currentTime);
      osc.stop(c.currentTime + sixteenth * 2);
    }

    step++;
  }

  const timerId = setInterval(scheduleStep, sixteenth * 1000);
  scheduleStep();

  activeHandle = {
    stop() {
      stopped = true;
      clearInterval(timerId);
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
      setTimeout(() => {
        try {
          master.disconnect();
        } catch {
          /* ok */
        }
      }, 500);
    },
  };
}

/* ── Runner BGM: Uptempo chiptune — bouncy and simple ── */

export function startRunnerBGM(): void {
  stopBGM();
  const ctx = getCtx();
  if (!ctx) return;

  let stopped = false;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.5);
  master.connect(ctx.destination);

  const BPM = 160;
  const eighth = 60 / BPM / 2;
  let step = 0;

  /* Bass: simple pumping octave pattern */
  const bassPattern = ['C3', 'C2', 'C3', 'C2', 'G2', 'G2', 'Bb3', 'G2'];

  /* Melody: catchy looping phrase */
  const melodyPattern = ['C5', '', 'Eb5', '', 'G5', 'Eb5', 'C5', '', 'Bb4', '', 'G4', '', 'Bb4', 'C5', '', ''];

  function scheduleStep() {
    if (stopped) return;
    const c = getCtx();
    if (!c || isMuted()) return;

    const pos = step % 16;

    /* Bass */
    if (pos % 2 === 0) {
      const note = bassPattern[(pos / 2) % bassPattern.length];
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(NOTE_FREQS[note], c.currentTime);
      gain.gain.setValueAtTime(0.35, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + eighth * 1.5);
      osc.connect(gain);
      gain.connect(master);
      osc.start(c.currentTime);
      osc.stop(c.currentTime + eighth * 2);
    }

    /* Melody */
    const note = melodyPattern[pos];
    if (note) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(NOTE_FREQS[note], c.currentTime);
      gain.gain.setValueAtTime(0.15, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + eighth * 0.8);
      osc.connect(gain);
      gain.connect(master);
      osc.start(c.currentTime);
      osc.stop(c.currentTime + eighth);
    }

    step++;
  }

  const timerId = setInterval(scheduleStep, eighth * 1000);
  scheduleStep();

  activeHandle = {
    stop() {
      stopped = true;
      clearInterval(timerId);
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
      setTimeout(() => {
        try {
          master.disconnect();
        } catch {
          /* ok */
        }
      }, 500);
    },
  };
}
