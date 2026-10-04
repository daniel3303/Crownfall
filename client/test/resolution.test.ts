import { describe, expect, it } from "vitest";
import { initialResolution, MAX_PIXEL_RATIO, nextResolution, type ResolutionState } from "../src/render/resolution";

function run(state: ResolutionState, fps: number[], start = 1000): ResolutionState {
  return fps.reduce((s, f, i) => nextResolution(s, f, start + i * 1000), state);
}

describe("dynamic resolution", () => {
  it("starts sharp, capped at the maximum ratio", () => {
    expect(initialResolution(2).ratio).toBe(MAX_PIXEL_RATIO);
    expect(initialResolution(1).ratio).toBe(1);
  });

  it("steps down while the frame rate is low, but not below the floor", () => {
    const state = run(initialResolution(2), Array(20).fill(20));
    expect(state.ratio).toBeCloseTo(initialResolution(2).min, 6);
  });

  it("checks at most once a second", () => {
    const state = initialResolution(2);
    const once = nextResolution(state, 20, 1000);
    expect(nextResolution(once, 20, 1500)).toBe(once);
  });

  it("raises again after sustained headroom", () => {
    const low = run(initialResolution(2), [20, 20]);
    const recovered = run(low, Array(5).fill(60), 10000);
    expect(recovered.ratio).toBeCloseTo(low.ratio + 0.125, 6);
  });

  it("stops raising to a level it could not hold", () => {
    const low = run(initialResolution(2), [20, 20]);
    const raised = run(low, Array(5).fill(60), 10000);
    const dropped = run(raised, [30], 15000);
    const later = run(dropped, Array(30).fill(60), 20000);
    expect(later.ratio).toBeCloseTo(dropped.ratio, 6);
  });
});
