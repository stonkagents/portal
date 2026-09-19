import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOCK_DATA_URL, mockCanvas } from '@/test/canvas-mock';
import {
  ARTWORK_SIZE,
  MASTER_QUALITY,
  MAX_ZOOM,
  SYMBOL_PADDING,
  THUMB_QUALITY,
  THUMB_SIZE,
  coverCrop,
  defaultSymbolText,
  drawPlan,
  drawScaled,
  fitZoom,
  focusPerFrame,
  intermediateSide,
  renderArtwork,
  renderArtworkSet,
  renderSymbolMark,
  renderSymbolMarkSet,
  symbolWords,
  symbolWordsProblem,
  constrainSymbolInput,
} from './artwork';

const WIDE = { width: 1600, height: 900 };
const TALL = { width: 900, height: 1600 };
const SQUARE = { width: 800, height: 800 };

afterEach(() => vi.restoreAllMocks());

describe('fitZoom', () => {
  it('is 1 for a square and short/long otherwise', () => {
    expect(fitZoom(SQUARE)).toBe(1);
    expect(fitZoom(WIDE)).toBeCloseTo(0.5625);
    expect(fitZoom(TALL)).toBeCloseTo(0.5625);
    expect(fitZoom({ width: 0, height: 10 })).toBe(1);
  });
});

describe('coverCrop', () => {
  it('covers with the short side at zoom 1, centred', () => {
    expect(coverCrop(WIDE, 1, { x: 0, y: 0 })).toEqual({ sx: 350, sy: 0, side: 900 });
    expect(coverCrop(TALL, 1, { x: 0, y: 0 })).toEqual({ sx: 0, sy: 350, side: 900 });
  });

  it('moves the window with the focus and never past the edge', () => {
    expect(coverCrop(WIDE, 1, { x: -1, y: 0 }).sx).toBe(0);
    expect(coverCrop(WIDE, 1, { x: 1, y: 0 }).sx).toBe(700);
    expect(coverCrop(WIDE, 1, { x: 4, y: -9 })).toEqual({ sx: 700, sy: 0, side: 900 });
    // No room on the short axis: the focus does nothing there.
    expect(coverCrop(WIDE, 1, { x: 0, y: 1 }).sy).toBe(0);
  });

  it('zooms in around the focus and clamps the zoom to [fit, max]', () => {
    expect(coverCrop(WIDE, 2, { x: 0, y: 0 })).toEqual({ sx: 575, sy: 225, side: 450 });
    expect(coverCrop(WIDE, 2, { x: 1, y: 1 })).toEqual({ sx: 1150, sy: 450, side: 450 });
    expect(coverCrop(WIDE, 99, { x: 0, y: 0 }).side).toBe(900 / MAX_ZOOM);
    // Below fit: the whole image, padded on the short axis.
    expect(coverCrop(WIDE, 0.1, { x: 1, y: 1 })).toEqual({ sx: 0, sy: -350, side: 1600 });
  });
});

describe('drawPlan', () => {
  it('fills the whole square at any zoom ≥ 1 and any focus', () => {
    for (const source of [WIDE, TALL, SQUARE, { width: 37, height: 1201 }]) {
      for (const zoom of [1, 1.3, 2, 3]) {
        for (const focus of [-1, -0.4, 0, 0.7, 1]) {
          const plan = drawPlan(source, coverCrop(source, zoom, { x: focus, y: -focus }));
          expect(plan.dx).toBeCloseTo(0);
          expect(plan.dy).toBeCloseTo(0);
          expect(plan.dw).toBeCloseTo(1);
          expect(plan.dh).toBeCloseTo(1);
          expect(plan.sx).toBeGreaterThanOrEqual(0);
          expect(plan.sy).toBeGreaterThanOrEqual(0);
          expect(plan.sx + plan.sw).toBeLessThanOrEqual(source.width + 1e-9);
          expect(plan.sy + plan.sh).toBeLessThanOrEqual(source.height + 1e-9);
        }
      }
    }
  });

  it('letterboxes at fit, drawing the whole image centred', () => {
    const plan = drawPlan(WIDE, coverCrop(WIDE, fitZoom(WIDE), { x: 0, y: 0 }));
    expect(plan).toEqual({ sx: 0, sy: 0, sw: 1600, sh: 900, dx: 0, dy: 0.21875, dw: 1, dh: 0.5625 });
  });
});

describe('focusPerFrame', () => {
  it('scales a full-frame drag to the room left on each axis', () => {
    const crop = coverCrop(WIDE, 1, { x: 0, y: 0 });
    // Room 700 px on x; the window is 900 px, so one frame width is 900/350 of the focus range.
    expect(focusPerFrame(WIDE, crop)).toEqual({ x: 1800 / 700, y: 0 });
  });
});

