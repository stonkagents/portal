/**
 * Build-time generator for src/components/features/network-map/land.json.
 *
 * Reads world-atlas countries-110m (TopoJSON), projects every arc with the Natural Earth I
 * formula (the same one the runtime uses for peer coordinates, see projection.ts), simplifies
 * each arc (Visvalingam-Whyatt) and writes a compact delta-encoded JSON of shared arcs plus
 * per-country ring references — so nothing from d3 or topojson ships to the browser.
 *
 *   node scripts/build-land-json.mjs          (npm run build:land)
 *
 * Output shape (all coordinates are integers on a Q x Q*ASPECT grid, arcs delta-encoded):
 *   { q, aspect, check: [x, y], arcs: number[][], coast: number[], countries: [{ id, rings: number[][], polys?: number[][] }] }
 *   - rings reference arcs by index; a negative index ~i means arc i reversed (TopoJSON rule).
 *   - polys are explicit delta-encoded rings for the countries that cross the antimeridian.
 *   - coast lists the arcs used by a single country (coastlines); the rest are land borders.
 *   - check is the projected, quantised point (lon 30, lat 40), used by a test to prove the
 *     runtime formula matches the generator.
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const world = require('world-atlas/countries-110m.json');

const Q = 3600; // quantisation grid width
const MIN_AREA = 1.1; // Visvalingam threshold in grid units^2; tuned for < 60 KB output
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'components', 'features', 'network-map', 'land.json');

// ---- Natural Earth I (raw), identical to projection.ts ----
const RAW_HALF_W = Math.PI * 0.8707;
function rawY(phi) {
  const p2 = phi * phi;
  const p4 = p2 * p2;
  return phi * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)));
}
const RAW_HALF_H = rawY(Math.PI / 2);
const RAW_W = RAW_HALF_W * 2;
const ASPECT = (RAW_HALF_H * 2) / RAW_W;
function project(lon, lat) {
  const lambda = (lon * Math.PI) / 180;
  const phi = (lat * Math.PI) / 180;
  const p2 = phi * phi;
  const p4 = p2 * p2;
  const x = lambda * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)));
  const y = rawY(phi);
  return [(x + RAW_HALF_W) / RAW_W, (RAW_HALF_H - y) / RAW_W];
}
const quant = ([x, y]) => [Math.round(x * Q), Math.round(y * Q)];

// ---- Dequantise topology arcs to lon/lat, project, quantise ----
const { scale, translate } = world.transform;
function decodeArc(arc) {
  let x = 0;
  let y = 0;
  return arc.map(([dx, dy]) => {
    x += dx;
    y += dy;
    return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
  });
}

// ---- Visvalingam-Whyatt: drop the point with the smallest triangle area until all >= MIN_AREA.
// Endpoints are kept so shared borders stay stitched. O(n^2) per arc is fine at build time. ----
function triArea(a, b, c) {
  return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
}
function simplify(points) {
  const pts = points.slice();
  for (;;) {
    if (pts.length <= 2) return pts;
    let minIdx = -1;
    let minArea = Infinity;
    for (let i = 1; i < pts.length - 1; i++) {
      const a = triArea(pts[i - 1], pts[i], pts[i + 1]);
      if (a < minArea) {
        minArea = a;
        minIdx = i;
      }
    }
    if (minArea >= MIN_AREA) return pts;
    pts.splice(minIdx, 1);
  }
}

// Drop consecutive duplicates that quantisation produced.
function dedupe(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const l = out[out.length - 1];
    if (p[0] !== l[0] || p[1] !== l[1]) out.push(p);
  }
  return out;
}

function deltaEncode(pts) {
  const flat = [];
  let px = 0;
  let py = 0;
  for (const [x, y] of pts) {
    flat.push(x - px, y - py);
    px = x;
    py = y;
  }
  return flat;
}

// ---- Antimeridian handling. world-atlas rings for Fiji, Russia and Antarctica wrap across
// lon +-180 (d3 clipped them at draw time). Crossing arcs are split for the strokes, and the
// countries that use them get explicit clipped polygons (`polys`) instead of arc references. ----
const lonlatArcs = world.arcs.map(decodeArc);
const crosses = (a, b) => Math.abs(a[0] - b[0]) > 180;
/** Latitude where the segment a->b meets the antimeridian. */
function crossingLat(a, b) {
  const la = a[0] > 0 ? a[0] : a[0] + 360;
  const lb = b[0] > 0 ? b[0] : b[0] + 360;
  // Both points already sit on the antimeridian (the atlas pre-cut the ring there): no interpolation.
  if (Math.abs(lb - la) < 1e-9) return (a[1] + b[1]) / 2;
  const t = (180 - la) / (lb - la);
  return a[1] + (b[1] - a[1]) * t;
}
/** Split a lon/lat polyline at every antimeridian crossing; each piece ends/starts on +-180. */
function splitAtAntimeridian(pts) {
  const pieces = [[pts[0]]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (crosses(a, b)) {
      const lat = crossingLat(a, b);
      const side = a[0] > 0 ? 180 : -180;
      pieces[pieces.length - 1].push([side, lat]);
      pieces.push([[-side, lat]]);
    }
    pieces[pieces.length - 1].push(b);
  }
  return pieces;
}

