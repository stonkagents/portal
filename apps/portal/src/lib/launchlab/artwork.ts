/**
 * Token artwork, drawn on a canvas.
 *
 * Two ways to get a square: crop the creator's own image (zoom, focus, finish)
 * or set a one- or two-character monogram on a coloured ground. The maths is pure so
 * the studio's live preview and the exported files are the same drawing; only
 * `renderArtworkSet` / `renderSymbolMarkSet` (and their single-file forms) touch the DOM.
 *
 * Every accepted image leaves here as a set: the 512 px MASTER the metadata points
 * at, and a 128 px THUMB drawn from the same master for every place a logo is
 * shown small. Large sources are reduced in two steps so the downscale stays sharp.
 */

export const ARTWORK_SIZE = 512;
/** Side of the thumbnail; the largest CSS size it is ever shown at is 128 px (64 px at DPR 2). */
export const THUMB_SIZE = 128;
/** WebP quality of the master and of the thumb. */
export const MASTER_QUALITY = 0.9;
export const THUMB_QUALITY = 0.85;
export const MAX_ZOOM = 3;
/** Inset of the type inside a symbol mark, as a share of the side. */
export const SYMBOL_PADDING = 0.12;

/** --color-bg-void and --color-accent-green from globals.css. */
const GROUND = '#080a0f';
const GREEN = '#00ff00';

export type Finish = 'none' | 'neon' | 'duotone' | 'vignette';
export const FINISHES: ReadonlyArray<{ id: Finish; label: string }> = [
  { id: 'none', label: 'None' },
  { id: 'neon', label: 'Neon' },
  { id: 'duotone', label: 'Duotone' },
  { id: 'vignette', label: 'Vignette' },
];

export type Palette = 'void' | 'neon' | 'ember' | 'ice';
export interface PaletteSpec {
  id: Palette;
  label: string;
  /** Top-left and bottom-right of the ground; a flat ground repeats one colour. */
  ground: [string, string];
  ink: string;
}
export const PALETTES: ReadonlyArray<PaletteSpec> = [
  { id: 'void', label: 'Void', ground: [GROUND, GROUND], ink: GREEN },
  { id: 'neon', label: 'Neon', ground: [GREEN, GREEN], ink: GROUND },
  { id: 'ember', label: 'Ember', ground: ['#4a0d0d', '#ff6a00'], ink: '#ffffff' },
  { id: 'ice', label: 'Ice', ground: ['#0b1a3a', '#22d3ee'], ink: '#ffffff' },
];

