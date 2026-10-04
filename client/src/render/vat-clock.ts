/** A clip's rows in the baked animation texture. */
export interface Clip {
  start: number;
  end: number;
  seconds: number;
}

/** Keeps a loop's row short of its end, so the shader never reads past the clip. */
const ROW_EPSILON = 1e-3;

export function rowCount(clip: Clip): number {
  return clip.end - clip.start + 1;
}

/**
 * The row offset for an instance's settings `[start, end, offset, 0]`: the CPU picks every row each frame, and the unit
 * shader (vat-blend.ts) shows row `start + floor(offset)` blended toward the next by the fraction.
 */
export function rowOffset(clip: Clip, row: number): number {
  return Math.min(rowCount(clip) - ROW_EPSILON, Math.max(0, row));
}

/** The row `seconds` of play later at `rate`; a loop wraps, a one-shot holds its last row. */
export function advanceRow(clip: Clip, row: number, seconds: number, rate: number, loop: boolean): number {
  const total = rowCount(clip);
  const next = row + (seconds * rate * total) / clip.seconds;
  return loop ? next % total : Math.min(next, total - 1);
}

/** Whether a one-shot clip has reached its last row. */
export function finished(clip: Clip, row: number): boolean {
  return row >= rowCount(clip) - 1;
}
