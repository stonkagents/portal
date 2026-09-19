/**
 * Purpose: Canvas renderer for the network map. Two layers: `land` (sphere, graticule,
 *          country fills and a density glow from tracker peers, borders) painted only on
 *          resize or data change, and `fx` (peer dots, arcs between connected peers with
 *          particles moving along them, pulses on peer join, hover outline) animated at
 *          30 fps only while React says the map is on screen, the tab is visible and the
 *          visitor has not asked for reduced motion. Every buffer is allocated once per
 *          data change (typed arrays, fixed pools); mousemove allocates nothing.
 *          Off screen both canvases drop their backing stores; destroy() releases all.
 *
 *          simulatedPeers: a launch-period visual layer. Until enough daemons are online the
 *          network would look empty, so the renderer blends in simulated peers at real city
 *          coordinates (SIM_HUBS) that pulse in and out and carry particles along arcs.
 *          They are drawn under the real peers, are never hoverable, labelled or counted
 *          anywhere in the UI, and their number is max(0, target - real located peers), so
 *          the layer disappears by itself as real peers grow. Reduce SIM_TARGET as daemons
 *          come online.
 */

import type { MapAnchor } from './anchors';
import type { CountryCounts } from './country-codes';
import { type Fill, countryAt, fitSphere, projectUnit, sphereOutline, type Fit, type Land, type LandCountry } from './projection';

export interface MapPeerPoint {
  id: string;
  lat?: number;
  lng?: number;
  status: 'online' | 'seeding' | 'leeching' | 'offline';
  /** Tooltip title (display name). */
  label: string;
  /** Tooltip value: "City, Country" or "Location unknown". */
  place: string;
}

export interface RendererElements {
  container: HTMLElement;
  landCanvas: HTMLCanvasElement;
  fxCanvas: HTMLCanvasElement;
  tooltip: HTMLElement;
  tipTitle: HTMLElement;
  tipLabel: HTMLElement;
  tipValue: HTMLElement;
}

export interface RendererOptions {
  offset: readonly [number, number];
  /** `cover` fills the box's height too (hero backdrop); `contain` shows the whole world (card). */
  fill?: Fill;
  /** World-atlas id -> display name for the country tooltip. */
  countryName: (id: string) => string;
  /** Infrastructure anchors used for the arcs while few peers are located. */
  anchors: readonly MapAnchor[];
  /** Located-peer count below which the anchors join the arcs. */
  minLocatedPeers: number;
}

export interface MapRenderer {
  setOffset: (offset: readonly [number, number]) => void;
  setData: (peers: readonly MapPeerPoint[], countries: CountryCounts | null) => void;
  /** True while mounted and on screen. False drops both canvas backing stores. */
  setActive: (active: boolean) => void;
  destroy: () => void;
}

const FRAME_MS = 33; // 30 fps cap
const MAX_DPR = 2;
const MAX_PARTICLES = 28; // arcs in flight at once: dense enough to read as traffic
const MAX_PULSES = 48;
/** Most nodes link to their nearest neighbour; one in this many also reaches another country. */
const LONG_LINK_EVERY = 25;
/** A long link's partner is at least this far (unit space, ~9% of the map). */
const LINK_MIN_D2 = 0.09 * 0.09;
/** Every third long link must cross an ocean: partners at least this far apart in x (Asia to America). */
const LINK_FAR_DX = 0.32;
const TRAIL_LEN = 8;
const GLOW_SPRITE = 24;
const DENSITY_RADIUS = 44;
const ALPHA_BUCKETS = 4;
const HIT_RADIUS = 7; // mouse
const HIT_RADIUS_TOUCH = 22; // a 44 px target under a finger
const PHONE_WIDTH = 600; // below this the particle and pulse budgets are cut
const PHONE_PARTICLES = 10;
const PHONE_PULSES = 16;

const STATUS_OFFLINE = 3;
const STATUS_ANCHOR = 4;
const STATUS_INDEX: Record<MapPeerPoint['status'], number> = { online: 0, seeding: 1, leeching: 2, offline: 3 };
const STATUS_RGB = [
  [0, 255, 65],
  [74, 158, 255],
  [255, 68, 68],
  [80, 88, 104],
  [245, 197, 66],
];
const PARTICLE_COLORS = ['#00ff41', '#4a9eff'];
const SIM_TARGET = 64; // simulated peers on desktop when no real peer is located
const SIM_TARGET_PHONE = 24;
const SIM_LIFE_CUTOFF = 0.12; // below this life value a simulated dot is not drawn (pulsed out)
const SIM_JITTER_DEG = 3;
/**
 * Hubs for the simulated layer: cities in the top crypto-adoption countries, [lon, lat, weight].
 * Weight is how many slots a hub takes in the draw (ceiling 3: Vietnam, India, US, Nigeria, Brazil).
 */