export interface Size {
  width: number;
  height: number;
}
/** Where the crop window sits inside the image, -1..1 on each axis; 0 is centred. */
export interface Focus {
  x: number;
  y: number;
}
export interface ImageSettings {
  /** 1 covers the square with the short side; up to MAX_ZOOM; below 1 pads to show the whole image. */
  zoom: number;
  focus: Focus;
  finish: Finish;
}
export interface SymbolSettings {
  text: string;
  palette: Palette;
  finish: Finish;
}
export interface StudioSettings {
  mode: 'image' | 'symbol';
  image: ImageSettings;
  symbol: SymbolSettings;
}

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = { zoom: 1, focus: { x: 0, y: 0 }, finish: 'none' };
export const DEFAULT_STUDIO_SETTINGS: StudioSettings = {
  mode: 'image',
  image: DEFAULT_IMAGE_SETTINGS,
  symbol: { text: '', palette: 'void', finish: 'none' },
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The zoom at which the whole image is visible inside the square (≤ 1; exactly 1 for a square). */
export function fitZoom(source: Size): number {
  if (source.width <= 0 || source.height <= 0) return 1;
  return Math.min(source.width, source.height) / Math.max(source.width, source.height);
}

/** A square window over the source, in source pixels. It may reach past the image at fit zooms. */
export interface CropRect {
  sx: number;
  sy: number;
  side: number;
}

function axis(extent: number, side: number, focus: number): number {
  const room = extent - side;
  // A window wider than the image: centred, and the image is padded on both sides.
  if (room <= 0) return room / 2;
  return (room / 2) * (1 + clamp(focus, -1, 1));
}

/**
 * The window a zoom and a focus describe. Zoom is clamped to [fit, MAX_ZOOM]
 * and the window is clamped inside the image, so at zoom ≥ 1 the square is
 * always fully covered.
 */
export function coverCrop(source: Size, zoom: number, focus: Focus): CropRect {
  const z = clamp(zoom, fitZoom(source), MAX_ZOOM);
  const side = Math.min(source.width, source.height) / z;
  return { sx: axis(source.width, side, focus.x), sy: axis(source.height, side, focus.y), side };
}

/** What `drawImage` gets: the source rect clipped to the image, and the destination as a share (0..1) of the square. */
export interface DrawPlan {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

export function drawPlan(source: Size, crop: CropRect): DrawPlan {
  const x0 = Math.max(0, crop.sx);
  const y0 = Math.max(0, crop.sy);
  const x1 = Math.min(source.width, crop.sx + crop.side);
  const y1 = Math.min(source.height, crop.sy + crop.side);
  return {
    sx: x0,
    sy: y0,
    sw: x1 - x0,
    sh: y1 - y0,
    dx: (x0 - crop.sx) / crop.side,
    dy: (y0 - crop.sy) / crop.side,
    dw: (x1 - x0) / crop.side,
    dh: (y1 - y0) / crop.side,
  };
}

/** Moving the picture by a share of the frame moves the focus by this much (per axis; 0 when there is no room). */
export function focusPerFrame(source: Size, crop: CropRect): Focus {
  const room = { x: source.width - crop.side, y: source.height - crop.side };
  return {
    x: room.x > 0 ? (2 * crop.side) / room.x : 0,
    y: room.y > 0 ? (2 * crop.side) / room.y : 0,
  };
}

/**
 * The side of the intermediate canvas a reduction from `sourcePx` to `destPx`
 * goes through, or null when one pass is enough. A single bilinear pass past 2×
 * skips source pixels and aliases; two passes of equal ratio (the geometric mean)
 * keep every pixel in play.
 */
export function intermediateSide(sourcePx: number, destPx: number): number | null {
  if (!(sourcePx > 0) || !(destPx > 0) || sourcePx <= 2 * destPx) return null;
  return Math.round(Math.sqrt(sourcePx * destPx));
}

type DrawSource = CanvasImageSource & { width: number; height: number };

function scratchCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * `drawImage` with a high-quality downscale: one pass up to 2× reduction, and
 * past that a first pass into a scratch canvas at the intermediate size, then
 * the final pass from it. Falls back to one pass when no scratch canvas can be made.
 */
export function drawScaled(
  ctx: CanvasRenderingContext2D,
  source: DrawSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const mid = intermediateSide(Math.max(sw, sh), Math.max(dw, dh));
  if (mid !== null) {
    const scale = mid / Math.max(sw, sh);
    const mw = Math.max(1, Math.round(sw * scale));
    const mh = Math.max(1, Math.round(sh * scale));
    const scratch = scratchCanvas(mw, mh);
    const sctx = scratch?.getContext('2d');
    if (scratch && sctx) {
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(source, sx, sy, sw, sh, 0, 0, mw, mh);
      ctx.drawImage(scratch, 0, 0, mw, mh, dx, dy, dw, dh);
      return;
    }
  }
  ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
}

function paintFinish(ctx: CanvasRenderingContext2D, size: number, finish: Finish): void {
  if (finish === 'none') return;
  ctx.save();
  if (finish === 'duotone') {
    // Grayscale, then black→green, then lift the blacks to the void ground.
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = GREEN;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'lighten';
    ctx.fillStyle = GROUND;
    ctx.fillRect(0, 0, size, size);
  } else {
    const strength = finish === 'vignette' ? 0.7 : 0.45;
    const vignette = ctx.createRadialGradient(size / 2, size / 2, size * 0.35, size / 2, size / 2, size * 0.72);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, `rgba(0,0,0,${strength})`);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, size, size);
    if (finish === 'neon') {
      const rim = ctx.createLinearGradient(0, size, size * 0.6, size * 0.4);
      rim.addColorStop(0, 'rgba(0,255,0,0.28)');
      rim.addColorStop(1, 'rgba(0,255,0,0)');
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = rim;
      ctx.fillRect(0, 0, size, size);
      ctx.globalCompositeOperation = 'source-over';
      const line = size * 0.016;
      ctx.shadowColor = GREEN;
      ctx.shadowBlur = size * 0.05;
      ctx.strokeStyle = 'rgba(0,255,0,0.85)';
      ctx.lineWidth = line;
      ctx.strokeRect(line / 2, line / 2, size - line, size - line);
    }
  }
  ctx.restore();
}

/** Draw the cropped image and its finish into a square context of `size`. */
export function paintArtwork(
  ctx: CanvasRenderingContext2D,
  size: number,
  source: HTMLImageElement | null,
  settings: ImageSettings,
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, size, size);
  if (source && source.width > 0 && source.height > 0) {
    const plan = drawPlan(source, coverCrop(source, settings.zoom, settings.focus));
    drawScaled(ctx, source, plan.sx, plan.sy, plan.sw, plan.sh, plan.dx * size, plan.dy * size, plan.dw * size, plan.dh * size);
  }
  paintFinish(ctx, size, settings.finish);
  ctx.restore();
}

/** A mark is one or two letters or digits: a monogram, so nothing else can be typed into it. */
export const MARK_MAX_CHARS = 2;
const MARK = /^[A-Z0-9]{1,2}$/;

/** Why `text` will not make a symbol mark, or null when it will. */
export function symbolWordsProblem(text: string): string | null {
  const mark = text.trim().toUpperCase();
  if (!mark) return 'Type one or two characters';
  if (mark.length > MARK_MAX_CHARS) return 'Two characters at most';
  if (!MARK.test(mark)) return 'Letters and digits only';
  return null;
}

