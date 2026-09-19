'use client';

/**
 * The artwork studio: an inline panel under the image drop zone.
 *
 * "Your image" crops the creator's picture to a square: drag to set the focus,
 * a zoom slider, Fit / Fill, and a finish. "Symbol mark" draws a one- or
 * two-character monogram on a palette ground instead. Both preview on a canvas through the same
 * painters that export the 512 px file, so what is shown is what is uploaded.
 */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import {
  ARTWORK_SIZE,
  FINISHES,
  MAX_ZOOM,
  PALETTES,
  coverCrop,
  fitZoom,
  focusPerFrame,
  paintArtwork,
  paintSymbolMark,
  renderArtworkSet,
  renderSymbolMarkSet,
  symbolWordsProblem,
  type ArtworkSet,
  type Finish,
  type ImageSettings,
  type Palette,
  type StudioSettings,
  type SymbolSettings,
  constrainSymbolInput,
} from '@/lib/launchlab/artwork';
import { FieldNote, controlClass, mono } from './FieldChrome';
import './artwork-studio.css';

export interface ArtworkStudioProps {
  /** The picked image, or null when there is none yet (the image tab is then off). */
  source: HTMLImageElement | null;
  initial: StudioSettings;
  /** Characters for a fresh mark: the ticker's first two, or the name's initials. */
  symbolSeed: string;
  /** The exported master + thumb, and the settings that drew them. */
  onApply: (artwork: ArtworkSet, settings: StudioSettings) => void;
  onCancel: () => void;
}

const FOCUS_STEP = 0.1;
const ZOOM_STEP = 0.1;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const focusRing = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-green';
const pickerLabel = cn(mono, 'text-[10px] uppercase tracking-[0.12em] text-text-tertiary');

function SwatchButton({
  pressed,
  label,
  testId,
  onClick,
  children,
}: {
  pressed: boolean;
  label: string;
  testId: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-md border px-1 py-1.5 transition-colors duration-150',
        pressed ? 'border-accent-green bg-accent-green/10' : 'border-transparent hover:border-border-hover',
        focusRing,
      )}
    >
      {children}
      <span className={cn(mono, 'text-[10px] uppercase tracking-wide', pressed ? 'text-accent-green' : 'text-text-tertiary')}>
        {label}
      </span>
    </button>
  );
}

function FinishPicker({ value, onChange }: { value: Finish; onChange: (finish: Finish) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className={pickerLabel}>Finish</p>
      <div className="flex gap-1" role="group" aria-label="Finish">
        {FINISHES.map(finish => (
          <SwatchButton
            key={finish.id}
            pressed={value === finish.id}
            label={finish.label}
            testId={`artwork-finish-${finish.id}`}
            onClick={() => onChange(finish.id)}
          >
            <span aria-hidden="true" className={cn('artwork-swatch', `artwork-swatch--${finish.id}`)} />
          </SwatchButton>
        ))}
      </div>
    </div>
  );
}

function PalettePicker({ value, onChange }: { value: Palette; onChange: (palette: Palette) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className={pickerLabel}>Palette</p>
      <div className="flex gap-1" role="group" aria-label="Palette">
        {PALETTES.map(palette => (
          <SwatchButton
            key={palette.id}
            pressed={value === palette.id}
            label={palette.label}
            testId={`artwork-palette-${palette.id}`}
            onClick={() => onChange(palette.id)}
          >
            <span
              aria-hidden="true"
              className="artwork-swatch flex items-center justify-center text-[13px] font-bold leading-none"
              style={{
                background: `linear-gradient(135deg, ${palette.ground[0]}, ${palette.ground[1]})`,
                color: palette.ink,
              }}
            >
              A
            </span>
          </SwatchButton>
        ))}
      </div>
    </div>
  );
}