const SIM_HUBS: readonly [number, number, number][] = [
  [106.63, 10.82, 3], // Ho Chi Minh City, Vietnam
  [105.85, 21.03, 2], // Hanoi, Vietnam
  [77.59, 12.97, 3], // Bangalore, India
  [72.88, 19.08, 2], // Mumbai, India
  [77.21, 28.61, 2], // Delhi, India
  [-74.01, 40.71, 3], // New York, US
  [-122.42, 37.77, 3], // San Francisco, US
  [-87.63, 41.88, 1], // Chicago, US
  [-80.19, 25.76, 1], // Miami, US
  [3.38, 6.52, 3], // Lagos, Nigeria
  [7.49, 9.06, 1], // Abuja, Nigeria
  [-46.63, -23.55, 3], // São Paulo, Brazil
  [-43.17, -22.91, 1], // Rio de Janeiro, Brazil
  [30.52, 50.45, 2], // Kyiv, Ukraine
  [37.62, 55.76, 2], // Moscow, Russia
  [30.32, 59.93, 1], // St Petersburg, Russia
  [106.85, -6.21, 2], // Jakarta, Indonesia
  [67.01, 24.86, 2], // Karachi, Pakistan
  [74.35, 31.55, 1], // Lahore, Pakistan
  [120.98, 14.6, 2], // Manila, Philippines
  [100.5, 13.76, 2], // Bangkok, Thailand
  [-58.38, -34.6, 2], // Buenos Aires, Argentina
  [28.98, 41.01, 2], // Istanbul, Turkey
  [-0.13, 51.51, 2], // London, UK
  [13.41, 52.52, 2], // Berlin, Germany
  [8.68, 50.11, 1], // Frankfurt, Germany
  [-79.38, 43.65, 2], // Toronto, Canada
  [-123.12, 49.28, 1], // Vancouver, Canada
  [28.05, -26.2, 2], // Johannesburg, South Africa
  [18.42, -33.93, 1], // Cape Town, South Africa
  [126.98, 37.57, 2], // Seoul, South Korea
  [139.69, 35.68, 2], // Tokyo, Japan
  [103.82, 1.35, 1], // Singapore
  [55.27, 25.2, 1], // Dubai, UAE
  [-99.13, 19.43, 2], // Mexico City, Mexico
  [-74.07, 4.71, 1], // Bogotá, Colombia
  [36.82, -1.29, 1], // Nairobi, Kenya
  [151.21, -33.87, 1], // Sydney, Australia
];
/** Hubs repeated by weight, so a uniform draw is an adoption-weighted draw. */
const SIM_DRAW: readonly (readonly [number, number, number])[] = SIM_HUBS.flatMap(h => Array.from({ length: h[2] }, () => h));
const EMPTY_SHADES = ['#12151e', '#151a24', '#111620', '#171d28'];
const SPHERE = sphereOutline();

/** Peers without coordinates are drawn as a small cluster in the South Pacific, off every land mass. */
function unknownSlot(i: number): [number, number] {
  return [-150 + (i % 8) * 4, -46 - Math.floor(i / 8) * 3];
}

function hasLocation(p: MapPeerPoint): boolean {
  return typeof p.lat === 'number' && typeof p.lng === 'number' && !(p.lat === 0 && p.lng === 0);
}

/** Small deterministic PRNG so the simulated layer is stable across mounts. */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function countryFill(count: number, scaleMax: number, idx: number): string {
  if (count <= 0) return EMPTY_SHADES[idx % EMPTY_SHADES.length];
  const t = scaleMax > 1 ? (Math.min(count, scaleMax) - 1) / (scaleMax - 1) : 1;
  return 'rgb(0,' + Math.round(40 + t * 215) + ',' + Math.round(30 + t * 35) + ')';
}

interface Particle {
  alive: boolean;
  from: number;
  to: number;
  t: number;
  speed: number;
  color: number;
  size: number;
  trailX: Float32Array;
  trailY: Float32Array;
  head: number;
  len: number;
}

interface Pulse {
  alive: boolean;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: number;
}