describe('symbolWordsProblem', () => {
  it.each([
    ['', 'Type one or two characters'],
    ['   ', 'Type one or two characters'],
    ['abc', 'Two characters at most'],
    ['s-', 'Letters and digits only'],
    ['$S', 'Letters and digits only'],
  ])('rejects %j: %s', (text, reason) => {
    expect(symbolWordsProblem(text)).toBe(reason);
  });

  it.each(['S', ' sa ', 'A1', '42'])('accepts %j', text => {
    expect(symbolWordsProblem(text)).toBeNull();
  });
});

describe('symbolWords / defaultSymbolText', () => {
  it('upper-cases and keeps two characters at most, as one line', () => {
    expect(symbolWords(' sa ')).toEqual(['SA']);
    expect(symbolWords('stonk agent')).toEqual(['ST']);
    expect(symbolWords('')).toEqual([]);
  });

  it("prefers the ticker's first two characters, else the name's initials", () => {
    expect(defaultSymbolText('$hound', 'Signal Hound Deluxe')).toBe('HO');
    expect(defaultSymbolText('', 'Signal Hound Deluxe')).toBe('SH');
    expect(defaultSymbolText('', 'agent')).toBe('A');
    expect(defaultSymbolText('', '')).toBe('');
  });
});

describe('renderArtwork', () => {
  const image = WIDE as HTMLImageElement;

  it('paints the ground, draws the cover crop across the whole square and exports webp', () => {
    const ctx = mockCanvas();
    const url = renderArtwork(image, { zoom: 1, focus: { x: 0, y: 0 }, finish: 'none' });
    expect(url).toBe(MOCK_DATA_URL);
    expect(ctx.fillRect).toHaveBeenNthCalledWith(1, 0, 0, ARTWORK_SIZE, ARTWORK_SIZE);
    expect(ctx.drawImage).toHaveBeenCalledWith(image, 350, 0, 900, 900, 0, 0, ARTWORK_SIZE, ARTWORK_SIZE);
    expect(ctx.createRadialGradient).not.toHaveBeenCalled();
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith('image/webp', 0.9);
  });

  it('letterboxes a fit crop inside the square, through a scratch canvas since 1600 → 512 is past 2×', () => {
    const ctx = mockCanvas();
    renderArtwork(image, { zoom: fitZoom(image), focus: { x: 0, y: 0 }, finish: 'none' });
    expect(ctx.drawImage).toHaveBeenNthCalledWith(1, image, 0, 0, 1600, 900, 0, 0, 905, 509);
    expect(ctx.drawImage.mock.calls[1].slice(1)).toEqual([0, 0, 905, 509, 0, 112, 512, 288]);
  });

  it('applies each finish with the expected compositing', () => {
    const duotone = mockCanvas();
    renderArtwork(image, { zoom: 1, focus: { x: 0, y: 0 }, finish: 'duotone' });
    expect(duotone.fillRect).toHaveBeenCalledTimes(4);
    expect(duotone.strokeRect).not.toHaveBeenCalled();
    vi.restoreAllMocks();

    const vignette = mockCanvas();
    renderArtwork(image, { zoom: 1, focus: { x: 0, y: 0 }, finish: 'vignette' });
    expect(vignette.createRadialGradient).toHaveBeenCalledTimes(1);
    expect(vignette.strokeRect).not.toHaveBeenCalled();
    vi.restoreAllMocks();

    const neon = mockCanvas();
    renderArtwork(image, { zoom: 1, focus: { x: 0, y: 0 }, finish: 'neon' });
    expect(neon.createRadialGradient).toHaveBeenCalledTimes(1);
    expect(neon.createLinearGradient).toHaveBeenCalledTimes(1);
    const line = ARTWORK_SIZE * 0.016;
    expect(neon.strokeRect).toHaveBeenCalledWith(line / 2, line / 2, ARTWORK_SIZE - line, ARTWORK_SIZE - line);
  });

  it('draws only the ground without a source, and returns null when the canvas cannot draw', () => {
    const ctx = mockCanvas();
    expect(renderArtwork(null, { zoom: 1, focus: { x: 0, y: 0 }, finish: 'none' })).toBe(MOCK_DATA_URL);
    // The only drawImage calls are the thumb reducing the master canvas; the missing source is never drawn.
    expect(ctx.drawImage.mock.calls.every(call => call[0] instanceof HTMLCanvasElement)).toBe(true);
    vi.restoreAllMocks();

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => null) as unknown as HTMLCanvasElement['getContext']);
    expect(renderArtwork(image, { zoom: 1, focus: { x: 0, y: 0 }, finish: 'none' })).toBeNull();
  });
});

