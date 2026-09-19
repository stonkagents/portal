/**
 * Purpose: The lazily loaded part of the map: two canvases, the tooltip, and the renderer
 *          lifecycle. Created on mount, fully destroyed on unmount (no singleton, no hidden
 *          host). land.json is decoded once per page and shared by every mount.
 *          Real tracker peers are drawn on top of the renderer's simulatedPeers layer, a
 *          launch-period visual that thins out as daemons come online (see map-renderer.ts).
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Peer } from '@/lib/types/peer';
import landJson from './land.json';
import { type Fill, decodeLand, type Land, type LandJson } from './projection';
import { createMapRenderer, type MapPeerPoint, type MapRenderer } from './map-renderer';
import { countryName, resolveCountryId } from './country-codes';
import { INFRA_ANCHORS, MIN_LOCATED_PEERS } from './anchors';
import type { NetworkMapStats } from './use-network-map-stats';

let land: Land | null = null;
function getLand(): Land {
  land ??= decodeLand(landJson as LandJson);
  return land;
}

export interface NetworkMapCanvasProps {
  /** Mounted and on screen: the renderer paints and animates only while true. */
  active: boolean;
  projectionOffset: readonly [number, number];
  /** How the sphere sits in the box; the hero backdrop covers, the card contains. */
  fill: Fill;
  stats: NetworkMapStats;
}

function toPoint(peer: Peer): MapPeerPoint {
  const id = resolveCountryId(peer);
  const country = id ? countryName(id) : '';
  const place = [peer.city, country].filter(Boolean).join(', ') || 'Location unknown';
  return { id: peer.id, lat: peer.lat, lng: peer.lng, status: peer.status, label: peer.displayName, place };
}

export function NetworkMapCanvas({ active, projectionOffset, fill, stats }: NetworkMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const landRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipTitleRef = useRef<HTMLDivElement>(null);
  const tipLabelRef = useRef<HTMLSpanElement>(null);
  const tipValueRef = useRef<HTMLSpanElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  // The tooltip is position: fixed; ancestors with a transform (the gallery card's entrance
  // animation) would re-root it and the card's overflow would clip it, so it lives on <body>.
  const [tooltipHost, setTooltipHost] = useState<HTMLElement | null>(null);
  useEffect(() => setTooltipHost(document.body), []);
  const offsetX = projectionOffset[0];
  const offsetY = projectionOffset[1];
  const points = useMemo(() => stats.peers.map(toPoint), [stats.peers]);
  // Latest props for the creation effect, which runs after the first data/active effects.
  const latest = useRef({ active, points, countries: stats.countries });
  latest.current = { active, points, countries: stats.countries };

  useEffect(() => {
    if (!tooltipHost) return; // the tooltip mounts one render after the host is known
    const container = containerRef.current;
    const landCanvas = landRef.current;
    const fxCanvas = fxRef.current;
    const tooltip = tipRef.current;
    const tipTitle = tipTitleRef.current;
    const tipLabel = tipLabelRef.current;
    const tipValue = tipValueRef.current;
    if (!container || !landCanvas || !fxCanvas || !tooltip || !tipTitle || !tipLabel || !tipValue) return;
    const renderer = createMapRenderer({ container, landCanvas, fxCanvas, tooltip, tipTitle, tipLabel, tipValue }, getLand(), {
      offset: [offsetX, offsetY],
      fill,
      countryName,
      anchors: INFRA_ANCHORS,
      minLocatedPeers: MIN_LOCATED_PEERS,
    });
    rendererRef.current = renderer;
    renderer.setData(latest.current.points, latest.current.countries);
    renderer.setActive(latest.current.active);
    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
    // The renderer is created once the tooltip exists; offset, data and activity are pushed by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tooltipHost]);

  useEffect(() => {
    rendererRef.current?.setOffset([offsetX, offsetY]);
  }, [offsetX, offsetY]);

  useEffect(() => {
    rendererRef.current?.setData(points, stats.countries);
  }, [points, stats.countries]);

  useEffect(() => {
    rendererRef.current?.setActive(active);
  }, [active]);

  return (
    <div ref={containerRef} className="network-map__layers" data-testid="network-map-canvas">
      <canvas ref={landRef} className="network-map__land" aria-hidden="true" />
      <canvas ref={fxRef} className="network-map__fx" aria-hidden="true" />
      {tooltipHost &&
        createPortal(
          <div id="country-tooltip" ref={tipRef} role="tooltip">
            <div className="tip-country" ref={tipTitleRef} />
            <div className="tip-row">
              <span ref={tipLabelRef} />
              <span ref={tipValueRef} />
            </div>
          </div>,
          tooltipHost,
        )}
    </div>
  );
}