export function createMapRenderer(els: RendererElements, land: Land, options: RendererOptions): MapRenderer {
  const { container, landCanvas, fxCanvas, tooltip, tipTitle, tipLabel, tipValue } = els;
  const { countryName, anchors, minLocatedPeers } = options;
  const landCtx = landCanvas.getContext('2d');
  const fxCtx = fxCanvas.getContext('2d');

  let { offset } = options;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let fit: Fit = fitSphere(1, 1);
  let sized = false;
  let particleBudget = MAX_PARTICLES;
  let pulseBudget = MAX_PULSES;
  let simTarget = SIM_TARGET;

  // ---- data: nodes = peers followed by the anchors in use ----
  let counts: CountryCounts | null = null;
  let n = 0; // all nodes
  let nPeers = 0; // real peers (tooltip labels)
  let anchorStart = 0; // index of the first anchor node (== simStart when anchors are not in use)
  let simStart = 0; // index of the first simulated node; nodes >= simStart are never hoverable
  let realPeers: readonly MapPeerPoint[] = [];
  let ux = new Float32Array(0);
  let uy = new Float32Array(0);
  let sx = new Float32Array(0);
  let sy = new Float32Array(0);
  let status = new Uint8Array(0);
  let located = new Uint8Array(0);
  let phase = new Float32Array(0);
  let rate = new Float32Array(0);
  let breath = new Float32Array(0);
  let bucket = new Uint8Array(0);
  let lifePhase = new Float32Array(0); // simulated dots pulse in and out on this slow wave
  let lifeRate = new Float32Array(0);
  let labels: readonly MapPeerPoint[] = [];
  let endpoints = new Uint16Array(0); // located active peers (+ anchors) usable as arc ends
  let links = new Uint16Array(0); // pairs [a, b, a, b, ...] drawn as faint arcs
  let prevIds = new Set<string>();
  const joined: number[] = []; // peers new since the last data set, pulsed after projection

  // Fill styles per status x bucket, built once.
  const haloFill: string[][] = [];
  const coreFill: string[][] = [];
  for (let s = 0; s < STATUS_RGB.length; s++) {
    const base = 'rgba(' + STATUS_RGB[s].join(',') + ',';
    haloFill.push([]);
    coreFill.push([]);
    for (let b = 0; b < ALPHA_BUCKETS; b++) {
      const level = (b + 0.5) / ALPHA_BUCKETS;
      haloFill[s].push(base + (0.08 + level * 0.12).toFixed(3) + ')');
      coreFill[s].push(base + (0.4 + level * 0.5).toFixed(3) + ')');
    }
  }

  // ---- animation pools (allocated once) ----
  const particles: Particle[] = [];
  for (let i = 0; i < MAX_PARTICLES; i++) {
    particles.push({
      alive: false,
      from: 0,
      to: 0,
      t: 0,
      speed: 0,
      color: 0,
      size: 0,
      trailX: new Float32Array(TRAIL_LEN),
      trailY: new Float32Array(TRAIL_LEN),
      head: 0,
      len: 0,
    });
  }
  const pulses: Pulse[] = [];
  for (let i = 0; i < MAX_PULSES; i++) pulses.push({ alive: false, x: 0, y: 0, radius: 0, maxRadius: 0, alpha: 0, color: 0 });
  let glowSprites: HTMLCanvasElement[] = [];
  let densitySprite: HTMLCanvasElement | null = null;

  // ---- loop state ----
  let active = false;
  let rafId: number | null = null;
  let lastFrame = 0;
  let lastSpawn = 0;
  let lastPulse = 0;
  const reducedMotion = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  // ---- hover state ----
  let hoverKey: string | null = null;
  let hoverCountry: LandCountry | null = null;
  let hoverNode = -1;

  // ---- sprites / layout ----

  function makeRadialSprite(cssRadius: number, stops: [number, string][]): HTMLCanvasElement {
    const s = document.createElement('canvas');
    const px = Math.max(2, Math.round(cssRadius * 2 * dpr));
    s.width = px;
    s.height = px;
    const c = s.getContext('2d');
    if (c) {
      const g = c.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
      for (const [at, color] of stops) g.addColorStop(at, color);
      c.fillStyle = g;
      c.fillRect(0, 0, px, px);
    }
    return s;
  }

  function makeSprites() {
    glowSprites = PARTICLE_COLORS.map(color =>
      makeRadialSprite(GLOW_SPRITE / 2, [
        [0, color],
        [0.35, color + '80'],
        [1, color + '00'],
      ]),
    );
    densitySprite = makeRadialSprite(DENSITY_RADIUS, [
      [0, 'rgba(0,255,65,0.16)'],
      [0.5, 'rgba(0,255,65,0.05)'],
      [1, 'rgba(0,255,65,0)'],
    ]);
  }

  function releaseCanvases() {
    landCanvas.width = 0;
    landCanvas.height = 0;
    fxCanvas.width = 0;
    fxCanvas.height = 0;
    glowSprites = [];
    densitySprite = null;
    for (const p of particles) p.alive = false;
    for (const p of pulses) p.alive = false;
    sized = false;
  }

  function projectNodes() {
    for (let i = 0; i < n; i++) {
      sx[i] = ux[i] * fit.scale + fit.tx;
      sy[i] = uy[i] * fit.scale + fit.ty;
    }
    for (const p of particles) p.alive = false;
    for (const p of pulses) p.alive = false;
    // Peers that joined since the last data set announce themselves with a pulse.
    for (const i of joined) spawnPulseAt(i);
    joined.length = 0;
  }

  /** Measure the container, size both canvases, repaint land, re-project nodes. */
  function layout() {
    if (!active || !landCtx || !fxCtx) return;
    const rect = container.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return; // display:none or not laid out yet
    ({ width, height } = rect);
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    fit = fitSphere(width, height, offset, options.fill ?? 'contain');
    particleBudget = width < PHONE_WIDTH ? PHONE_PARTICLES : MAX_PARTICLES;
    pulseBudget = width < PHONE_WIDTH ? PHONE_PULSES : MAX_PULSES;
    const nextSimTarget = width < PHONE_WIDTH ? SIM_TARGET_PHONE : SIM_TARGET;
    if (nextSimTarget !== simTarget) {
      simTarget = nextSimTarget;
      rebuildNodes();
    }
    const pw = Math.round(width * dpr);
    const ph = Math.round(height * dpr);
    if (landCanvas.width !== pw || landCanvas.height !== ph) {
      landCanvas.width = pw;
      landCanvas.height = ph;
      fxCanvas.width = pw;
      fxCanvas.height = ph;
    }
    makeSprites();
    sized = true;
    projectNodes();
    paintLand();
    drawStatic();
  }

  // ---- land layer ----

  function tracePolyline(ctx: CanvasRenderingContext2D, pts: Float32Array) {
    ctx.moveTo(pts[0] * fit.scale + fit.tx, pts[1] * fit.scale + fit.ty);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] * fit.scale + fit.tx, pts[i + 1] * fit.scale + fit.ty);
  }

  function traceCountry(ctx: CanvasRenderingContext2D, c: LandCountry) {
    ctx.beginPath();
    for (const ring of c.rings) {
      tracePolyline(ctx, ring.points);
      ctx.closePath();
    }
  }

  function paintLand() {
    const ctx = landCtx;
    if (!ctx || !sized) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Sphere
    ctx.beginPath();
    tracePolyline(ctx, SPHERE);
    ctx.closePath();
    ctx.fillStyle = '#080a0f';
    ctx.fill();
    ctx.strokeStyle = '#1a2030';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Graticule, 10 degrees
    ctx.beginPath();
    for (let lon = -180; lon <= 180; lon += 10) {
      for (let lat = -90, first = true; lat <= 90; lat += 5, first = false) {
        const [x, y] = projectUnit(lon, lat);
        if (first) ctx.moveTo(x * fit.scale + fit.tx, y * fit.scale + fit.ty);
        else ctx.lineTo(x * fit.scale + fit.tx, y * fit.scale + fit.ty);
      }
    }
    for (let lat = -80; lat <= 80; lat += 10) {
      for (let lon = -180, first = true; lon <= 180; lon += 5, first = false) {
        const [x, y] = projectUnit(lon, lat);
        if (first) ctx.moveTo(x * fit.scale + fit.tx, y * fit.scale + fit.ty);
        else ctx.lineTo(x * fit.scale + fit.tx, y * fit.scale + fit.ty);
      }
    }
    ctx.strokeStyle = 'rgba(74, 158, 255, 0.04)';
    ctx.lineWidth = 0.3;
    ctx.stroke();

    // Country fills from tracker counts
    const scaleMax = counts ? counts.scaleMax : 10;
    for (let i = 0; i < land.countries.length; i++) {
      const c = land.countries[i];
      traceCountry(ctx, c);
      ctx.fillStyle = countryFill(counts ? counts.byCountry[c.id] || 0 : 0, scaleMax, i);
      ctx.fill('evenodd');
    }

    // Borders then coastlines, one path each
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < land.arcs.length; i++) if (!land.isCoast[i]) tracePolyline(ctx, land.arcs[i]);
    ctx.strokeStyle = '#3a4458';
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < land.arcs.length; i++) if (land.isCoast[i]) tracePolyline(ctx, land.arcs[i]);
    ctx.strokeStyle = '#2e3a4d';
    ctx.lineWidth = 0.6;
    ctx.stroke();

    // Density: one soft glow per located node; overlapping glows add up where peers cluster.
    if (densitySprite) {
      const d = DENSITY_RADIUS * 2;
      for (let i = 0; i < n; i++) {
        if (!located[i] || status[i] === STATUS_OFFLINE) continue;
        ctx.drawImage(densitySprite, sx[i] - DENSITY_RADIUS, sy[i] - DENSITY_RADIUS, d, d);
      }
    }
  }

  // ---- fx layer ----

  function drawHover(ctx: CanvasRenderingContext2D) {
    if (hoverCountry) {
      traceCountry(ctx, hoverCountry);
      ctx.strokeStyle = '#00ff41';
      ctx.lineWidth = 1.2;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    if (hoverNode >= 0) {
      ctx.beginPath();
      ctx.arc(sx[hoverNode], sy[hoverNode], 9, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawLinks(ctx: CanvasRenderingContext2D) {
    if (links.length === 0) return;
    ctx.strokeStyle = 'rgba(0, 255, 65, 0.09)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let k = 0; k < links.length; k += 2) {
      const a = links[k];
      const b = links[k + 1];
      const dx = sx[b] - sx[a];
      const dy = sy[b] - sy[a];
      const lift = Math.min(Math.sqrt(dx * dx + dy * dy) * 0.15, 40);
      ctx.moveTo(sx[a], sy[a]);
      ctx.quadraticCurveTo((sx[a] + sx[b]) / 2, (sy[a] + sy[b]) / 2 - lift, sx[b], sy[b]);
    }
    ctx.stroke();
  }

  function drawDots(ctx: CanvasRenderingContext2D, time: number | null) {
    for (let i = 0; i < n; i++) {
      let s = time === null ? 0.5 : 0.5 + 0.5 * Math.sin(time * rate[i] + phase[i]);
      if (i >= simStart) {
        // Simulated dots come and go: their breathing is scaled by a slow life wave.
        const life = time === null ? 0.5 : 0.5 + 0.5 * Math.sin(time * lifeRate[i] + lifePhase[i]);
        if (life < SIM_LIFE_CUTOFF) {
          bucket[i] = 255; // pulsed out: skipped by every fill below
          continue;
        }
        s *= life;
      }
      breath[i] = s;
      bucket[i] = Math.min(ALPHA_BUCKETS - 1, Math.floor(s * ALPHA_BUCKETS));
    }
    for (let st = 0; st < STATUS_RGB.length; st++) {
      for (let b = 0; b < ALPHA_BUCKETS; b++) {
        let any = false;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          if (status[i] !== st || bucket[i] !== b) continue;
          any = true;
          const hr = 4.5 + breath[i] * 2;
          ctx.moveTo(sx[i] + hr, sy[i]);
          ctx.arc(sx[i], sy[i], hr, 0, Math.PI * 2);
        }
        if (!any) continue;
        ctx.fillStyle = haloFill[st][b];
        ctx.fill();
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          if (status[i] !== st || bucket[i] !== b) continue;
          if (st === STATUS_ANCHOR) {
            // Infrastructure anchors are diamonds so they never read as peers.
            const r = 3.5 + breath[i];
            ctx.moveTo(sx[i], sy[i] - r);
            ctx.lineTo(sx[i] + r, sy[i]);
            ctx.lineTo(sx[i], sy[i] + r);
            ctx.lineTo(sx[i] - r, sy[i]);
            ctx.closePath();
          } else {
            const r = 2 + breath[i] * 1.5;
            ctx.moveTo(sx[i] + r, sy[i]);
            ctx.arc(sx[i], sy[i], r, 0, Math.PI * 2);
          }
        }
        ctx.fillStyle = coreFill[st][b];
        ctx.fill();
      }
    }
  }

  function spawnParticle() {
    if (links.length < 2) return;
    const p = particles.find((x, i) => i < particleBudget && !x.alive);
    if (!p) return;
    const k = Math.floor(Math.random() * (links.length / 2)) * 2;
    const flip = Math.random() < 0.5;
    p.alive = true;
    p.from = flip ? links[k + 1] : links[k];
    p.to = flip ? links[k] : links[k + 1];
    p.t = 0;
    p.speed = 0.012 + Math.random() * 0.01;
    p.color = Math.random() > 0.4 ? 0 : 1;
    p.size = 1.5 + Math.random() * 1.5;
    p.head = 0;
    p.len = 0;
  }

  function spawnPulseAt(i: number) {
    const p = pulses.find((x, k) => k < pulseBudget && !x.alive);
    if (!p) return;
    p.alive = true;
    p.x = sx[i];
    p.y = sy[i];
    p.radius = 3;
    p.maxRadius = 16 + Math.random() * 12;
    p.alpha = 0.6;
    p.color = status[i];
  }

  function spawnPulse() {
    if (n === 0) return;
    // Random node, real or simulated; anchors do not pulse.
    const i = Math.floor(Math.random() * n);
    if (i >= anchorStart && i < simStart) return;
    spawnPulseAt(i);
  }

  function drawParticles(ctx: CanvasRenderingContext2D, step: number) {
    for (const p of particles) {
      if (!p.alive) continue;
      p.t += p.speed * step;
      if (p.t >= 1) {
        p.alive = false;
        continue;
      }
      const fx = sx[p.from];
      const fy = sy[p.from];
      const tx = sx[p.to];
      const ty = sy[p.to];
      const dx = tx - fx;
      const dy = ty - fy;
      const cpx = (fx + tx) / 2;
      const cpy = (fy + ty) / 2 - Math.min(Math.sqrt(dx * dx + dy * dy) * 0.15, 40);
      const { t } = p;
      const it = 1 - t;
      const x = it * it * fx + 2 * it * t * cpx + t * t * tx;
      const y = it * it * fy + 2 * it * t * cpy + t * t * ty;
      p.trailX[p.head] = x;
      p.trailY[p.head] = y;
      p.head = (p.head + 1) % TRAIL_LEN;
      if (p.len < TRAIL_LEN) p.len++;

      const color = PARTICLE_COLORS[p.color];
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.14;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.quadraticCurveTo(cpx, cpy, tx, ty);
      ctx.stroke();

      ctx.fillStyle = color;
      for (let k = 0; k < p.len; k++) {
        const idx = (p.head - p.len + k + TRAIL_LEN) % TRAIL_LEN;
        const f = k / p.len;
        ctx.globalAlpha = f * 0.4;
        ctx.beginPath();
        ctx.arc(p.trailX[idx], p.trailY[idx], p.size * f * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 0.9;
      const sprite = glowSprites[p.color];
      const sz = GLOW_SPRITE * (p.size / 2.5);
      if (sprite) ctx.drawImage(sprite, x - sz / 2, y - sz / 2, sz, sz);
      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawPulses(ctx: CanvasRenderingContext2D, step: number) {
    for (const p of pulses) {
      if (!p.alive) continue;
      p.radius += 0.4 * step;
      p.alpha -= 0.012 * step;
      if (p.alpha <= 0 || p.radius >= p.maxRadius) {
        p.alive = false;
        continue;
      }
      ctx.strokeStyle = coreFill[p.color][ALPHA_BUCKETS - 1];
      ctx.lineWidth = 1;
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function clearFx(ctx: CanvasRenderingContext2D) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
  }

  /** One still frame: links, dots at rest, hover highlight. */
  function drawStatic() {
    if (!fxCtx || !sized) return;
    clearFx(fxCtx);
    drawLinks(fxCtx);
    drawDots(fxCtx, null);
    drawHover(fxCtx);
  }

  function animate(time: number) {
    rafId = requestAnimationFrame(animate);
    const dt = time - lastFrame;
    if (dt < FRAME_MS) return;
    const step = Math.min(dt / 16.667, 3);
    lastFrame = time;
    if (!fxCtx || !sized) return;
    clearFx(fxCtx);
    if (time - lastSpawn > 120) {
      spawnParticle();
      lastSpawn = time;
    }
    if (time - lastPulse > 140) {
      spawnPulse();
      lastPulse = time;
    }
    drawLinks(fxCtx);
    drawDots(fxCtx, time);
    drawParticles(fxCtx, step);
    drawPulses(fxCtx, step);
    drawHover(fxCtx);
  }

  function loopShouldRun() {
    return active && sized && n > 0 && document.visibilityState !== 'hidden' && !(reducedMotion && reducedMotion.matches);
  }

  function syncLoop() {
    if (loopShouldRun()) {
      if (rafId === null) rafId = requestAnimationFrame(animate);
      return;
    }
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    drawStatic();
  }

  // ---- hover / tooltip ----

  function setHover(key: string | null, node: number, country: LandCountry | null) {
    if (key === hoverKey) return;
    hoverKey = key;
    hoverNode = node;
    hoverCountry = country;
    if (key === null) {
      tooltip.style.display = 'none';
    } else {
      if (node >= anchorStart && node < simStart) {
        tipTitle.textContent = anchors[node - anchorStart].label;
        tipLabel.textContent = 'Infrastructure';
        tipValue.textContent = 'relay / tracker';
        tipValue.style.color = 'var(--color-text-primary, #e6e8ec)';
      } else if (node >= 0) {
        tipTitle.textContent = labels[node].label;
        tipLabel.textContent = 'Location';
        tipValue.textContent = labels[node].place;
        tipValue.style.color = 'var(--color-text-primary, #e6e8ec)';
      } else if (country) {
        const count = counts ? counts.byCountry[country.id] || 0 : 0;
        tipTitle.textContent = countryName(country.id);
        tipLabel.textContent = 'Active agents';
        tipValue.textContent = counts ? String(count) : 'unavailable';
        tipValue.style.color = count > 0 ? 'var(--color-accent-green, #00ff41)' : 'var(--color-text-tertiary, #505868)';
      }
      tooltip.style.display = 'block';
    }
    if (rafId === null) drawStatic();
  }

  /** Hit-test a canvas-relative point: nearest node within `radius`, else the country under it. */
  function hitTest(mx: number, my: number, radius: number): boolean {
    let best = -1;
    let bestD = radius * radius;
    for (let i = 0; i < simStart; i++) {
      const dx = sx[i] - mx;
      const dy = sy[i] - my;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      setHover('n' + best, best, null);
      return true;
    }
    const id = countryAt(land, (mx - fit.tx) / fit.scale, (my - fit.ty) / fit.scale);
    if (id === null) {
      setHover(null, -1, null);
      return false;
    }
    if (hoverKey !== 'c' + id) setHover('c' + id, -1, land.countries.find(x => x.id === id) ?? null);
    return true;
  }

  function placeTooltip(e: PointerEvent) {
    // Above the finger on touch, beside the cursor with a mouse.
    const dy = e.pointerType === 'touch' ? -72 : 14;
    tooltip.style.transform = 'translate(' + (e.clientX + 14) + 'px,' + (e.clientY + dy) + 'px)';
  }

  // One pointer path for mouse, pen and touch. offsetX/Y are relative to the event target, which
  // is always the fx canvas (overlays are pointer-events: none) and whose CSS box is the container.
  function onPointerMove(e: PointerEvent) {
    if (!sized || e.pointerType === 'touch') return; // a moving finger is a scroll, not a hover
    hitTest(e.offsetX, e.offsetY, HIT_RADIUS);
    placeTooltip(e);
  }

  function onPointerDown(e: PointerEvent) {
    if (!sized || e.pointerType === 'mouse') return;
    // Tap: show the tooltip for the country or peer under the finger; a tap on water dismisses it.
    hitTest(e.offsetX, e.offsetY, HIT_RADIUS_TOUCH);
    placeTooltip(e);
  }

  function onPointerLeave(e: PointerEvent) {
    if (e.pointerType === 'touch') return; // the tooltip stays until the next tap
    setHover(null, -1, null);
  }

  // ---- data ----

  /** Arc links: every located node (real or simulated) to its nearest peers, plus real peers to
   *  their nearest anchor while anchors are in use. Anchors themselves get no peer-peer links. */
  function buildLinks() {
    const out: number[] = [];
    const pick = mulberry32(11);
    const useAnchors = anchorStart < simStart;
    const isAnchor = (i: number) => i >= anchorStart && i < simStart;
    for (let k = 0; k < endpoints.length; k++) {
      const a = endpoints[k];
      if (isAnchor(a)) continue;
      if (useAnchors && a < nPeers) {
        let best = -1;
        let bestD = Infinity;
        for (let j = anchorStart; j < simStart; j++) {
          const d = (ux[j] - ux[a]) ** 2 + (uy[j] - uy[a]) ** 2;
          if (d < bestD) {
            bestD = d;
            best = j;
          }
        }
        if (best >= 0) out.push(a, best);
      }
      // The nearest non-anchor node, each pair once (b > a): the local link every node has.
      let bestB = -1;
      let bestD = Infinity;
      for (let m = 0; m < endpoints.length; m++) {
        const b = endpoints[m];
        if (b <= a || isAnchor(b)) continue;
        const d = (ux[b] - ux[a]) ** 2 + (uy[b] - uy[a]) ** 2;
        if (d < bestD) {
          bestD = d;
          bestB = b;
        }
      }
      if (bestB >= 0) out.push(a, bestB);
      // One node in LONG_LINK_EVERY also reaches another country; a third of those cross an ocean.
      if (k % LONG_LINK_EVERY !== 0) continue;
      const wantFar = (k / LONG_LINK_EVERY) % 3 === 0;
      for (let tries = 0; tries < 16; tries++) {
        const b = endpoints[Math.floor(pick() * endpoints.length)];
        if (b === a || isAnchor(b)) continue;
        const dx = Math.abs(ux[b] - ux[a]);
        const d2 = dx * dx + (uy[b] - uy[a]) ** 2;
        if (d2 < LINK_MIN_D2) continue;
        if (wantFar && dx < LINK_FAR_DX) continue;
        out.push(a, b);
        break;
      }
    }
    links = Uint16Array.from(out);
  }

  /** Node layout: [real peers][anchors in use][simulated peers]. Allocates once per data change. */
  function rebuildNodes() {
    const peers = realPeers;
    nPeers = peers.length;
    labels = peers;
    const locatedActive = peers.filter(p => hasLocation(p) && p.status !== 'offline').length;
    const useAnchors = anchors.length > 0 && locatedActive < minLocatedPeers;
    const simCount = Math.max(0, simTarget - locatedActive);
    anchorStart = nPeers;
    simStart = nPeers + (useAnchors ? anchors.length : 0);
    n = simStart + simCount;
    ux = new Float32Array(n);
    uy = new Float32Array(n);
    sx = new Float32Array(n);
    sy = new Float32Array(n);
    status = new Uint8Array(n);
    located = new Uint8Array(n);
    phase = new Float32Array(n);
    rate = new Float32Array(n);
    breath = new Float32Array(n);
    bucket = new Uint8Array(n);
    lifePhase = new Float32Array(n);
    lifeRate = new Float32Array(n);
    const ends: number[] = [];
    const nextIds = new Set<string>();
    const rand = mulberry32(42);
    let unknown = 0;
    for (let i = 0; i < n; i++) {
      let lon: number;
      let lat: number;
      if (i < nPeers) {
        const p = peers[i];
        nextIds.add(p.id);
        if (prevIds.size > 0 && !prevIds.has(p.id)) joined.push(i);
        const has = hasLocation(p);
        [lon, lat] = has ? [p.lng as number, p.lat as number] : unknownSlot(unknown++);
        status[i] = STATUS_INDEX[p.status] ?? STATUS_OFFLINE;
        located[i] = has ? 1 : 0;
        if (has && p.status !== 'offline') ends.push(i);
      } else if (i < simStart) {
        ({ lng: lon, lat } = anchors[i - anchorStart]);
        status[i] = STATUS_ANCHOR;
        located[i] = 1;
        ends.push(i);
      } else {
        // Simulated: a hub city with a little jitter, online or seeding, never offline.
        const hub = SIM_DRAW[Math.floor(rand() * SIM_DRAW.length)];
        lon = hub[0] + (rand() - 0.5) * 2 * SIM_JITTER_DEG;
        lat = Math.max(-85, Math.min(85, hub[1] + (rand() - 0.5) * 2 * SIM_JITTER_DEG));
        status[i] = rand() < 0.65 ? 0 : 1;
        located[i] = 1;
        ends.push(i);
        lifePhase[i] = rand() * Math.PI * 2;
        lifeRate[i] = 0.00025 + rand() * 0.00035; // one in/out cycle every 18-40 s
      }
      const [x, y] = projectUnit(lon, lat);
      ux[i] = x;
      uy[i] = y;
      phase[i] = ((i * 0.618034) % 1) * Math.PI * 2;
      rate[i] = 0.0011 + ((i * 7) % 10) * 0.00007;
    }
    prevIds = nextIds;
    endpoints = Uint16Array.from(ends);
    buildLinks();
    hoverKey = null;
    hoverNode = -1;
    hoverCountry = null;
    tooltip.style.display = 'none';
  }

  // ---- wiring ----

  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => layout()) : null;
  resizeObserver?.observe(container);
  const onWindowResize = resizeObserver ? null : () => layout();
  if (onWindowResize) window.addEventListener('resize', onWindowResize);
  document.addEventListener('visibilitychange', syncLoop);
  reducedMotion?.addEventListener?.('change', syncLoop);
  fxCanvas.addEventListener('pointermove', onPointerMove);
  fxCanvas.addEventListener('pointerdown', onPointerDown);
  fxCanvas.addEventListener('pointerleave', onPointerLeave);

  // The simulated layer exists from the first frame; real peers replace it as they arrive.
  rebuildNodes();

  return {
    setOffset(next) {
      offset = next;
      layout();
    },
    setData(peers, nextCounts) {
      counts = nextCounts;
      realPeers = peers;
      rebuildNodes();
      if (sized) {
        projectNodes();
        paintLand();
      }
      syncLoop();
    },
    setActive(next) {
      if (next === active) return;
      active = next;
      if (active) layout();
      else releaseCanvases();
      syncLoop();
    },
    destroy() {
      active = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      resizeObserver?.disconnect();
      if (onWindowResize) window.removeEventListener('resize', onWindowResize);
      document.removeEventListener('visibilitychange', syncLoop);
      reducedMotion?.removeEventListener?.('change', syncLoop);
      fxCanvas.removeEventListener('pointermove', onPointerMove);
      fxCanvas.removeEventListener('pointerdown', onPointerDown);
      fxCanvas.removeEventListener('pointerleave', onPointerLeave);
      releaseCanvases();
      n = 0;
      nPeers = 0;
      simStart = 0;
      anchorStart = 0;
      realPeers = [];
      labels = [];
      counts = null;
      prevIds = new Set();
    },
  };
}