describe('renderSymbolMark', () => {
  const available = ARTWORK_SIZE * (1 - 2 * SYMBOL_PADDING);

  it('sizes the type so the mark fits inside the padding on one line', () => {
    const ctx = mockCanvas();
    expect(renderSymbolMark({ text: 'sa', palette: 'void', finish: 'none' })).toBe(MOCK_DATA_URL);
    // 'SA' measures 120 at 100px; the cap for one line is 0.5 × 512.
    const px = Math.min(ARTWORK_SIZE * 0.5, (available / 120) * 100);
    expect(ctx.font).toContain(`700 ${px}px`);
    expect((px / 100) * 120).toBeLessThanOrEqual(available);
    expect(ctx.fillText).toHaveBeenCalledTimes(1);
    expect(ctx.fillText).toHaveBeenCalledWith('SA', ARTWORK_SIZE / 2, ARTWORK_SIZE / 2);
    expect(ctx.fillStyle).toBe('#00ff00');
    expect(ctx.letterSpacing).toBe('-0.04em');
  });

  it('caps a single character and centres it', () => {
    const ctx = mockCanvas();
    renderSymbolMark({ text: 'A', palette: 'neon', finish: 'none' });
    expect(ctx.font).toContain(`700 ${ARTWORK_SIZE * 0.5}px`);
    expect(ctx.fillText).toHaveBeenCalledWith('A', ARTWORK_SIZE / 2, ARTWORK_SIZE / 2);
    expect(ctx.fillStyle).toBe('#080a0f');
  });

  it('uses a gradient ground for ember and ice, then the finish', () => {
    const ctx = mockCanvas();
    const inks: unknown[] = [];
    ctx.fillText.mockImplementation(() => inks.push(ctx.fillStyle));
    renderSymbolMark({ text: 'HO', palette: 'ember', finish: 'vignette' });
    expect(ctx.createLinearGradient).toHaveBeenCalledWith(0, 0, ARTWORK_SIZE, ARTWORK_SIZE);
    expect(ctx.createRadialGradient).toHaveBeenCalledTimes(1);
    expect(inks).toEqual(['#ffffff']);
  });
});

describe('constrainSymbolInput', () => {
  it('upper-cases, drops anything but letters and digits, and keeps two characters at most', () => {
    expect(constrainSymbolInput('sa')).toBe('SA');
    expect(constrainSymbolInput('s-a!')).toBe('SA');
    expect(constrainSymbolInput('stonk agent')).toBe('ST');
    expect(constrainSymbolInput('$1 x')).toBe('1X');
    expect(constrainSymbolInput('   ')).toBe('');
  });
});

describe('intermediateSide', () => {
  it('is null up to a 2× reduction and the geometric mean past it', () => {
    expect(intermediateSide(512, 512)).toBeNull();
    expect(intermediateSide(900, 512)).toBeNull();
    expect(intermediateSide(1024, 512)).toBeNull();
    expect(intermediateSide(1025, 512)).toBe(724);
    expect(intermediateSide(4000, 512)).toBe(1431);
    expect(intermediateSide(512, 128)).toBe(256);
    expect(intermediateSide(0, 128)).toBeNull();
    expect(intermediateSide(512, 0)).toBeNull();
  });
});

describe('drawScaled', () => {
  const big = { width: 4000, height: 4000 } as HTMLImageElement;

  it('draws in one pass when the reduction is 2× or less', () => {
    const ctx = mockCanvas();
    drawScaled(ctx as unknown as CanvasRenderingContext2D, WIDE as HTMLImageElement, 350, 0, 900, 900, 0, 0, 512, 512);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(ctx.drawImage).toHaveBeenCalledWith(WIDE, 350, 0, 900, 900, 0, 0, 512, 512);
    expect(ctx.imageSmoothingQuality).toBe('high');
    expect(ctx.imageSmoothingEnabled).toBe(true);
  });

  it('goes through a scratch canvas at the geometric mean when the source is more than 2× larger', () => {
    const ctx = mockCanvas();
    drawScaled(ctx as unknown as CanvasRenderingContext2D, big, 0, 0, 4000, 4000, 0, 0, 512, 512);
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
    // First pass: the whole crop into the 1431 px scratch; second: the scratch into the target.
    expect(ctx.drawImage).toHaveBeenNthCalledWith(1, big, 0, 0, 4000, 4000, 0, 0, 1431, 1431);
    const [scratch, ...rest] = ctx.drawImage.mock.calls[1];
    expect(scratch).toBeInstanceOf(HTMLCanvasElement);
    expect([(scratch as HTMLCanvasElement).width, (scratch as HTMLCanvasElement).height]).toEqual([1431, 1431]);
    expect(rest).toEqual([0, 0, 1431, 1431, 0, 0, 512, 512]);
  });

  it('keeps the crop aspect in the scratch canvas for a letterboxed draw', () => {
    const ctx = mockCanvas();
    const wide = { width: 3200, height: 1800 } as HTMLImageElement;
    // Fit zoom of a 3200×1800: the whole image lands in 512×288.
    drawScaled(ctx as unknown as CanvasRenderingContext2D, wide, 0, 0, 3200, 1800, 0, 112, 512, 288);
    const mid = intermediateSide(3200, 512)!;
    expect(ctx.drawImage).toHaveBeenNthCalledWith(1, wide, 0, 0, 3200, 1800, 0, 0, mid, Math.round(1800 * (mid / 3200)));
    expect(ctx.drawImage.mock.calls[1].slice(1)).toEqual([0, 0, mid, Math.round(1800 * (mid / 3200)), 0, 112, 512, 288]);
  });

  it('falls back to one pass when no scratch context is available', () => {
    const ctx = mockCanvas();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => null) as unknown as HTMLCanvasElement['getContext']);
    drawScaled(ctx as unknown as CanvasRenderingContext2D, big, 0, 0, 4000, 4000, 0, 0, 512, 512);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(ctx.drawImage).toHaveBeenCalledWith(big, 0, 0, 4000, 4000, 0, 0, 512, 512);
  });
});

