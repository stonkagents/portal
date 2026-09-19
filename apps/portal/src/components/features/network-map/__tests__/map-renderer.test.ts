/**
 * Purpose: Renderer lifecycle under jsdom: canvases get backing stores only while active,
 *          the loop runs only with peers on screen, hover allocates no DOM, destroy
 *          releases everything.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import landJson from '../land.json';
import { decodeLand, type LandJson } from '../projection';
import { createMapRenderer, type MapRenderer, type RendererElements } from '../map-renderer';

const land = decodeLand(landJson as LandJson);

/** A 2D context stand-in: every method is a no-op, every property is writable. */
function fakeContext() {
  const calls: string[] = [];
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (target, prop: string) =>
      prop in target
        ? (target as unknown as Record<string, unknown>)[prop]
        : (...args: unknown[]) => {
            calls.push(prop);
            if (prop === 'createRadialGradient') return { addColorStop: () => {} };
            return args.length ? undefined : undefined;
          },
    set: (target, prop: string, value) => {
      (target as unknown as Record<string, unknown>)[prop] = value;
      return true;
    },
  });
}

let observers: { cb: ResizeObserverCallback; disconnect: ReturnType<typeof vi.fn> }[] = [];

function makeElements(): RendererElements {
  const container = document.createElement('div');
  container.getBoundingClientRect = () => ({
    width: 800,
    height: 400,
    top: 0,
    left: 0,
    right: 800,
    bottom: 400,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  const landCanvas = document.createElement('canvas');
  const fxCanvas = document.createElement('canvas');
  const tooltip = document.createElement('div');
  const tipTitle = document.createElement('div');
  const tipLabel = document.createElement('span');
  const tipValue = document.createElement('span');
  tooltip.append(tipTitle, tipLabel, tipValue);
  container.append(landCanvas, fxCanvas, tooltip);
  document.body.appendChild(container);
  return { container, landCanvas, fxCanvas, tooltip, tipTitle, tipLabel, tipValue };
}

describe('createMapRenderer', () => {
  let renderer: MapRenderer | null = null;
  let raf: ReturnType<typeof vi.spyOn>;
  let caf: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    observers = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        disconnect = vi.fn();
        observe = vi.fn();
        unobserve = vi.fn();
        constructor(cb: ResizeObserverCallback) {
          observers.push({ cb, disconnect: this.disconnect });
        }
      },
    );
    HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeContext()) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    caf = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    renderer?.destroy();
    renderer = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  const peers = [
    { id: 'a', lat: 37.77, lng: -122.42, status: 'online' as const, label: 'sf', place: 'San Francisco, United States' },
    { id: 'b', lat: 52.52, lng: 13.41, status: 'seeding' as const, label: 'berlin', place: 'Berlin, Germany' },
    { id: 'c', status: 'online' as const, label: 'nowhere', place: 'Location unknown' },
  ];

  it('sizes canvases only while active and releases them when inactive or destroyed', () => {
    const els = makeElements();
    renderer = createMapRenderer(els, land, { offset: [0, 0], countryName: id => id, anchors: [], minLocatedPeers: 8 });

    renderer.setActive(true);
    expect(els.landCanvas.width).toBe(800 * Math.min(window.devicePixelRatio || 1, 2));
    expect(els.fxCanvas.height).toBe(400 * Math.min(window.devicePixelRatio || 1, 2));

    renderer.setActive(false);
    expect(els.landCanvas.width).toBe(0);
    expect(els.fxCanvas.width).toBe(0);

    renderer.setActive(true);
    expect(els.landCanvas.width).toBeGreaterThan(0);
    renderer.destroy();
    renderer = null;
    expect(els.landCanvas.width).toBe(0);
    expect(observers[0].disconnect).toHaveBeenCalled();
  });

  it('runs the animation loop only while active, and stops it on pause', () => {
    const els = makeElements();
    renderer = createMapRenderer(els, land, { offset: [0, 0], countryName: id => id, anchors: [], minLocatedPeers: 8 });
    expect(raf).not.toHaveBeenCalled();
    renderer.setActive(true); // the simulated layer animates even before any real peer
    expect(raf).toHaveBeenCalledTimes(1);

    renderer.setData(peers, { byCountry: { '840': 1 }, unknown: 1, scaleMax: 10 });
    expect(raf).toHaveBeenCalledTimes(1); // still one loop

    renderer.setActive(false);
    expect(caf).toHaveBeenCalled();
    expect(els.fxCanvas.width).toBe(0);
  });

  it('simulated peers are never hoverable: a pointer on a hub city resolves to the country, not a node', () => {
    const els = makeElements();
    renderer = createMapRenderer(els, land, { offset: [0, 0], countryName: id => `country-${id}`, anchors: [], minLocatedPeers: 8 });
    renderer.setActive(true);
    renderer.setData([], null);
    // Sweep the whole map: no tooltip may ever show a "Location" row (that is a real-peer tooltip).
    for (let x = 20; x <= 780; x += 10) {
      for (let y = 20; y <= 380; y += 10) {
        els.fxCanvas.dispatchEvent(pointer('pointermove', x, y));
        if (els.tooltip.style.display === 'block') expect(els.tipLabel.textContent).toBe('Active agents');
      }
    }
  });

  const pointer = (type: string, x: number, y: number, pointerType = 'mouse') => {
    Object.defineProperty(MouseEvent.prototype, 'offsetX', { configurable: true, get: () => x });
    Object.defineProperty(MouseEvent.prototype, 'offsetY', { configurable: true, get: () => y });
    Object.defineProperty(MouseEvent.prototype, 'pointerType', { configurable: true, get: () => pointerType });
    return new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
  };

  it('tap shows the same tooltip as hover and a tap on water dismisses it', () => {
    const els = makeElements();
    renderer = createMapRenderer(els, land, { offset: [0, 0], countryName: id => `country-${id}`, anchors: [], minLocatedPeers: 8 });
    renderer.setActive(true);
    renderer.setData(peers, { byCountry: { '840': 1 }, unknown: 1, scaleMax: 10 });
    // A finger moving is a scroll: no tooltip.
    els.fxCanvas.dispatchEvent(pointer('pointermove', 430, 200, 'touch'));
    expect(els.tooltip.style.display).not.toBe('block');
    // Tap on land (central Africa on an 800x400 map) shows the country tooltip.
    els.fxCanvas.dispatchEvent(pointer('pointerdown', 430, 230, 'touch'));
    expect(els.tooltip.style.display).toBe('block');
    expect(els.tipTitle.textContent).toMatch(/^country-/);
    // Tap on the South Atlantic dismisses it.
    els.fxCanvas.dispatchEvent(pointer('pointerdown', 330, 300, 'touch'));
    expect(els.tooltip.style.display).toBe('none');
  });

  it('hover updates the existing tooltip without adding DOM nodes', () => {
    const els = makeElements();
    renderer = createMapRenderer(els, land, { offset: [0, 0], countryName: id => `country-${id}`, anchors: [], minLocatedPeers: 8 });
    renderer.setActive(true);
    renderer.setData(peers, { byCountry: { '840': 1 }, unknown: 1, scaleMax: 10 });
    const before = document.body.querySelectorAll('*').length;

    // Middle of the map is Africa/Atlantic; sweep a few points and hit at least one country.
    let sawCountry = false;
    for (let x = 300; x <= 560; x += 20) {
      for (let y = 80; y <= 320; y += 40) {
        els.fxCanvas.dispatchEvent(pointer('pointermove', x, y));
        if (els.tooltip.style.display === 'block' && els.tipTitle.textContent?.startsWith('country-')) sawCountry = true;
      }
    }
    expect(sawCountry).toBe(true);
    expect(els.tipLabel.textContent).toBe('Active agents');
    expect(document.body.querySelectorAll('*').length).toBe(before);

    els.fxCanvas.dispatchEvent(pointer('pointerleave', 0, 0));
    expect(els.tooltip.style.display).toBe('none');
  });
});
