/**
 * Purpose: Infrastructure the network actually runs on, used as arc anchors while the
 *          tracker knows fewer than MIN_LOCATED_PEERS located peers (devnet today).
 *          Locations are the deployed AWS region (stonkagents/infra: us-east-1, N. Virginia).
 *          Anchors are drawn distinctly and never counted in the HUD.
 */

export interface MapAnchor {
  label: string;
  lat: number;
  lng: number;
}

export const INFRA_ANCHORS: readonly MapAnchor[] = [{ label: 'Tracker · AWS us-east-1', lat: 38.95, lng: -77.45 }];

/** Below this many located peers the arcs also run to the infrastructure anchors. */
export const MIN_LOCATED_PEERS = 8;
