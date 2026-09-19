/**
 * Purpose: Public network map. Owns the sized container, the hero's agent status
 *          overlay (React-rendered from tracker data) and the lifecycle: a static placeholder until the map is near the
 *          viewport, then one lazily imported canvas renderer that is paused off screen and
 *          destroyed on unmount. A failed chunk load shows "Map unavailable" with Retry.
 */
'use client';

import type { Fill } from './projection';
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { cn } from '@/lib/utils/cn';
import type { NetworkMapCanvasProps } from './NetworkMapCanvas';
import { NetworkMapPlaceholder } from './NetworkMapPlaceholder';
import { useOnScreen } from './use-on-screen';
import { useNetworkMapStats, type MapLiveStats } from './use-network-map-stats';
import './network-map.css';

export interface NetworkMapProps {
  /** "card" for gallery/dashboard, "hero" for landing page background */
  variant: 'card' | 'hero';
  /** Extra class on the outermost wrapper (e.g. "network-map-home") */
  className?: string;
  /** Pixel offset [dx, dy] for the projection centre (hero only by default) */
  projectionOffset?: [number, number];
  /** `cover` fills the box's height (hero on desktop); default `contain` for the card and phones. */
  fill?: Fill;
}

type CanvasComponent = ComponentType<NetworkMapCanvasProps>;
type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/** The renderer chunk is imported once per page; later mounts reuse it. */
let loadedCanvas: CanvasComponent | null = null;

const HERO_OFFSET: [number, number] = [220, -30];
const CARD_OFFSET: [number, number] = [0, 0];

export function NetworkMap({ variant, className, projectionOffset, fill = 'contain' }: NetworkMapProps) {
  const isHero = variant === 'hero';
  const idPrefix = isHero ? 'hero-' : '';
  const ref = useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(ref);
  // Lazy initialiser: a component is a function, and useState(fn) would call it.
  const [Canvas, setCanvas] = useState<CanvasComponent | null>(() => loadedCanvas);
  const [status, setStatus] = useState<LoadStatus>(loadedCanvas ? 'ready' : 'idle');
  const [attempt, setAttempt] = useState(0);
  const stats = useNetworkMapStats();

  const dx = projectionOffset?.[0];
  const dy = projectionOffset?.[1];
  const offset = useMemo<[number, number]>(
    () => (dx !== undefined && dy !== undefined ? [dx, dy] : isHero ? HERO_OFFSET : CARD_OFFSET),
    [dx, dy, isHero],
  );

  // Import the renderer the first time the map comes near the viewport; Retry re-runs this.
  useEffect(() => {
    if (Canvas || !onScreen) return;
    let cancelled = false;
    setStatus('loading');
    import('./NetworkMapCanvas')
      .then(m => {
        if (cancelled) return;
        loadedCanvas = m.NetworkMapCanvas;
        setCanvas(() => m.NetworkMapCanvas);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [Canvas, onScreen, attempt]);

  const placeholderState = status === 'error' ? 'unavailable' : status === 'loading' ? 'loading' : 'idle';

  return (
    <div
      ref={ref}
      id={`${idPrefix}network-map`}
      className={cn(isHero ? 'hero__map' : 'network-map', className)}
      data-testid="network-map"
    >
      {Canvas && status === 'ready' && <Canvas active={onScreen} projectionOffset={offset} fill={fill} stats={stats} />}
      {status !== 'ready' && <NetworkMapPlaceholder state={placeholderState} onRetry={() => setAttempt(a => a + 1)} />}

      {isHero && <AgentStatusOverlay live={stats.live} />}
    </div>
  );
}

/* ---- Agent Status Comparison (hero, desktop only via CSS) ---- */

function AgentStatusOverlay({ live }: { live: MapLiveStats | null }) {
  const online = live?.onlinePeers ?? 0;
  const offline = live?.offlinePeers ?? 0;
  return (
    <div className="map-overlay agent-status-overlay" id="hero-agent-status">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <svg width="84" height="84" viewBox="0 0 120 120" style={{ flexShrink: 0 }} aria-hidden="true">
          <path fill="#FF4D4D" d="M24 50 C20 42,14 36,10 30 C8 26,10 20,16 20 C20 20,22 24,22 28 C22 32,26 36,30 42 Z" />
          <path fill="#FF4D4D" d="M96 50 C100 42,106 36,110 30 C112 26,110 20,104 20 C100 20,98 24,98 28 C98 32,94 36,90 42 Z" />
          <path fill="#FF4D4D" d="M20 58 C20 40,32 32,60 32 C88 32,100 40,100 58 C100 78,88 90,60 90 C32 90,20 78,20 58 Z" />
          <rect fill="#00FF00" x="24" y="48" width="72" height="6" />
          <rect fill="#00FF00" x="20" y="48" width="6" height="6" />
          <rect fill="#00FF00" x="94" y="48" width="6" height="6" />
          <rect fill="#00FF00" x="28" y="54" width="24" height="6" />
          <rect fill="#00FF00" x="28" y="54" width="6" height="18" />
          <rect fill="#00FF00" x="46" y="54" width="6" height="18" />
          <rect fill="#00FF00" x="28" y="66" width="24" height="6" />
          <rect fill="var(--color-bg-primary)" x="34" y="60" width="12" height="6" />
          <rect fill="#00FF00" x="52" y="54" width="16" height="6" />
          <rect fill="#00FF00" x="68" y="54" width="24" height="6" />
          <rect fill="#00FF00" x="68" y="54" width="6" height="18" />
          <rect fill="#00FF00" x="86" y="54" width="6" height="18" />
          <rect fill="#00FF00" x="68" y="66" width="24" height="6" />
          <rect fill="var(--color-bg-primary)" x="74" y="60" width="12" height="6" />
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-accent-green)' }}>Online</span>
          <span style={{ fontSize: 14, color: 'var(--color-text-tertiary)' }} id="agents-online-count">
            {online} {online === 1 ? 'Agent' : 'Agents'}
          </span>
        </div>
      </div>
      <div style={{ width: 1, height: 72, background: 'var(--color-border-default)' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: 0.5 }}>
        <svg width="84" height="84" viewBox="0 0 120 120" style={{ flexShrink: 0 }} aria-hidden="true">
          <path fill="#CC4040" d="M24 50 C20 42,14 36,10 30 C8 26,10 20,16 20 C20 20,22 24,22 28 C22 32,26 36,30 42 Z" />
          <path fill="#CC4040" d="M96 50 C100 42,106 36,110 30 C112 26,110 20,104 20 C100 20,98 24,98 28 C98 32,94 36,90 42 Z" />
          <path fill="#CC4040" d="M20 58 C20 40,32 32,60 32 C88 32,100 40,100 58 C100 78,88 90,60 90 C32 90,20 78,20 58 Z" />
          <circle fill="var(--color-bg-primary)" cx="42" cy="58" r="7" />
          <circle fill="var(--color-bg-primary)" cx="78" cy="58" r="7" />
          <circle fill="#CC4040" cx="40" cy="56" r="2" opacity="0.4" />
          <circle fill="#CC4040" cx="76" cy="56" r="2" opacity="0.4" />
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-accent-red)' }}>Offline</span>
          <span style={{ fontSize: 14, color: 'var(--color-text-tertiary)' }} id="agents-offline-count">
            {offline} {offline === 1 ? 'Agent' : 'Agents'}
          </span>
        </div>
      </div>
    </div>
  );
}
