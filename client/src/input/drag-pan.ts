/** How quickly the arrow-key pan velocity follows the keys, per second; higher feels snappier, lower floatier. */
const RESPONSE = 14;
/** How fast a flung map slows down, per second. */
const FRICTION = 6;
/** How much of each new drag sample feeds the fling velocity; the rest is the previous estimate. */
const SAMPLE_WEIGHT = 0.35;

export interface MapPoint {
  x: number;
  y: number;
}

/** Eases a velocity toward its target at the same rate whatever the frame rate. */
export function smoothVelocity(current: number, target: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-RESPONSE * dt));
}

/**
 * The camera pan that keeps the ground point grabbed at `from` under the pointer now at `to`, both in screen px.
 * Null when either point misses the ground.
 */
export function grabDelta(from: MapPoint, to: MapPoint, groundAt: (px: number, py: number) => MapPoint | null): MapPoint | null {
  const grabbed = groundAt(from.x, from.y);
  const under = groundAt(to.x, to.y);
  if (!grabbed || !under) return null;
  return { x: grabbed.x - under.x, y: grabbed.y - under.y };
}

/** Blends a drag step (map units over dt seconds) into the running fling velocity. */
export function trackVelocity(velocity: MapPoint, step: MapPoint, dt: number): MapPoint {
  if (dt <= 0) return velocity;
  return { x: velocity.x + (step.x / dt - velocity.x) * SAMPLE_WEIGHT, y: velocity.y + (step.y / dt - velocity.y) * SAMPLE_WEIGHT };
}

/** A released map keeps gliding and slows to a stop. */
export function decay(velocity: MapPoint, dt: number): MapPoint {
  const keep = Math.exp(-FRICTION * dt);
  return { x: velocity.x * keep, y: velocity.y * keep };
}

/** Zoom per notch of a mouse wheel. */
const WHEEL_STEP = 1.1;
/** Zoom per pixel of a trackpad pinch. */
const PINCH_RATE = 0.01;
/** A wheel event moving this far in whole pixels, straight up or down, is a mouse-wheel notch rather than a swipe. */
const NOTCH_PX = 40;

export type WheelIntent = { kind: "zoom"; factor: number } | { kind: "pan"; dx: number; dy: number };

/** The wheel fields read; `wheelDeltaY` is non-standard but set by Chrome and Safari. */
export interface WheelInput {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  wheelDeltaY?: number;
}

/**
 * What a wheel event asks of the camera. A pinch (Ctrl set by the browser) and a mouse wheel zoom; a two-finger
 * trackpad swipe pans by its pixel delta.
 */
export function wheelIntent(e: WheelInput): WheelIntent {
  if (e.ctrlKey) return { kind: "zoom", factor: Math.exp(e.deltaY * PINCH_RATE) };
  if (isMouseWheel(e)) return { kind: "zoom", factor: e.deltaY > 0 ? WHEEL_STEP : 1 / WHEEL_STEP };
  return { kind: "pan", dx: e.deltaX, dy: e.deltaY };
}

function isMouseWheel(e: WheelInput): boolean {
  if (e.deltaMode !== 0) return true;
  // A trackpad's legacy wheelDeltaY is exactly -3 times its deltaY; a mouse notch's is not, even when macOS scales the
  // notch to a few fractional pixels.
  if (e.wheelDeltaY) return Math.abs(e.wheelDeltaY + 3 * e.deltaY) > 1;
  return e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= NOTCH_PX;
}
