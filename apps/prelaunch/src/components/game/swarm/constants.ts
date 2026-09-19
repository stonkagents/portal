/**
 * Purpose: Constants for the Sync the Swarm connector puzzle.
 */

export const CANVAS_WIDTH = 640;
export const CANVAS_HEIGHT = 400;

/* Nodes */
export const NODE_RADIUS = 14;
export const NODE_COUNT_START = 6;
export const NODE_COUNT_MAX = 14;
export const NODE_PADDING = 40;

/* Timing */
export const ROUND_TIME_MS = 15000;
export const TIME_BONUS_PER_ROUND = 3000;

/* Scoring */
export const POINTS_PER_CONNECTION = 10;
export const BONUS_FULL_SYNC = 50;

/* Colors */
export const COLORS = {
  bg: '#080a0f',
  node: '#FF4D4D',
  nodeActive: '#00FF00',
  nodeConnected: '#00FF00',
  nodeGlow: 'rgba(0, 255, 0, 0.3)',
  line: '#00FF00',
  linePreview: 'rgba(0, 255, 0, 0.3)',
  lineFail: 'rgba(255, 77, 77, 0.5)',
  text: '#e8e8e8',
  accent: '#00FF00',
  timerBg: 'rgba(255, 77, 77, 0.2)',
  timerFill: '#FF4D4D',
  hudBg: 'rgba(8, 10, 15, 0.7)',
} as const;
