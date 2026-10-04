import { buildHeights, HEIGHT_RES, type TileGrid, WADE_DEPTH, WATER_LEVEL } from "./terrain-field";

/** The deepest a unit stands: wading with the water at its shins, however far the lake bed falls away under it. */
export const DEEPEST_STAND = WATER_LEVEL - WADE_DEPTH;
/** Water depth over the feet at which a contact shadow has faded out. */
const SHADOW_DROWNED = 0.05;

/** The ground under a map point: its height and its slope along map x and y (height per map unit). */
export interface GroundSample {
  height: number;
  slopeX: number;
  slopeY: number;
}

/** Where units stand: the terrain's own height field, so feet meet the drawn ground on beaches and wade in the shallows. */
export class UnitGround {
  private readonly heights: Float32Array;
  private readonly columns: number;
  private readonly rows: number;

  constructor(grid: TileGrid) {
    // Lake tiles never change during a match, so the field the terrain built at the start still holds.
    this.heights = buildHeights(grid);
    this.columns = grid.width * HEIGHT_RES + 1;
    this.rows = grid.height * HEIGHT_RES + 1;
  }

  sample(x: number, y: number, out: GroundSample): GroundSample {
    return sampleGround(this.heights, this.columns, this.rows, x, y, out);
  }
}

/**
 * Samples a terrain height field (HEIGHT_RES vertices per tile, `columns` × `rows`) at map point (x, y) on the same two
 * triangles per quad the terrain mesh draws (terrain.ts), so a unit eases down a beach and into the shallows with its
 * feet on the drawn ground. Below DEEPEST_STAND it is level.
 */
export function sampleGround(heights: Float32Array, columns: number, rows: number, x: number, y: number, out: GroundSample): GroundSample {
  const fx = Math.min(columns - 1, Math.max(0, x * HEIGHT_RES));
  const fy = Math.min(rows - 1, Math.max(0, y * HEIGHT_RES));
  const x0 = Math.min(columns - 2, Math.floor(fx));
  const y0 = Math.min(rows - 2, Math.floor(fy));
  const tx = fx - x0;
  const ty = fy - y0;
  const i = y0 * columns + x0;
  const a = heights[i]!;
  const b = heights[i + 1]!;
  const c = heights[i + columns]!;
  const d = heights[i + columns + 1]!;
  // The quad splits along its (x + 1, y)-(x, y + 1) diagonal: triangle a-c-b, then b-c-d.
  const near = tx + ty <= 1;
  const height = near ? a + (b - a) * tx + (c - a) * ty : d + (c - d) * (1 - tx) + (b - d) * (1 - ty);
  if (height <= DEEPEST_STAND) {
    out.height = DEEPEST_STAND;
    out.slopeX = 0;
    out.slopeY = 0;
    return out;
  }
  out.height = height;
  out.slopeX = (near ? b - a : d - c) * HEIGHT_RES;
  out.slopeY = (near ? c - a : d - b) * HEIGHT_RES;
  return out;
}

/** Contact-shadow strength at a stand height: whole on dry ground, gone once the feet are under the water. */
export function shadowStrength(stand: number): number {
  const t = Math.min(1, Math.max(0, (WATER_LEVEL - stand) / SHADOW_DROWNED));
  return 1 - t * t * (3 - 2 * t);
}