describe('renderArtworkSet / renderSymbolMarkSet', () => {
  const image = WIDE as HTMLImageElement;
  const settings = { zoom: 1, focus: { x: 0, y: 0 }, finish: 'none' as const };

  it('exports the 512 master at 0.9 and a 128 thumb at 0.85 reduced from the master in two steps', () => {
    const ctx = mockCanvas();
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (
      this: HTMLCanvasElement,
      _type,
      quality,
    ) {
      return `data:image/webp;base64,${this.width}x${this.height}@${quality}`;
    });
    const set = renderArtworkSet(image, settings);
    expect(set).toEqual({
      master: `data:image/webp;base64,${ARTWORK_SIZE}x${ARTWORK_SIZE}@${MASTER_QUALITY}`,
      thumb: `data:image/webp;base64,${THUMB_SIZE}x${THUMB_SIZE}@${THUMB_QUALITY}`,
    });
    expect(toDataURL).toHaveBeenCalledTimes(2);

    // Master: the source crop in one pass (900 → 512 is under 2×). Thumb: 512 → 256 → 128.
    const { calls } = ctx.drawImage.mock;
    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual([image, 350, 0, 900, 900, 0, 0, ARTWORK_SIZE, ARTWORK_SIZE]);
    expect(calls[1][0]).toBeInstanceOf(HTMLCanvasElement);
    expect((calls[1][0] as HTMLCanvasElement).width).toBe(ARTWORK_SIZE);
    expect(calls[1].slice(1)).toEqual([0, 0, ARTWORK_SIZE, ARTWORK_SIZE, 0, 0, 256, 256]);
    expect((calls[2][0] as HTMLCanvasElement).width).toBe(256);
    expect(calls[2].slice(1)).toEqual([0, 0, 256, 256, 0, 0, THUMB_SIZE, THUMB_SIZE]);
  });

  it('reduces a large source in two steps for the master and still thumbs from the master', () => {
    const ctx = mockCanvas();
    const big = { width: 4000, height: 4000 } as HTMLImageElement;
    renderArtworkSet(big, settings);
    const { calls } = ctx.drawImage.mock;
    expect(calls).toHaveLength(4);
    expect(calls[0]).toEqual([big, 0, 0, 4000, 4000, 0, 0, 1431, 1431]);
    expect(calls[1].slice(1)).toEqual([0, 0, 1431, 1431, 0, 0, ARTWORK_SIZE, ARTWORK_SIZE]);
    expect(calls[3].slice(1)).toEqual([0, 0, 256, 256, 0, 0, THUMB_SIZE, THUMB_SIZE]);
  });

  it('thumbs the symbol mark from its master too, and is null when a canvas cannot export', () => {
    const ctx = mockCanvas();
    expect(renderSymbolMarkSet({ text: 'HO', palette: 'void', finish: 'none' })).toEqual({
      master: MOCK_DATA_URL,
      thumb: MOCK_DATA_URL,
    });
    expect(ctx.fillText).toHaveBeenCalledTimes(1);
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
    expect(renderSymbolMark({ text: 'HO', palette: 'void', finish: 'none' })).toBe(MOCK_DATA_URL);
    vi.restoreAllMocks();

    mockCanvas('');
    expect(renderArtworkSet(image, settings)).toBeNull();
    expect(renderSymbolMarkSet({ text: 'HO', palette: 'void', finish: 'none' })).toBeNull();
  });
});