export function ArtworkStudio({ source, initial, symbolSeed, onApply, onCancel }: ArtworkStudioProps) {
  const [mode, setMode] = useState<StudioSettings['mode']>(source ? initial.mode : 'symbol');
  const [image, setImage] = useState<ImageSettings>(initial.image);
  const [symbol, setSymbol] = useState<SymbolSettings>(() => ({ ...initial.symbol, text: initial.symbol.text || symbolSeed }));
  const [dragging, setDragging] = useState(false);
  const [renderFailed, setRenderFailed] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; focus: ImageSettings['focus'] } | null>(null);

  const fit = source ? fitZoom(source) : 1;
  const symbolProblem = symbolWordsProblem(symbol.text);

  // The preview is the export at preview size: one painter for both.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    if (mode === 'image') paintArtwork(ctx, ARTWORK_SIZE, source, image);
    else paintSymbolMark(ctx, ARTWORK_SIZE, symbol);
  }, [mode, source, image, symbol]);

  const setZoom = useCallback((zoom: number) => setImage(prev => ({ ...prev, zoom: clamp(zoom, fit, MAX_ZOOM) })), [fit]);
  const nudgeFocus = useCallback(
    (dx: number, dy: number) =>
      setImage(prev => ({ ...prev, focus: { x: clamp(prev.focus.x + dx, -1, 1), y: clamp(prev.focus.y + dy, -1, 1) } })),
    [],
  );

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!source) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, focus: image.focus };
    setDragging(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !source || drag.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const per = focusPerFrame(source, coverCrop(source, image.zoom, drag.focus));
    // Dragging the picture right moves the window left over the source.
    const x = clamp(drag.focus.x - ((event.clientX - drag.x) / rect.width) * per.x, -1, 1);
    const y = clamp(drag.focus.y - ((event.clientY - drag.y) / rect.height) * per.y, -1, 1);
    setImage(prev => ({ ...prev, focus: { x, y } }));
  };
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
  };
  const onFrameKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-FOCUS_STEP, 0],
      ArrowRight: [FOCUS_STEP, 0],
      ArrowUp: [0, -FOCUS_STEP],
      ArrowDown: [0, FOCUS_STEP],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      nudgeFocus(move[0], move[1]);
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      setZoom(image.zoom + ZOOM_STEP);
    } else if (event.key === '-') {
      event.preventDefault();
      setZoom(image.zoom - ZOOM_STEP);
    }
  };

  const apply = () => {
    const artwork =
      mode === 'image' ? (source ? renderArtworkSet(source, image) : null) : symbolProblem ? null : renderSymbolMarkSet(symbol);
    if (!artwork) {
      setRenderFailed(true);
      return;
    }
    onApply(artwork, { mode, image, symbol });
  };

  const canApply = mode === 'image' ? Boolean(source) : !symbolProblem;
  const atFit = Math.abs(image.zoom - fit) < 1e-6;
  const atFill = Math.abs(image.zoom - 1) < 1e-6 && image.focus.x === 0 && image.focus.y === 0;
  const zoomFill = MAX_ZOOM > fit ? ((image.zoom - fit) / (MAX_ZOOM - fit)) * 100 : 0;
  const quick = (pressed: boolean) =>
    cn(
      mono,
      'min-h-11 flex-1 rounded-md border px-3 text-[11px] uppercase tracking-wide transition-colors duration-150',
      pressed
        ? 'border-accent-green text-accent-green'
        : 'border-border-default text-text-secondary hover:border-border-hover hover:text-text-primary',
      focusRing,
    );

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border-default bg-bg-secondary p-4" data-testid="artwork-studio">
      <div role="tablist" aria-label="Artwork source" className="flex h-11 rounded-md border border-border-default bg-bg-input p-0.5">
        {(
          [
            ['image', 'Your image', 'artwork-tab-image'],
            ['symbol', 'Symbol mark', 'artwork-tab-symbol'],
          ] as const
        ).map(([id, label, testId]) => {
          const selected = mode === id;
          const off = id === 'image' && !source;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`artwork-panel-${id}`}
              disabled={off}
              data-testid={testId}
              onClick={() => setMode(id)}
              className={cn(
                mono,
                'flex-1 rounded-sm text-[11px] uppercase tracking-wide transition-colors duration-150',
                selected ? 'bg-accent-green font-semibold text-black' : 'text-text-secondary hover:text-text-primary',
                'disabled:pointer-events-none disabled:opacity-30',
                focusRing,
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div id={`artwork-panel-${mode}`} role="tabpanel" className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {mode === 'image' ? (
          <div
            role="img"
            aria-label="Artwork frame. Drag to move the focus; arrow keys nudge it, plus and minus zoom."
            tabIndex={0}
            data-testid="artwork-frame"
            data-dragging={dragging ? 'true' : undefined}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={onFrameKeyDown}
            className={cn(
              'artwork-frame relative mx-auto aspect-square w-full max-w-[280px] shrink-0 overflow-hidden rounded-md border border-border-hover bg-bg-void sm:mx-0 sm:w-60',
              'focus-visible:outline-2 focus-visible:outline-accent-green',
            )}
          >
            <canvas ref={canvasRef} width={ARTWORK_SIZE} height={ARTWORK_SIZE} className="block h-full w-full" />
            <div aria-hidden="true" className="artwork-grid pointer-events-none absolute inset-0" />
          </div>
        ) : (
          <div
            className="relative mx-auto aspect-square w-full max-w-[280px] shrink-0 overflow-hidden rounded-md border border-border-hover bg-bg-void sm:mx-0 sm:w-60"
            data-testid="artwork-frame"
          >
            <canvas ref={canvasRef} width={ARTWORK_SIZE} height={ARTWORK_SIZE} className="block h-full w-full" />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {mode === 'image' ? (
            <>
              <div className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between">
                  <p className={pickerLabel}>Zoom</p>
                  <p className={cn(mono, 'text-[11px] text-text-secondary')} data-testid="artwork-zoom-readout">
                    {image.zoom.toFixed(1)}×
                  </p>
                </div>
                <input
                  type="range"
                  min={fit}
                  max={MAX_ZOOM}
                  step={0.01}
                  value={image.zoom}
                  aria-label="Zoom"
                  data-testid="artwork-zoom"
                  onChange={e => setZoom(Number(e.target.value))}
                  className="artwork-zoom"
                  style={{ '--artwork-fill': `${zoomFill}%` } as React.CSSProperties}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    aria-pressed={atFit}
                    data-testid="artwork-fit"
                    onClick={() => setImage(prev => ({ ...prev, zoom: fit, focus: { x: 0, y: 0 } }))}
                    className={quick(atFit)}
                  >
                    Fit
                  </button>
                  <button
                    type="button"
                    aria-pressed={atFill}
                    data-testid="artwork-fill"
                    onClick={() => setImage(prev => ({ ...prev, zoom: 1, focus: { x: 0, y: 0 } }))}
                    className={quick(atFill)}
                  >
                    Fill
                  </button>
                </div>
              </div>
              <FinishPicker value={image.finish} onChange={finish => setImage(prev => ({ ...prev, finish }))} />
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="artwork-symbol-input" className={pickerLabel}>
                  Letters
                </label>
                <input
                  id="artwork-symbol-input"
                  type="text"
                  value={symbol.text}
                  placeholder="SA"
                  maxLength={2}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-invalid={symbolProblem ? 'true' : undefined}
                  data-testid="artwork-symbol-input"
                  onChange={e => setSymbol(prev => ({ ...prev, text: constrainSymbolInput(e.target.value) }))}
                  className={cn(controlClass(Boolean(symbolProblem)), mono, 'h-11 px-3 uppercase tracking-wide')}
                />
                {symbolProblem && (
                  <FieldNote tone="error" data-testid="artwork-symbol-problem">
                    {symbolProblem}
                  </FieldNote>
                )}
              </div>
              <PalettePicker value={symbol.palette} onChange={palette => setSymbol(prev => ({ ...prev, palette }))} />
              <FinishPicker value={symbol.finish} onChange={finish => setSymbol(prev => ({ ...prev, finish }))} />
            </>
          )}
        </div>
      </div>

      {renderFailed && <FieldNote tone="error">Could not render the artwork in this browser.</FieldNote>}

      <div className="flex gap-2">
        <Button type="button" onClick={apply} disabled={!canApply} data-testid="artwork-apply" className="flex-1">
          Use this
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} data-testid="artwork-cancel">
          Cancel
        </Button>
      </div>
    </div>
  );
}