const crossingArcIdx = new Set();
lonlatArcs.forEach((arc, i) => {
  for (let k = 1; k < arc.length; k++) if (crosses(arc[k - 1], arc[k])) crossingArcIdx.add(i);
});

// Stroke arcs: crossing arcs are replaced by their pieces (first piece in place, rest appended).
const strokeArcs = lonlatArcs.map(a => a);
const appendedCoast = [];
for (const i of crossingArcIdx) {
  const pieces = splitAtAntimeridian(lonlatArcs[i]);
  strokeArcs[i] = pieces[0];
  for (const piece of pieces.slice(1)) {
    appendedCoast.push(strokeArcs.length);
    strokeArcs.push(piece);
  }
}

const toQuantised = pts => simplify(dedupe(pts.map(([lon, lat]) => quant(project(lon, lat)))));
const arcs = strokeArcs.map(a => deltaEncode(toQuantised(a)));

/** Full lon/lat ring from arc references (TopoJSON stitching). */
function stitchRing(refs) {
  const out = [];
  for (const ref of refs) {
    const arc = lonlatArcs[ref < 0 ? ~ref : ref];
    const pts = ref < 0 ? arc.slice().reverse() : arc;
    for (let i = out.length ? 1 : 0; i < pts.length; i++) out.push(pts[i]);
  }
  return out;
}

/** Clip a ring at the antimeridian into polygons that never span the map. */
function clipRing(ring) {
  const pieces = splitAtAntimeridian(ring);
  if (pieces.length === 1) return [ring];
  // The ring is cyclic: the last piece continues into the first.
  const first = pieces.shift();
  pieces[pieces.length - 1].push(...first.slice(1));
  return pieces.map(piece => {
    const start = piece[0];
    const end = piece[piece.length - 1];
    if (start[0] === end[0]) return piece; // both ends on the same meridian: closes along it
    // Ends on opposite meridians: the polygon contains a pole; route the closure through it.
    const pole = (start[1] + end[1]) / 2 < 0 ? -90 : 90;
    return [...piece, [end[0], pole], [start[0], pole]];
  });
}

// Country ring references, straight from the topology (ids are ISO 3166-1 numeric strings).
const countries = [];
const arcUsers = arcs.map(() => new Set());
for (const geom of world.objects.countries.geometries) {
  const polys = geom.type === 'Polygon' ? [geom.arcs] : geom.arcs;
  const rings = [];
  for (const poly of polys) {
    for (const ring of poly) {
      rings.push(ring);
      for (const ref of ring) arcUsers[ref < 0 ? ~ref : ref].add(geom.id ?? geom.properties.name);
    }
  }
  if (!geom.id) continue; // N. Cyprus, Somaliland, Kosovo have no ISO numeric id (still count as arc users)
  const wraps = rings.some(ring => ring.some(ref => crossingArcIdx.has(ref < 0 ? ~ref : ref)));
  if (!wraps) {
    countries.push({ id: geom.id, rings });
    continue;
  }
  const clipped = [];
  for (const ring of rings) for (const piece of clipRing(stitchRing(ring))) clipped.push(deltaEncode(toQuantised(piece)));
  countries.push({ id: geom.id, rings: [], polys: clipped });
}
const coast = [...appendedCoast];
arcUsers.forEach((users, i) => {
  if (users.size === 1) coast.push(i);
});
coast.sort((a, b) => a - b);

const out = { q: Q, aspect: +ASPECT.toFixed(6), check: quant(project(30, 40)), arcs, coast, countries };
const json = JSON.stringify(out);
writeFileSync(OUT, json + '\n');
const points = arcs.reduce((n, a) => n + a.length / 2, 0);
console.log(
  `land.json: ${(json.length / 1024).toFixed(1)} KB, ${arcs.length} arcs (${coast.length} coast), ${points} points, ${countries.length} countries, aspect ${ASPECT.toFixed(4)}`,
);
