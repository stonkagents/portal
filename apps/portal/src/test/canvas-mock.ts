/**
 * jsdom has no canvas. This stands in a 2D context whose calls tests can
 * assert on, and a `toDataURL` that returns a fixed data URL.
 */
import { vi } from 'vitest';

export const MOCK_DATA_URL = 'data:image/webp;base64,QUJD';

export function mockCanvas(dataUrl: string = MOCK_DATA_URL) {
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    // Every glyph is 60 units wide at 100px, so the auto-size maths is checkable by hand.
    measureText: vi.fn((text: string) => ({ width: text.length * 60 })),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    strokeStyle: '',
    font: '',
    letterSpacing: '',
    textAlign: '',
    textBaseline: '',
    lineWidth: 0,
    shadowBlur: 0,
    shadowColor: '',
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ctx) as unknown as HTMLCanvasElement['getContext']);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(dataUrl);
  return ctx;
}
