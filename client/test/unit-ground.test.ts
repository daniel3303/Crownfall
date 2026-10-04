import { describe, expect, it } from "vitest";
import { Tile } from "../src/net/protocol";
import { buildHeights, HEIGHT_RES, WATER_LEVEL } from "../src/render/terrain-field";
import { DEEPEST_STAND, type GroundSample, sampleGround, shadowStrength, UnitGround } from "../src/render/unit-ground";

/** A 24x24 grass map with an 8x8 lake at (8..15, 8..15) whose outer ring of tiles is shallow, as the server lays it out. */
const map = {
  width: 24,
  height: 24,
  tile: (x: number, y: number) => {
    if (x < 8 || x >= 16 || y < 8 || y >= 16) return Tile.Grass;
    return x === 8 || x === 15 || y === 8 || y === 15 ? Tile.Shallow : Tile.Water;
  },
};
const ground = new UnitGround(map);
const stand = (x: number, y: number) => ground.sample(x, y, { height: 0, slopeX: 0, slopeY: 0 });

describe("UnitGround", () => {
  it("stands units on level land away from water", () => {
    expect(stand(3.5, 3.5)).toEqual({ height: 0, slopeX: 0, slopeY: 0 });
  });

  it("wades a unit in the shallows with the water over its feet, and no deeper in open water", () => {
    for (const [x, y] of [[8.5, 12], [15.5, 12], [12, 8.5], [12, 15.5]] as const) {
      expect(stand(x, y).height).toBeLessThan(WATER_LEVEL - 0.05);
    }
    expect(stand(12, 12).height).toBe(DEEPEST_STAND);
  });

  it("eases down the beach into the shallows with no step", () => {
    let last = stand(4, 12).height;
    for (let x = 4.02; x <= 9; x += 0.02) {
      const next = stand(x, 12).height;
      expect(Math.abs(next - last)).toBeLessThan(0.02);
      last = next;
    }
    expect(stand(4, 12).height).toBeCloseTo(0, 6);
    expect(last).toBe(DEEPEST_STAND);
  });

  it("meets the drawn ground at its vertices, and tilts down toward the water", () => {
    const heights = buildHeights(map);
    const columns = map.width * HEIGHT_RES + 1;
    const out: GroundSample = { height: 0, slopeX: 0, slopeY: 0 };
    for (const [vx, vy] of [[21, 36], [22, 36], [23, 36], [30, 30]] as const) {
      const vertex = heights[vy * columns + vx]!;
      expect(sampleGround(heights, columns, columns, vx / HEIGHT_RES, vy / HEIGHT_RES, out).height).toBeCloseTo(Math.max(DEEPEST_STAND, vertex), 6);
    }
    // Inside a beach quad by the lake's corner, on each of the two triangles the terrain mesh splits it into (a-c-b, then b-c-d).
    const [a, b, c, d] = [27 * columns + 24, 27 * columns + 25, 28 * columns + 24, 28 * columns + 25].map((i) => heights[i]!) as [number, number, number, number];
    // Not a plane, so triangle and bilinear sampling disagree inside it.
    expect(a + d).not.toBeCloseTo(b + c, 3);
    expect(sampleGround(heights, columns, columns, 24.2 / HEIGHT_RES, 27.3 / HEIGHT_RES, out).height).toBeCloseTo(a + (b - a) * 0.2 + (c - a) * 0.3, 6);
    expect(sampleGround(heights, columns, columns, 24.8 / HEIGHT_RES, 27.6 / HEIGHT_RES, out).height).toBeCloseTo(d + (c - d) * 0.2 + (b - d) * 0.4, 6);
    const beach = sampleGround(heights, columns, columns, 8.1, 12, out);
    expect(beach.height).toBeLessThan(0);
    expect(beach.slopeX).toBeLessThan(0);
  });

  it("clamps points off the map to its edge", () => {
    expect(stand(-5, -5).height).toBeCloseTo(stand(0, 0).height, 6);
    expect(stand(99, 99).height).toBeCloseTo(stand(24, 24).height, 6);
  });
});

describe("shadowStrength", () => {
  it("keeps the contact shadow on dry ground and fades it out as the feet go under", () => {
    expect(shadowStrength(0)).toBe(1);
    expect(shadowStrength(WATER_LEVEL)).toBe(1);
    expect(shadowStrength(WATER_LEVEL - 0.025)).toBeCloseTo(0.5, 6);
    expect(shadowStrength(DEEPEST_STAND)).toBe(0);
  });
});
