/**
 * Purpose: Loader behaviour of the public NetworkMap: static placeholder until near the
 *          viewport, one lazily imported renderer that follows on-screen state, a visible
 *          "Map unavailable / Retry" state when the chunk fails, and a HUD fed by the
 *          shared stats hook.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NetworkMapCanvasProps } from '../NetworkMapCanvas';
import type { NetworkMapStats } from '../use-network-map-stats';

const canvasRenders: NetworkMapCanvasProps[] = [];

function MockCanvas(props: NetworkMapCanvasProps) {
  canvasRenders.push(props);
  return <div data-testid="network-map-canvas" data-active={String(props.active)} />;
}

vi.mock('../NetworkMapCanvas', () => ({ NetworkMapCanvas: MockCanvas }));

let onScreen = false;
vi.mock('../use-on-screen', () => ({ useOnScreen: () => onScreen }));

const stats: NetworkMapStats = {
  peers: [],
  live: { onlinePeers: 4, offlinePeers: 2, totalPeers: 6 },
  countries: { byCountry: {}, unknown: 1, scaleMax: 10 },
};
vi.mock('../use-network-map-stats', () => ({ useNetworkMapStats: () => stats }));

async function loadNetworkMap() {
  vi.resetModules();
  const mod = await import('../NetworkMap');
  return mod.NetworkMap;
}

describe('NetworkMap loader', () => {
  beforeEach(() => {
    canvasRenders.length = 0;
    onScreen = false;
    vi.doMock('../NetworkMapCanvas', () => ({ NetworkMapCanvas: MockCanvas }));
  });
  it('shows the static placeholder and imports nothing while off screen', async () => {
    const NetworkMap = await loadNetworkMap();
    render(<NetworkMap variant="card" />);
    expect(screen.getByTestId('network-map-placeholder')).toHaveAttribute('data-state', 'idle');
    await act(async () => {});
    expect(screen.queryByTestId('network-map-canvas')).toBeNull();
    expect(canvasRenders).toHaveLength(0);
  });

  it('mounts one renderer once on screen and follows the on-screen state', async () => {
    const NetworkMap = await loadNetworkMap();
    onScreen = true;
    const { rerender } = render(<NetworkMap variant="card" />);
    const canvas = await screen.findByTestId('network-map-canvas');
    expect(canvas).toHaveAttribute('data-active', 'true');
    expect(screen.queryByTestId('network-map-placeholder')).toBeNull();
    expect(screen.getAllByTestId('network-map-canvas')).toHaveLength(1);

    onScreen = false;
    rerender(<NetworkMap variant="card" />);
    expect(screen.getByTestId('network-map-canvas')).toHaveAttribute('data-active', 'false');
    expect(canvasRenders.at(-1)?.active).toBe(false);
  });

  it('uses the hero offset by default and the given offset when passed', async () => {
    const NetworkMap = await loadNetworkMap();
    onScreen = true;
    render(<NetworkMap variant="hero" />);
    await screen.findByTestId('network-map-canvas');
    expect(canvasRenders.at(-1)?.projectionOffset).toEqual([220, -30]);

    canvasRenders.length = 0;
    render(<NetworkMap variant="hero" projectionOffset={[0, -120]} />);
    await act(async () => {});
    expect(canvasRenders.at(-1)?.projectionOffset).toEqual([0, -120]);
  });

  it('shows "Map unavailable" with Retry when the chunk fails, and recovers on retry', async () => {
    vi.doMock('../NetworkMapCanvas', () => {
      throw new Error('chunk load failed');
    });
    const NetworkMap = await loadNetworkMap();
    onScreen = true;
    render(<NetworkMap variant="card" />);
    const failed = await screen.findByTestId('network-map-unavailable');
    expect(failed).toHaveTextContent('Map unavailable');

    vi.doMock('../NetworkMapCanvas', () => ({ NetworkMapCanvas: MockCanvas }));
    fireEvent.click(screen.getByTestId('network-map-retry'));
    await screen.findByTestId('network-map-canvas');
    expect(screen.queryByTestId('network-map-unavailable')).toBeNull();
  });

  it('renders the hero agent status from tracker data and no stats box', async () => {
    const NetworkMap = await loadNetworkMap();
    onScreen = true;
    const { container } = render(<NetworkMap variant="hero" />);
    await screen.findByTestId('network-map-canvas');
    expect(container.querySelector('#agents-online-count')?.textContent).toContain('4 Agents');
    expect(container.querySelector('#agents-offline-count')?.textContent).toContain('2 Agents');
    expect(container.querySelector('#hero-map-stats')).toBeNull();
    expect(container.querySelector('#hero-map-legend')).toBeNull();
  });

  it('renders the card variant with only the map and the tooltip host', async () => {
    const NetworkMap = await loadNetworkMap();
    onScreen = true;
    const { container } = render(<NetworkMap variant="card" />);
    await screen.findByTestId('network-map-canvas');
    expect(container.querySelector('.map-overlay')).toBeNull();
  });
});
