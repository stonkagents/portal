/**
 * Purpose: Game constants — tuning values for the endless runner.
 */

/* Canvas */
export const CANVAS_WIDTH = 640;
export const CANVAS_HEIGHT = 360;

/* Physics */
export const GRAVITY = 0.6;
export const JUMP_FORCE = -11;
export const GROUND_Y = CANVAS_HEIGHT - 60;

/* Player */
export const PLAYER_WIDTH = 32;
export const PLAYER_HEIGHT = 32;
export const PLAYER_X = 80;

/* Obstacles */
export const OBSTACLE_WIDTH = 28;
export const OBSTACLE_MIN_HEIGHT = 24;
export const OBSTACLE_MAX_HEIGHT = 56;
export const OBSTACLE_GAP_MIN = 160;
export const OBSTACLE_GAP_MAX = 340;

/* Cluster spawning — sometimes 2-3 obstacles in succession.
   CLUSTER_GAP must be wide enough to land + re-jump between.
   At speed 8, player needs ~120px to land and jump again. */
export const CLUSTER_CHANCE = 0.2;
export const CLUSTER_GAP = 130;
export const CLUSTER_MAX_SIZE = 2;
export const CLUSTER_MAX_OBSTACLE_HEIGHT = 36;

/* Wide obstacles — occasionally a fat one */
export const WIDE_OBSTACLE_CHANCE = 0.15;
export const WIDE_OBSTACLE_WIDTH = 48;

/* Collectibles (Agents to find) */
export const COLLECTIBLE_SIZE = 20;
export const COLLECTIBLE_SPAWN_CHANCE = 0.35;

/* Speed progression — faster ramp, higher ceiling */
export const BASE_SPEED = 4;
export const MAX_SPEED = 12;
export const SPEED_INCREMENT = 0.003;

/* Colors (matching design tokens) */
export const COLORS = {
  bg: '#080a0f',
  ground: '#0f1118',
  groundLine: '#1a1f2e',
  player: '#FF4D4D',
  playerGlasses: '#00FF00',
  obstacle: '#FF4D4D',
  obstacleBug: '#b388ff',
  collectible: '#00FF00',
  collectibleGlow: 'rgba(0, 255, 0, 0.3)',
  text: '#e8e8e8',
  accent: '#00FF00',
  scoreBg: 'rgba(8, 10, 15, 0.7)',
  particles: ['#00FF00', '#FF4D4D', '#4a9eff', '#ffcc00', '#b388ff'],
} as const;
