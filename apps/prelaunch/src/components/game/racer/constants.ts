/**
 * Purpose: Constants for the Pole Position-style pseudo-3D racer.
 */

/* Canvas */
export const CANVAS_WIDTH = 640;
export const CANVAS_HEIGHT = 360;

/* Road geometry */
export const ROAD_WIDTH = 2000;
export const SEGMENT_LENGTH = 200;
export const VISIBLE_SEGMENTS = 80;
export const CAMERA_HEIGHT = 600;
export const CAMERA_DEPTH = 1.0;
export const DRAW_DISTANCE = 150;

/* Player car */
export const PLAYER_Z = 0;
export const PLAYER_SPEED_MAX = 200;
export const PLAYER_ACCEL = 3;
export const PLAYER_BRAKE = 5;
export const PLAYER_DECEL = 1;
export const PLAYER_STEER_SPEED = 0.12;
export const PLAYER_X_LIMIT = 1.4;
export const CENTRIFUGAL_FORCE = 0.4;
export const OFFROAD_DRAG = 3.5;

/* AI traffic */
export const TRAFFIC_COUNT_MIN = 3;
export const TRAFFIC_COUNT_MAX = 8;
export const TRAFFIC_SPEED_MIN = 80;
export const TRAFFIC_SPEED_MAX = 140;
export const TRAFFIC_SPREAD = 0.8;

/* Track */
export const TRACK_LENGTH = 300;
export const CURVE_NONE = 0;
export const CURVE_EASY = 3;
export const CURVE_MEDIUM = 6;
export const CURVE_HARD = 10;
export const CURVE_INSANE = 14;

/* Scoring */
export const POINTS_PER_SEGMENT = 1;
export const LAP_BONUS = 100;

/* Crash */
export const CRASH_DURATION = 90;
export const CRASH_AGENT_LAUNCH_VY = -8;
export const CRASH_AGENT_GRAVITY = 0.3;

/* Colors (design tokens) */
export const COLORS = {
  bg: '#080a0f',
  sky: '#080a0f',
  skyHorizon: '#0f1118',

  roadDark: '#181c28',
  roadLight: '#1a1f2e',
  grassDark: '#0a1a0a',
  grassLight: '#0d200d',
  rumbleDark: '#FF4D4D',
  rumbleLight: '#e8e8e8',
  laneDash: 'rgba(0, 255, 0, 0.2)',

  playerCar: '#FF4D4D',
  playerTrim: '#00FF00',
  trafficCar1: '#4a9eff',
  trafficCar2: '#b388ff',
  trafficCar3: '#ffcc00',
  trafficCar4: '#FF4D4D',

  text: '#e8e8e8',
  accent: '#00FF00',
  hudBg: 'rgba(8, 10, 15, 0.7)',
  speedBar: '#00FF00',
  speedBarHot: '#FF4D4D',

  agentBody: '#FF4D4D',
  agentGlasses: '#00FF00',
  cigarTip: '#ff6b35',
  smoke: 'rgba(200, 200, 200, 0.4)',
} as const;
