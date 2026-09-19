/**
 * Purpose: Geometry invariants for the runtime projection and the generated land.json —
 *          the generator (scripts/build-land-json.mjs) and projection.ts must agree, the
 *          file must stay small, and no polyline may jump across the map (antimeridian).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import landJson from '../land.json';
import { ASPECT, countryAt, decodeLand, fitSphere, projectUnit, sphereOutline, type LandJson } from '../projection';
import { ALPHA2_TO_NUMERIC } from '../country-codes';

const json = landJson as LandJson;
const land = decodeLand(json);

/** Largest x jump between consecutive points, ignoring segments that run along a pole line
 *  (y = 0 or y = ASPECT): those are the sphere's own edge, where Antarctica's clipped ring closes. */
function maxXJump(points: Float32Array): number {
  let max = 0;
  for (let i = 2; i < points.length; i += 2) {
    const onPole = (y: number) => Math.abs(y) < 1e-3 || Math.abs(y - ASPECT) < 1e-3;
    if (onPole(points[i - 1]) && onPole(points[i + 1])) continue;
    max = Math.max(max, Math.abs(points[i] - points[i - 2]));
  }
  return max;
}

describe('projectUnit (Natural Earth I)', () => {
  it('maps the origin to the centre of the unit sphere', () => {
    const [x, y] = projectUnit(0, 0);
    expect(x).toBeCloseTo(0.5, 6);
    expect(y).toBeCloseTo(ASPECT / 2, 3);
  });

  it('spans exactly 0..1 in x and 0..ASPECT in y', () => {
    expect(projectUnit(-180, 0)[0]).toBeCloseTo(0, 6);
    expect(projectUnit(180, 0)[0]).toBeCloseTo(1, 6);
    expect(projectUnit(0, 90)[1]).toBeCloseTo(0, 6);
    expect(projectUnit(0, -90)[1]).toBeCloseTo(ASPECT, 3);
  });

  it('agrees with the generator to the quantisation grid (land.json check point)', () => {
    const [x, y] = projectUnit(30, 40);
    expect(Math.round(x * json.q)).toBe(json.check[0]);
    expect(Math.round(y * json.q)).toBe(json.check[1]);
  });

  it('fitSphere centres the sphere in the box and honours the pixel offset', () => {
    const fit = fitSphere(1000, 300, [10, -5]);
    expect(fit.scale).toBeCloseTo((300 - 16) / ASPECT, 6);
    expect(fit.tx).toBeCloseTo((1000 - fit.scale) / 2 + 10, 6);
    expect(fit.ty).toBeCloseTo(8 - 5, 6);
  });

  it('sphere outline stays inside the unit box', () => {
    const pts = sphereOutline();
    for (let i = 0; i < pts.length; i += 2) {
      expect(pts[i]).toBeGreaterThanOrEqual(-1e-6);
      expect(pts[i]).toBeLessThanOrEqual(1 + 1e-6);
      expect(pts[i + 1]).toBeGreaterThanOrEqual(-1e-6);
      expect(pts[i + 1]).toBeLessThanOrEqual(ASPECT + 1e-3);
    }
  });
});

describe('land.json', () => {
  it('stays under the 60 KB budget', () => {
    const bytes = readFileSync(join(__dirname, '..', 'land.json')).length;
    expect(bytes).toBeLessThan(60 * 1024);
  });

  it('decodes every arc and country into the unit box', () => {
    expect(land.arcs.length).toBeGreaterThan(500);
    expect(land.countries.length).toBeGreaterThan(170);
    for (const arc of land.arcs) {
      for (let i = 0; i < arc.length; i += 2) {
        expect(arc[i]).toBeGreaterThanOrEqual(-1e-3);
        expect(arc[i]).toBeLessThanOrEqual(1 + 1e-3);
        expect(arc[i + 1]).toBeGreaterThanOrEqual(-1e-3);
        expect(arc[i + 1]).toBeLessThanOrEqual(ASPECT + 1e-3);
      }
    }
  });

  it('has no polyline that jumps across the map (antimeridian split)', () => {
    for (const arc of land.arcs) expect(maxXJump(arc)).toBeLessThan(0.5);
    for (const c of land.countries) for (const ring of c.rings) expect(maxXJump(ring.points)).toBeLessThan(0.5);
  });

  it('gives every country an ISO alpha-2 code so tracker peers can be matched', () => {
    const numeric = new Set(Object.values(ALPHA2_TO_NUMERIC));
    for (const c of land.countries) expect(numeric.has(c.id), `no alpha-2 for atlas id ${c.id}`).toBe(true);
  });

  it('hit-tests known places to the right country and water to null', () => {
    const at = (lon: number, lat: number) => countryAt(land, ...projectUnit(lon, lat));
    expect(at(-98, 39)).toBe('840'); // Kansas -> United States
    expect(at(10, 51)).toBe('276'); // Germany
    expect(at(78, 22)).toBe('356'); // India
    expect(at(28.3, -29.6)).toBe('426'); // Lesotho (hole in South Africa)
    expect(at(-170, 66)).toBe('643'); // Chukotka, the clipped piece of Russia east of 180
    expect(at(178, -17.8)).toBe('242'); // Fiji, Viti Levu (west of 180)
    expect(at(-179.9, -16.5)).toBe('242'); // Fiji, the sliver east of 180
    expect(at(-77.3, 18.1)).toBe('388'); // Jamaica (small island)
    expect(at(80.7, 7.8)).toBe('144'); // Sri Lanka
    expect(at(138.5, 36.5)).toBe('392'); // Japan, Honshu (multipolygon)
    expect(at(110, -7.3)).toBe('360'); // Indonesia, Java (multipolygon)
    expect(at(0, -60)).toBeNull(); // Southern Ocean
    expect(at(-30, 30)).toBeNull(); // Atlantic
  });
});

describe('fitSphere cover', () => {
  it('fills the height of a wide box and stays centred plus the offset', () => {
    const contain = fitSphere(1440, 844);
    const cover = fitSphere(1440, 844, [220, -30], 'cover');
    expect(cover.scale).toBeGreaterThan(contain.scale);
    expect(cover.scale).toBeGreaterThan(1440);
    expect(cover.tx).toBeCloseTo((1440 - cover.scale) / 2 + 220, 6);
    expect(cover.ty).toBeLessThan(contain.ty);
  });
});
