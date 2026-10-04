/** Highest render pixels per CSS pixel: sharper than this costs more than it shows on a Retina screen. */
export const MAX_PIXEL_RATIO = 1.5;
/** Lowest share of the device ratio the 3D view may drop to before the frame rate wins over sharpness. */
const MIN_SHARE = 0.66;
const STEP = 0.125;
const LOW_FPS = 50;
const HIGH_FPS = 58;
const CHECK_MS = 1000;
/** Seconds of headroom before trying a sharper level again. */
const RAISE_AFTER_CHECKS = 5;
/** A drop this soon after a raise means the sharper level cannot be held, so it becomes the ceiling. */
const FAILED_RAISE_MS = 4000;

export interface ResolutionState {
  ratio: number;
  min: number;
  ceiling: number;
  goodChecks: number;
  lastCheck: number;
  lastRaise: number;
}

export function initialResolution(devicePixelRatio: number): ResolutionState {
  const max = Math.min(devicePixelRatio || 1, MAX_PIXEL_RATIO);
  return { ratio: max, min: Math.max(0.5, max * MIN_SHARE), ceiling: max, goodChecks: 0, lastCheck: 0, lastRaise: -Infinity };
}

/**
 * Once a second: a frame rate below LOW_FPS lowers the render ratio a step, and RAISE_AFTER_CHECKS seconds above
 * HIGH_FPS raise it a step. A raise that drops straight back caps the ratio there, so it never oscillates.
 */
export function nextResolution(state: ResolutionState, fps: number, now: number): ResolutionState {
  if (now - state.lastCheck < CHECK_MS) return state;
  const checked = { ...state, lastCheck: now };
  if (fps < LOW_FPS && state.ratio > state.min) {
    const ceiling = now - state.lastRaise < FAILED_RAISE_MS ? state.ratio - STEP : state.ceiling;
    return { ...checked, ratio: Math.max(state.min, state.ratio - STEP), ceiling, goodChecks: 0 };
  }
  if (fps < HIGH_FPS) return { ...checked, goodChecks: 0 };
  const goodChecks = state.goodChecks + 1;
  if (goodChecks < RAISE_AFTER_CHECKS || state.ratio >= state.ceiling) return { ...checked, goodChecks };
  return { ...checked, ratio: Math.min(state.ceiling, state.ratio + STEP), goodChecks: 0, lastRaise: now };
}
