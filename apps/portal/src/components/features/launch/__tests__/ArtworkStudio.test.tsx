import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MOCK_DATA_URL, mockCanvas } from '@/test/canvas-mock';
import { DEFAULT_STUDIO_SETTINGS, type StudioSettings } from '@/lib/launchlab/artwork';
import { ArtworkStudio } from '../ArtworkStudio';

const WIDE = { width: 1600, height: 900 } as HTMLImageElement;

let ctx: ReturnType<typeof mockCanvas>;
beforeEach(() => {
  ctx = mockCanvas();
});
afterEach(() => vi.restoreAllMocks());

function renderStudio(props: Partial<React.ComponentProps<typeof ArtworkStudio>> = {}) {
  const onApply = vi.fn();
  const onCancel = vi.fn();
  render(
    <ArtworkStudio source={WIDE} initial={DEFAULT_STUDIO_SETTINGS} symbolSeed="HO" onApply={onApply} onCancel={onCancel} {...props} />,
  );
  return { onApply, onCancel };
}

describe('ArtworkStudio', () => {
  it('opens on the image tab, previews the crop on a canvas and applies the export', () => {
    const { onApply } = renderStudio();
    expect(screen.getByTestId('artwork-tab-image')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('artwork-frame').querySelector('canvas')).toBeInTheDocument();
    expect(ctx.drawImage).toHaveBeenCalledWith(WIDE, 350, 0, 900, 900, 0, 0, 512, 512);

    fireEvent.click(screen.getByTestId('artwork-finish-neon'));
    expect(screen.getByTestId('artwork-finish-neon')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('artwork-apply'));
    expect(onApply).toHaveBeenCalledWith({ master: MOCK_DATA_URL, thumb: MOCK_DATA_URL }, expect.objectContaining({ mode: 'image' }));
    const settings = onApply.mock.calls[0][1] as StudioSettings;
    expect(settings.image).toEqual({ zoom: 1, focus: { x: 0, y: 0 }, finish: 'neon' });
  });

  it('zooms between fit and 3×, with Fit and Fill quick buttons', () => {
    const { onApply } = renderStudio();
    const zoom = screen.getByTestId('artwork-zoom');
    expect(zoom).toHaveAttribute('min', '0.5625');
    expect(zoom).toHaveAttribute('max', '3');
    fireEvent.change(zoom, { target: { value: '2' } });
    expect(screen.getByTestId('artwork-zoom-readout')).toHaveTextContent('2.0×');
    expect(ctx.drawImage).toHaveBeenLastCalledWith(WIDE, 575, 225, 450, 450, 0, 0, 512, 512);

    fireEvent.click(screen.getByTestId('artwork-fit'));
    expect(zoom).toHaveValue('0.5625');
    expect(screen.getByTestId('artwork-fit')).toHaveAttribute('aria-pressed', 'true');
    // 1600 → 512 is past 2×, so the whole image goes through a 905×509 scratch first, then lands letterboxed.
    const { calls } = ctx.drawImage.mock;
    expect(calls[calls.length - 2]).toEqual([WIDE, 0, 0, 1600, 900, 0, 0, 905, 509]);
    expect(calls[calls.length - 1].slice(1)).toEqual([0, 0, 905, 509, 0, 112, 512, 288]);

    fireEvent.click(screen.getByTestId('artwork-fill'));
    expect(zoom).toHaveValue('1');
    fireEvent.click(screen.getByTestId('artwork-apply'));
    expect((onApply.mock.calls[0][1] as StudioSettings).image.zoom).toBe(1);
  });

  it('drags the focus with the pointer and nudges it with the arrow keys', () => {
    const { onApply } = renderStudio();
    const frame = screen.getByTestId('artwork-frame');
    frame.getBoundingClientRect = () => ({
      width: 240,
      height: 240,
      left: 0,
      top: 0,
      right: 240,
      bottom: 240,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(frame, { pointerId: 1, clientX: 100, clientY: 100 });
    expect(frame).toHaveAttribute('data-dragging', 'true');
    // A quarter frame to the left: the window moves right by 225 source px, 225/350 of the half range.
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: 40, clientY: 100 });
    fireEvent.pointerUp(frame, { pointerId: 1 });
    expect(frame).not.toHaveAttribute('data-dragging');
    expect(ctx.drawImage).toHaveBeenLastCalledWith(WIDE, 575, 0, 900, 900, 0, 0, 512, 512);

    fireEvent.keyDown(frame, { key: 'ArrowLeft' });
    fireEvent.keyDown(frame, { key: '+' });
    fireEvent.click(screen.getByTestId('artwork-apply'));
    const { image } = onApply.mock.calls[0][1] as StudioSettings;
    expect(image.focus.x).toBeCloseTo(225 / 350 - 0.1);
    expect(image.focus.y).toBe(0);
    expect(image.zoom).toBeCloseTo(1.1);
  });

  it('switches to the symbol mark, seeds the monogram, constrains it and applies the mark', () => {
    const { onApply } = renderStudio();
    fireEvent.click(screen.getByTestId('artwork-tab-symbol'));
    expect(screen.getByTestId('artwork-tab-symbol')).toHaveAttribute('aria-selected', 'true');
    const input = screen.getByTestId('artwork-symbol-input');
    expect(input).toHaveValue('HO');
    expect(input).toHaveAttribute('placeholder', 'SA');
    expect(input).toHaveAttribute('maxlength', '2');
    expect(ctx.fillText).toHaveBeenCalledWith('HO', 256, 256);

    // The field enforces the rule as you type: a third character never lands, punctuation is dropped.
    fireEvent.change(input, { target: { value: 'a b c' } });
    expect(input).toHaveValue('AB');
    fireEvent.change(input, { target: { value: 's-t!' } });
    expect(input).toHaveValue('ST');
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByTestId('artwork-symbol-problem')).toHaveTextContent('Type one or two characters');
    expect(screen.getByTestId('artwork-apply')).toBeDisabled();

    fireEvent.change(input, { target: { value: 'sa' } });
    expect(input).toHaveValue('SA');
    expect(screen.queryByTestId('artwork-symbol-problem')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('artwork-palette-ember'));
    fireEvent.click(screen.getByTestId('artwork-finish-duotone'));
    fireEvent.click(screen.getByTestId('artwork-apply'));
    expect(onApply).toHaveBeenCalledWith(
      { master: MOCK_DATA_URL, thumb: MOCK_DATA_URL },
      {
        mode: 'symbol',
        image: DEFAULT_STUDIO_SETTINGS.image,
        symbol: { text: 'SA', palette: 'ember', finish: 'duotone' },
      },
    );
  });

  it('starts on the symbol tab with the image tab off when there is no image', () => {
    renderStudio({ source: null });
    expect(screen.getByTestId('artwork-tab-symbol')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('artwork-tab-image')).toBeDisabled();
    expect(screen.getByTestId('artwork-symbol-input')).toHaveValue('HO');
  });

  it('reopens on the saved settings', () => {
    renderStudio({
      initial: {
        mode: 'symbol',
        image: { zoom: 2, focus: { x: 1, y: 0 }, finish: 'vignette' },
        symbol: { text: 'ALPHA BETA', palette: 'ice', finish: 'neon' },
      },
    });
    expect(screen.getByTestId('artwork-symbol-input')).toHaveValue('ALPHA BETA');
    expect(screen.getByTestId('artwork-palette-ice')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('artwork-tab-image'));
    expect(screen.getByTestId('artwork-zoom')).toHaveValue('2');
    expect(screen.getByTestId('artwork-finish-vignette')).toHaveAttribute('aria-pressed', 'true');
  });

  it('cancels without applying, and reports when the canvas cannot export', () => {
    const { onApply, onCancel } = renderStudio();
    fireEvent.click(screen.getByTestId('artwork-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);

    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('');
    fireEvent.click(screen.getByTestId('artwork-apply'));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText('Could not render the artwork in this browser.')).toBeInTheDocument();
  });
});
