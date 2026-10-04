import type { ScreenRect } from "./overlay";

/** A unit's upright body on screen: the line from its feet to the top of its head, in CSS pixels. */
export interface ScreenBody {
  feet: { x: number; y: number };
  head: { x: number; y: number };
}

/** A unit a click might mean: its body, how near a click must land, and whether it is a hero. */
export interface PickCandidate<T> {
  item: T;
  body: ScreenBody;
  /** Pixels from the body within which a click still counts. */
  reach: number;
  hero: boolean;
}

/** Heroes are wider to click and, where favoured, win a click shared with the units crowding round them. */
export const HERO_PICK_REACH = 1.4;
export const HERO_PICK_PRIORITY = 2;

/** How far a screen point lies from a body: zero anywhere on the line from its feet to its head. */
export function distanceToBody(body: ScreenBody, px: number, py: number): number {
  const dx = body.head.x - body.feet.x;
  const dy = body.head.y - body.feet.y;
  const lengthSq = dx * dx + dy * dy;
  const along = lengthSq === 0 ? 0 : ((px - body.feet.x) * dx + (py - body.feet.y) * dy) / lengthSq;
  const t = Math.max(0, Math.min(1, along));
  return Math.hypot(px - (body.feet.x + t * dx), py - (body.feet.y + t * dy));
}

/** The unit a click at a point means: the nearest body within reach, a hero's reach longer; with `favorHeroes` a hero also beats a nearer unit. */
export function nearestBody<T>(candidates: Iterable<PickCandidate<T>>, px: number, py: number, favorHeroes: boolean): T | undefined {
  let best: T | undefined;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    const distance = distanceToBody(candidate.body, px, py);
    if (distance >= candidate.reach * (candidate.hero ? HERO_PICK_REACH : 1)) continue;
    const score = favorHeroes && candidate.hero ? distance / HERO_PICK_PRIORITY : distance;
    if (score < bestScore) {
      best = candidate.item;
      bestScore = score;
    }
  }
  return best;
}

/** Whether any part of a body, from feet to head, lies inside a screen rectangle given by any two corners. */
export function bodyInRect(body: ScreenBody, rect: ScreenRect): boolean {
  const x0 = Math.min(rect.x0, rect.x1);
  const x1 = Math.max(rect.x0, rect.x1);
  const y0 = Math.min(rect.y0, rect.y1);
  const y1 = Math.max(rect.y0, rect.y1);
  // Clip the feet-to-head segment against the rectangle (Liang-Barsky): it touches the box when some stretch survives.
  const dx = body.head.x - body.feet.x;
  const dy = body.head.y - body.feet.y;
  let enter = 0;
  let leave = 1;
  const edges: [number, number][] = [
    [-dx, body.feet.x - x0],
    [dx, x1 - body.feet.x],
    [-dy, body.feet.y - y0],
    [dy, y1 - body.feet.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) enter = Math.max(enter, t);
    else leave = Math.min(leave, t);
    if (enter > leave) return false;
  }
  return true;
}
