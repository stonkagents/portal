/**
 * Purpose: Natural Earth I projection and the decoder for land.json — the only geometry
 *          code the map needs at runtime (no d3, no topojson). land.json is produced by
 *          scripts/build-land-json.mjs with the same formula, in a unit space where x runs
 *          0..1 across the projected sphere and y runs 0..ASPECT.
 */

/** Height / width of the projected sphere. */
export const ASPECT = 0.52;
const MAP_PADDING = 8;

const RAW_HALF_W = Math.PI * 0.8707;
const RAW_W = RAW_HALF_W * 2;

function rawY(phi: number): number {
  const p2 = phi * phi;
  const p4 = p2 * p2;
  return phi * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)));
}
const RAW_HALF_H = rawY(Math.PI / 2);

/** Project lon/lat (degrees) into unit space: x in [0,1], y in [0, ASPECT], y down. */
export function projectUnit(lon: number, lat: number): [number, number] {
  const lambda = (lon * Math.PI) / 180;
  const phi = (lat * Math.PI) / 180;
  const p2 = phi * phi;
  const p4 = p2 * p2;
  const x = lambda * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)));
  return [(x + RAW_HALF_W) / RAW_W, (RAW_HALF_H - rawY(phi)) / RAW_W];
}

/** Screen transform: unit-space point -> pixels. */
export interface Fit {
  scale: number; // pixels per unit-space x
  tx: number;
  ty: number;
}

/** Fit the sphere into a box with padding, then shift by an optional pixel offset. */
export type Fill = 'contain' | 'cover';

/**
 * Place the unit sphere in a box. `contain` shows the whole world with padding;
 * `cover` fills the box's height as well, cropping the sides on wide boxes, for
 * a backdrop that leaves no empty band above and below.
 */
export function fitSphere(width: number, height: number, offset: readonly [number, number] = [0, 0], fill: Fill = 'contain'): Fit {
  const byWidth = width - MAP_PADDING * 2;
  const byHeight = (height - MAP_PADDING * 2) / ASPECT;
  const scale = Math.max(1, fill === 'cover' ? Math.max(byWidth, byHeight) : Math.min(byWidth, byHeight));
  return { scale, tx: (width - scale) / 2 + offset[0], ty: (height - scale * ASPECT) / 2 + offset[1] };
}

/** The projected sphere outline in unit space (both meridians at +-180). */
export function sphereOutline(steps = 72): Float32Array {
  const pts = new Float32Array((steps + 1) * 4);
  let k = 0;
  for (let i = 0; i <= steps; i++) {
    const lat = -90 + (180 * i) / steps;
    const [x, y] = projectUnit(-180, lat);
    pts[k++] = x;
    pts[k++] = y;
  }
  for (let i = steps; i >= 0; i--) {
    const lat = -90 + (180 * i) / steps;
    const [x, y] = projectUnit(180, lat);
    pts[k++] = x;
    pts[k++] = y;
  }
  return pts;
}

// ---- land.json ----

export interface LandJson {
  q: number;
  aspect: number;
  check: [number, number];
  arcs: number[][];
  /** Indices of arcs that are coastlines (used by one country); the rest are land borders. */
  coast: number[];
  countries: { id: string; rings: number[][]; polys?: number[][] }[];
}

interface LandRing {
  /** Flat [x0, y0, x1, y1, ...] in unit space. */
  points: Float32Array;
  /** Bounding box in unit space, for a cheap hit-test reject. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface LandCountry {
  id: string;
  rings: LandRing[];
}

export interface Land {
  /** Every arc once, as unit-space polylines: used for borders and coastlines. */
  arcs: Float32Array[];
  /** True for arcs[i] that are coastline. */
  isCoast: Uint8Array;
  countries: LandCountry[];
}

/** Decode the delta-encoded arcs and stitch country rings. Runs once per page (module cache). */
export function decodeLand(json: LandJson): Land {
  const inv = 1 / json.q;
  const decode = (flat: number[]): Float32Array => {
    const out = new Float32Array(flat.length);
    let x = 0;
    let y = 0;
    for (let i = 0; i < flat.length; i += 2) {
      x += flat[i];
      y += flat[i + 1];
      out[i] = x * inv;
      out[i + 1] = y * inv;
    }
    return out;
  };
  const toRing = (points: Float32Array): LandRing => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < points.length; i += 2) {
      if (points[i] < minX) minX = points[i];
      if (points[i] > maxX) maxX = points[i];
      if (points[i + 1] < minY) minY = points[i + 1];
      if (points[i + 1] > maxY) maxY = points[i + 1];
    }
    return { points, minX, minY, maxX, maxY };
  };

  const arcs = json.arcs.map(decode);

  const countries = json.countries.map(c => {
    const rings = c.rings.map(refs => {
      const parts: number[] = [];
      for (const ref of refs) {
        const arc = arcs[ref < 0 ? ~ref : ref];
        if (ref < 0) {
          for (let i = arc.length - 2; i >= 0; i -= 2) parts.push(arc[i], arc[i + 1]);
        } else {
          for (let i = 0; i < arc.length; i += 2) parts.push(arc[i], arc[i + 1]);
        }
      }
      return toRing(Float32Array.from(parts));
    });
    for (const poly of c.polys ?? []) rings.push(toRing(decode(poly)));
    return { id: c.id, rings };
  });

  const isCoast = new Uint8Array(arcs.length);
  for (const i of json.coast) isCoast[i] = 1;
  return { arcs, isCoast, countries };
}

/** Even-odd point-in-ring test in unit space. */
function ringContains(ring: LandRing, x: number, y: number): boolean {
  if (x < ring.minX || x > ring.maxX || y < ring.minY || y > ring.maxY) return false;
  const p = ring.points;
  const n = p.length / 2;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[i * 2];
    const yi = p[i * 2 + 1];
    const xj = p[j * 2];
    const yj = p[j * 2 + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Id of the country under a unit-space point, or null over water. Holes (Lesotho inside
 *  South Africa) are rings too, so a point is inside a country when it is in an odd number
 *  of its rings. */
export function countryAt(land: Land, x: number, y: number): string | null {
  for (const c of land.countries) {
    let hits = 0;
    for (const ring of c.rings) if (ringContains(ring, x, y)) hits++;
    if (hits % 2 === 1) return c.id;
  }
  return null;
}
