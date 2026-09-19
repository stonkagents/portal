/**
 * Purpose: Swarm game engine — connect nodes to sync the network.
 *          Tap node pairs to create connections. Sync all nodes before time runs out.
 *          Progressive difficulty: more nodes each round.
 */

import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  NODE_RADIUS,
  NODE_COUNT_START,
  NODE_COUNT_MAX,
  NODE_PADDING,
  ROUND_TIME_MS,
  TIME_BONUS_PER_ROUND,
  POINTS_PER_CONNECTION,
  BONUS_FULL_SYNC,
} from './constants';
import { setHighScore } from '@/lib/storage';

/* ── Types ── */

export interface SwarmNode {
  id: number;
  x: number;
  y: number;
  connected: boolean;
}

export interface Connection {
  a: number;
  b: number;
}

export interface SwarmState {
  nodes: SwarmNode[];
  targetConnections: Connection[];
  playerConnections: Connection[];
  selectedNode: number | null;
  score: number;
  round: number;
  timeLeft: number;
  phase: 'ready' | 'playing' | 'round-clear' | 'dead';
  nodeCount: number;
}

/* ── Factory ── */

export function createSwarmState(): SwarmState {
  return {
    nodes: [],
    targetConnections: [],
    playerConnections: [],
    selectedNode: null,
    score: 0,
    round: 0,
    timeLeft: ROUND_TIME_MS,
    phase: 'ready',
    nodeCount: NODE_COUNT_START,
  };
}

export function startRound(state: SwarmState): SwarmState {
  const s = { ...state };
  s.round++;
  s.nodeCount = Math.min(NODE_COUNT_START + s.round - 1, NODE_COUNT_MAX);
  s.timeLeft = ROUND_TIME_MS + (s.round - 1) * TIME_BONUS_PER_ROUND;
  s.selectedNode = null;
  s.playerConnections = [];
  s.phase = 'playing';

  /* Generate node positions (avoid overlap) */
  s.nodes = generateNodes(s.nodeCount);

  /* Generate target connections (minimum spanning tree + some extras) */
  s.targetConnections = generateTargetConnections(s.nodes);

  return s;
}

/* ── Update (called every frame) ── */

export function updateSwarm(state: SwarmState, dt: number): SwarmState {
  if (state.phase !== 'playing') return state;

  const s = { ...state };
  s.timeLeft -= dt;

  if (s.timeLeft <= 0) {
    s.timeLeft = 0;
    s.phase = 'dead';
    setHighScore('swarm', s.score);
  }

  return s;
}

/* ── Player actions ── */

export function tapNode(state: SwarmState, nodeId: number): SwarmState {
  if (state.phase !== 'playing') return state;

  const s = { ...state };

  if (s.selectedNode === null) {
    s.selectedNode = nodeId;
    return s;
  }

  if (s.selectedNode === nodeId) {
    s.selectedNode = null;
    return s;
  }

  /* Try to make a connection */
  const a = Math.min(s.selectedNode, nodeId);
  const b = Math.max(s.selectedNode, nodeId);

  /* Check if already connected */
  const alreadyConnected = s.playerConnections.some(c => c.a === a && c.b === b);
  if (alreadyConnected) {
    s.selectedNode = nodeId;
    return s;
  }

  /* Check if this is a valid target connection */
  const isTarget = s.targetConnections.some(c => c.a === a && c.b === b);

  if (isTarget) {
    s.playerConnections = [...s.playerConnections, { a, b }];
    s.score += POINTS_PER_CONNECTION;
    s.selectedNode = null;

    /* Update node connected status */
    s.nodes = s.nodes.map(n => {
      const connected = s.playerConnections.some(c => c.a === n.id || c.b === n.id);
      return { ...n, connected };
    });

    /* Check for round completion */
    if (s.playerConnections.length === s.targetConnections.length) {
      s.score += BONUS_FULL_SYNC;
      s.phase = 'round-clear';
    }
  } else {
    /* Wrong connection — small time penalty */
    s.timeLeft = Math.max(0, s.timeLeft - 1500);
    s.selectedNode = null;
  }

  return s;
}

export function hitTestNode(state: SwarmState, cx: number, cy: number): number | null {
  for (const node of state.nodes) {
    const dx = cx - node.x;
    const dy = cy - node.y;
    if (dx * dx + dy * dy <= (NODE_RADIUS + 8) * (NODE_RADIUS + 8)) {
      return node.id;
    }
  }
  return null;
}

/* ── Generators ── */

function generateNodes(count: number): SwarmNode[] {
  const nodes: SwarmNode[] = [];
  const margin = NODE_PADDING + NODE_RADIUS;
  const minDist = NODE_RADIUS * 4;

  for (let i = 0; i < count; i++) {
    let attempts = 0;
    let x: number;
    let y: number;

    do {
      x = margin + Math.random() * (CANVAS_WIDTH - margin * 2);
      y = margin + Math.random() * (CANVAS_HEIGHT - margin * 2 - 40);
      attempts++;
    } while (attempts < 100 && nodes.some(n => dist(n.x, n.y, x, y) < minDist));

    nodes.push({ id: i, x, y, connected: false });
  }

  return nodes;
}

function generateTargetConnections(nodes: SwarmNode[]): Connection[] {
  if (nodes.length < 2) return [];

  /* Build MST using Prim's algorithm for guaranteed connectivity */
  const inMST = new Set<number>([0]);
  const connections: Connection[] = [];

  while (inMST.size < nodes.length) {
    let bestDist = Infinity;
    let bestA = -1;
    let bestB = -1;

    for (const aId of inMST) {
      for (let bId = 0; bId < nodes.length; bId++) {
        if (inMST.has(bId)) continue;
        const d = dist(nodes[aId].x, nodes[aId].y, nodes[bId].x, nodes[bId].y);
        if (d < bestDist) {
          bestDist = d;
          bestA = aId;
          bestB = bId;
        }
      }
    }

    if (bestA >= 0 && bestB >= 0) {
      inMST.add(bestB);
      connections.push({ a: Math.min(bestA, bestB), b: Math.max(bestA, bestB) });
    }
  }

  /* Add 1-3 extra connections for challenge */
  const extras = 1 + Math.floor(Math.random() * Math.min(3, nodes.length - 2));
  for (let i = 0; i < extras; i++) {
    const a = Math.floor(Math.random() * nodes.length);
    let b = Math.floor(Math.random() * nodes.length);
    if (a === b) b = (b + 1) % nodes.length;
    const min = Math.min(a, b);
    const max = Math.max(a, b);
    if (!connections.some(c => c.a === min && c.b === max)) {
      connections.push({ a: min, b: max });
    }
  }

  return connections;
}

function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}
