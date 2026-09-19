'use client';

/**
 * The agent image control: a drop zone around a file input.
 *
 * The file input stays the control (label, tests, keyboard); the zone around
 * it only adds drag-and-drop and the dragging state. With no image it offers
 * the symbol mark instead; with one, the way back into the studio.
 */

import { useCallback, useState, type DragEvent } from 'react';
import { cn } from '@/lib/utils/cn';
import { ACCEPTED_IMAGE_TYPES } from './form-schema';
import { mono } from './FieldChrome';

interface ImageDropZoneProps {
  /** The current artwork, or null when none is picked yet. */
  imageDataUrl: string | null;
  /** True when the form has flagged the image as missing or rejected. */
  invalid: boolean;
  onPick: (file: File | undefined) => void;
  /** Opens the studio in symbol mode, for a creator with no image. */
  onMakeSymbol: () => void;
  /** Reopens the studio on the picked image. */
  onAdjust: () => void;
}

export function ImageDropZone({ imageDataUrl, invalid, onPick, onMakeSymbol, onAdjust }: ImageDropZoneProps) {
  const [dragging, setDragging] = useState(false);

  const onDragOver = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      if (!dragging) setDragging(true);
    },
    [dragging],
  );
  const onDragLeave = useCallback(() => setDragging(false), []);
  const onDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragging(false);
      onPick(event.dataTransfer?.files?.[0]);
    },
    [onPick],
  );

  return (
    <label
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      data-dragging={dragging ? 'true' : undefined}
      className={cn(
        'group relative flex min-h-[88px] cursor-pointer items-center gap-4 rounded-lg border border-dashed px-4 py-3',
        'transition-colors duration-150 focus-within:border-accent-green focus-within:ring-2 focus-within:ring-accent-green/50',
        invalid
          ? 'border-accent-red bg-bg-input'
          : dragging
            ? 'border-accent-green bg-bg-input'
            : imageDataUrl
              ? 'border-border-hover bg-bg-input hover:border-accent-green'
              : 'border-border-hover bg-bg-input hover:border-accent-green',
      )}
    >
      <input
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        aria-label="Agent image"
        data-testid="image-input"
        onChange={e => onPick(e.target.files?.[0])}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          'flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-bg-tertiary',
          imageDataUrl ? 'border-border-hover' : 'border-border-default',
        )}
      >
        {imageDataUrl ? (
          <img src={imageDataUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className={cn(
              'transition-transform duration-150',
              dragging ? 'text-accent-green -translate-y-0.5' : 'text-text-tertiary group-hover:text-text-secondary',
            )}
          >
            <path d="M12 16V4m0 0-4 4m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" strokeLinecap="round" />
          </svg>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn('text-sm font-medium', dragging ? 'text-accent-green' : 'text-text-primary')}>
          {dragging ? 'Release to use this image' : imageDataUrl ? 'Artwork set' : 'Drop an image here'}
        </span>
        <span className="text-xs text-text-tertiary">
          {imageDataUrl ? 'Click or drop another to replace it.' : 'or click to browse. Square artwork looks best.'}
        </span>
        {!imageDataUrl && (
          <button
            type="button"
            data-testid="artwork-make-symbol"
            onClick={event => {
              event.preventDefault();
              onMakeSymbol();
            }}
            className={cn(
              'inline-flex min-h-11 items-center self-start text-xs text-accent-green underline underline-offset-2',
              'hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green',
            )}
          >
            or make a symbol mark
          </button>
        )}
      </span>
      {imageDataUrl && (
        <button
          type="button"
          data-testid="artwork-adjust"
          onClick={event => {
            event.preventDefault();
            onAdjust();
          }}
          className={cn(
            mono,
            'inline-flex min-h-11 shrink-0 items-center rounded-sm border border-border-default px-3 text-[11px] uppercase tracking-wide',
            'text-accent-green transition-colors duration-150 hover:border-accent-green',
            'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-green',
          )}
        >
          Adjust
        </button>
      )}
      <span
        className={cn(
          mono,
          'hidden shrink-0 rounded-sm border px-2 py-1 text-[11px] uppercase tracking-wide sm:inline-block',
          'border-border-default text-text-secondary transition-colors duration-150 group-hover:border-border-hover group-hover:text-text-primary',
        )}
      >
        {imageDataUrl ? 'Replace' : 'Browse'}
      </span>
    </label>
  );
}