/** What the symbol field lets through as you type: upper case, letters and digits, two at most. */
export function constrainSymbolInput(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, MARK_MAX_CHARS);
}

/** The mark a symbol draws as one line, or nothing. */
export function symbolWords(text: string): string[] {
  const mark = constrainSymbolInput(text);
  return mark ? [mark] : [];
}

/** The first two characters of the ticker, else the initials of the name's first two words. */
export function defaultSymbolText(symbol: string, name: string): string {
  const ticker = constrainSymbolInput(symbol.replace(/\$/g, ''));
  if (ticker) return ticker;
  return constrainSymbolInput(
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(word => word[0])
      .join(''),
  );
}

const markFont = (px: number) => `700 ${px}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`;

/** The largest font size at which the widest word fits inside the padding, under a per-line cap. */
export function symbolFontPx(ctx: CanvasRenderingContext2D, words: string[], size: number): number {
  const available = size * (1 - 2 * SYMBOL_PADDING);
  const cap = size * (words.length > 1 ? 0.3 : 0.5);
  ctx.font = markFont(100);
  const widest = Math.max(0, ...words.map(word => ctx.measureText(word).width));
  return widest > 0 ? Math.min(cap, (available / widest) * 100) : cap;
}

/** Draw the monogram on a palette ground, then the finish, into a square context of `size`. */
export function paintSymbolMark(ctx: CanvasRenderingContext2D, size: number, settings: SymbolSettings): void {
  const palette = PALETTES.find(p => p.id === settings.palette) ?? PALETTES[0];
  const words = symbolWords(settings.text);
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  if (palette.ground[0] === palette.ground[1]) {
    ctx.fillStyle = palette.ground[0];
  } else {
    const ground = ctx.createLinearGradient(0, 0, size, size);
    ground.addColorStop(0, palette.ground[0]);
    ground.addColorStop(1, palette.ground[1]);
    ctx.fillStyle = ground;
  }
  ctx.fillRect(0, 0, size, size);
  if (words.length > 0) {
    if ('letterSpacing' in ctx) ctx.letterSpacing = '-0.04em';
    const px = symbolFontPx(ctx, words, size);
    ctx.font = markFont(px);
    ctx.fillStyle = palette.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lineHeight = px * 1.04;
    const top = size / 2 - (lineHeight * (words.length - 1)) / 2;
    words.forEach((word, index) => ctx.fillText(word, size / 2, top + index * lineHeight));
  }
  paintFinish(ctx, size, settings.finish);
  ctx.restore();
}

/** The master and its thumbnail, both data URLs (WebP, or PNG where the browser cannot encode WebP). */
export interface ArtworkSet {
  master: string;
  thumb: string;
}

function exportCanvas(canvas: HTMLCanvasElement, quality: number): string | null {
  // Browsers that cannot encode WebP hand back a PNG data URL instead; both are fine.
  const url = canvas.toDataURL('image/webp', quality);
  return typeof url === 'string' && url.startsWith('data:image/') ? url : null;
}

/** Paint the master at `size`, then reduce the same drawing to a THUMB_SIZE thumbnail. */
function withCanvasSet(size: number, paint: (ctx: CanvasRenderingContext2D) => void): ArtworkSet | null {
  const canvas = scratchCanvas(size, size);
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return null;
  paint(ctx);
  const master = exportCanvas(canvas, MASTER_QUALITY);
  if (!master) return null;

  const small = scratchCanvas(THUMB_SIZE, THUMB_SIZE);
  const sctx = small?.getContext('2d');
  if (!small || !sctx) return null;
  drawScaled(sctx, canvas, 0, 0, size, size, 0, 0, THUMB_SIZE, THUMB_SIZE);
  const thumb = exportCanvas(small, THUMB_QUALITY);
  return thumb ? { master, thumb } : null;
}

/** The cropped, finished square as master + thumb, or null when this browser cannot draw it. */
export function renderArtworkSet(source: HTMLImageElement | null, settings: ImageSettings, size = ARTWORK_SIZE): ArtworkSet | null {
  return withCanvasSet(size, ctx => paintArtwork(ctx, size, source, settings));
}

/** The symbol mark as master + thumb, or null when this browser cannot draw it. */
export function renderSymbolMarkSet(settings: SymbolSettings, size = ARTWORK_SIZE): ArtworkSet | null {
  return withCanvasSet(size, ctx => paintSymbolMark(ctx, size, settings));
}

/** The master alone, for callers that only need the file the metadata points at. */
export function renderArtwork(source: HTMLImageElement | null, settings: ImageSettings, size = ARTWORK_SIZE): string | null {
  return renderArtworkSet(source, settings, size)?.master ?? null;
}

/** The symbol mark's master alone. */
export function renderSymbolMark(settings: SymbolSettings, size = ARTWORK_SIZE): string | null {
  return renderSymbolMarkSet(settings, size)?.master ?? null;
}
