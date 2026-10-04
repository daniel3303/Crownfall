import { describe, expect, it } from "vitest";
import { Tile } from "../src/net/protocol";
import { buildHeights, buildSplat, HEIGHT_RES, LAKE_DEPTH, LAYERS, SPLAT_RES, splatAround, WADE_DEPTH, WATER_LEVEL } from "../src/render/terrain-field";

/** A 24x24 grass map with a 8x8 lake at (8..15, 8..15) and a forest strip along the top rows. */
function grid() {
  return {
    width: 24,
    height: 24,
    tile: (x: number, y: number) => (x >= 8 && x < 16 && y >= 8 && y < 16 ? Tile.Water : y < 3 ? Tile.Tree : Tile.Grass),
  };
}

const at = (field: Float32Array, res: number, width: number, tx: number, ty: number) => field[Math.round(ty * res) * (width * res + 1) + Math.round(tx * res)]!;

describe("buildHeights", () => {
  it("keeps land flat, sinks the middle of a lake to full depth and puts the shore near the tile edge", () => {
    const heights = buildHeights(grid());
    expect(at(heights, HEIGHT_RES, 24, 20, 20)).toBeCloseTo(0, 6);
    expect(at(heights, HEIGHT_RES, 24, 12, 12)).toBeCloseTo(LAKE_DEPTH, 2);
    expect(at(heights, HEIGHT_RES, 24, 5.5, 12)).toBeGreaterThan(WATER_LEVEL);
    expect(at(heights, HEIGHT_RES, 24, 10, 12)).toBeLessThan(WATER_LEVEL);
  });

  it("keeps the middle of the last land tile before a lake nearly level, so units there do not float", () => {
    const heights = buildHeights(grid());
    for (const [tx, ty] of [[7.5, 12], [16.5, 12], [12, 7.5], [12, 16.5]] as const) {
      expect(at(heights, HEIGHT_RES, 24, tx, ty)).toBeGreaterThan(WATER_LEVEL / 2);
    }
  });
});

describe("shallows", () => {
  /** The lake from grid() with its outer ring of tiles shallow, as the server lays it out. */
  const rimmed = () => {
    const map = grid();
    const rim = (x: number, y: number) => (x === 8 || x === 15 || y === 8 || y === 15) && x >= 8 && x < 16 && y >= 8 && y < 16;
    return { ...map, tile: (x: number, y: number) => (rim(x, y) ? Tile.Shallow : map.tile(x, y)) };
  };

  it("keeps the rim at wading depth while the middle still sinks to full depth", () => {
    const heights = buildHeights(rimmed());
    for (const [tx, ty] of [[8.5, 12], [15.5, 12], [12, 8.5]] as const) {
      const ground = at(heights, HEIGHT_RES, 24, tx, ty);
      expect(ground).toBeLessThan(WATER_LEVEL);
      expect(ground).toBeGreaterThanOrEqual(WATER_LEVEL - WADE_DEPTH - 0.001);
    }
    expect(at(heights, HEIGHT_RES, 24, 12, 12)).toBeCloseTo(LAKE_DEPTH, 1);
  });

  it("draws the same shoreline as an all-deep lake", () => {
    const [plain] = buildSplat(grid());
    const [rim] = buildSplat(rimmed());
    expect(Array.from(rim)).toEqual(Array.from(plain));
  });
});

describe("islands", () => {
  /** The lake from grid() with a one-tile wooded island at (12, 12). */
  const island = () => {
    const map = grid();
    return { ...map, tile: (x: number, y: number) => (x === 12 && y === 12 ? Tile.Tree : map.tile(x, y)) };
  };

  it("keeps a one-tile island above the water", () => {
    expect(at(buildHeights(island()), HEIGHT_RES, 24, 12.5, 12.5)).toBeGreaterThan(WATER_LEVEL);
  });

  it("paints the island as ground, not lake bed", () => {
    const [first, second] = buildSplat(island());
    const o = (Math.floor(12.5 * SPLAT_RES) * 24 * SPLAT_RES + Math.floor(12.5 * SPLAT_RES)) * 4;
    expect(second[o + 1]!).toBeLessThan(64);
    expect(first[o]! + first[o + 1]! + first[o + 2]! + first[o + 3]! + second[o]!).toBeGreaterThan(190);
  });
});

describe("buildSplat", () => {
  const [first, second] = buildSplat(grid());
  const weights = (tx: number, ty: number) => {
    const o = (Math.floor(ty * SPLAT_RES) * 24 * SPLAT_RES + Math.floor(tx * SPLAT_RES)) * 4;
    const all = [first[o]!, first[o + 1]!, first[o + 2]!, first[o + 3]!, second[o]!, second[o + 1]!];
    return Object.fromEntries(LAYERS.map((name, i) => [name, all[i]!])) as Record<(typeof LAYERS)[number], number>;
  };

  it("sums every texel's weights to 255", () => {
    for (let i = 0; i < first.length; i += 4) {
      expect(first[i]! + first[i + 1]! + first[i + 2]! + first[i + 3]! + second[i]! + second[i + 1]!).toBe(255);
    }
  });

  it("puts lake bed in the lake, forest floor under trees and open ground elsewhere", () => {
    expect(weights(12, 12).lakebed).toBeGreaterThan(200);
    expect(weights(12, 0.5).forest).toBeGreaterThan(150);
    const open = weights(20, 20);
    expect(open.grass + open.meadow + open.dirt).toBeGreaterThan(200);
  });

  it("rings the lake with sand", () => {
    const ring = [weights(7.6, 12), weights(16.4, 12), weights(12, 7.6), weights(12, 16.4)];
    expect(Math.max(...ring.map((w) => w.sand))).toBeGreaterThan(60);
  });
});

describe("splatAround", () => {
  it("matches a whole-map rebuild after a tree is felled, at the map edge and inside it", () => {
    for (const [tx, ty] of [[0, 1], [11, 2]] as const) {
      const map = grid();
      const felled = { ...map, tile: (x: number, y: number) => (x === tx && y === ty ? Tile.Grass : map.tile(x, y)) };
      const [first, second] = buildSplat(felled);
      const block = splatAround(felled, tx, ty);
      const { x0, y0, w, h } = block.window;
      expect(w * h).toBeLessThanOrEqual(25 * SPLAT_RES * SPLAT_RES);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const o = ((y0 + y) * 24 * SPLAT_RES + x0 + x) * 4;
          const k = (y * w + x) * 4;
          expect([...block.first.subarray(k, k + 4), ...block.second.subarray(k, k + 4)]).toEqual([...first.subarray(o, o + 4), ...second.subarray(o, o + 4)]);
        }
      }
    }
  });

  it("turns forest floor back to open ground where a grove was cleared", () => {
    const map = grid();
    const before = buildSplat(map)[1];
    const felled = { ...map, tile: (x: number, y: number) => (x >= 10 && x <= 12 && y <= 2 ? Tile.Grass : map.tile(x, y)) };
    const after = splatAround(felled, 11, 1);
    const centre = ((SPLAT_RES * 1.5 - after.window.y0) * after.window.w + SPLAT_RES * 11.5 - after.window.x0) * 4;
    const o = (SPLAT_RES * 1.5 * 24 * SPLAT_RES + SPLAT_RES * 11.5) * 4;
    expect(after.second[centre]!).toBeLessThan(before[o]!);
  });
});
