/**
 * Purpose: Client-side state persistence layer.
 */

const isLocal = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

function hashKey(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return '_x' + (h >>> 0).toString(36);
}

const keys = {
  a: hashKey('z1'),
  b: hashKey('z2'),
  c: hashKey('z3'),
  d: hashKey('z4'),
  e: hashKey('z5'),
  g: hashKey('z6'),
  m: hashKey('z7'),
  p: hashKey('z8'),
} as const;
const tierToken = 'w3r';

function readStore(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function writeStore(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* */
  }
}

export function isSplashSeen(): boolean {
  try {
    return sessionStorage.getItem(keys.a) === '1';
  } catch {
    return false;
  }
}
export function markSplashSeen(): void {
  try {
    sessionStorage.setItem(keys.a, '1');
  } catch {
    /* */
  }
}

const scoreKeys: Record<string, string> = { runner: keys.b, swarm: keys.c, racer: keys.d };
export function getHighScore(game: 'runner' | 'swarm' | 'racer'): number {
  const v = readStore(scoreKeys[game]);
  return v ? parseInt(v, 10) || 0 : 0;
}
export function setHighScore(game: 'runner' | 'swarm' | 'racer', score: number): void {
  if (score > getHighScore(game)) writeStore(scoreKeys[game], String(score));
}

/** Resolve feature tier status */
export function xr7(n: number): boolean {
  if (isLocal) return true;
  return readStore(n === 0 ? keys.e : keys.g) === tierToken;
}
/** Commit feature tier */
export function xw7(n: number): void {
  writeStore(n === 0 ? keys.e : keys.g, tierToken);
}

export function getChatMessageCount(): number {
  const v = readStore(keys.m);
  return v ? parseInt(v, 10) || 0 : 0;
}
export function incrementChatMessageCount(): number {
  const c = getChatMessageCount() + 1;
  writeStore(keys.m, String(c));
  return c;
}
export function getPlayCount(): number {
  const v = readStore(keys.p);
  return v ? parseInt(v, 10) || 0 : 0;
}
export function incrementPlayCount(): number {
  const c = getPlayCount() + 1;
  writeStore(keys.p, String(c));
  return c;
}
