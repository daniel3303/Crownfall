import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import { describe, expect, it } from "vitest";
import "../src/render/vat-blend";
// Babylon's own include module, loaded after ours, must not take the slot back.
import "@babylonjs/core/Shaders/ShadersInclude/bakedVertexAnimation";
import { advanceRow, finished, rowOffset, type Clip } from "../src/render/vat-clock";

const clip: Clip = { start: 40, end: 71, seconds: 32 / 30 };

/** The rows the unit shader blends for a row offset, as its GLSL computes them (vat-blend.ts). */
function shownRows(offset: number) {
  const total = clip.end - clip.start + 1;
  const row = Math.min(total - 0.001, Math.max(0, offset));
  const into = Math.floor(row);
  return { row: clip.start + into, next: into + 1 >= total ? clip.start : clip.start + into + 1, between: row - into };
}

describe("unit vertex animation shader", () => {
  const include = ShaderStore.IncludesShadersStore["bakedVertexAnimation"]!;

  it("replaces Babylon's include, whichever loads first", () => {
    expect(include).toContain("VATRow=clamp(BVASNAME.z,0.0,VATRows-0.001)");
    expect(include).not.toContain("bakedVertexAnimationTime*");
  });

  it("blends a loop's last row back into its first, and crossfades only in the unit material", () => {
    expect(include).toContain("VATInto+1.0>=VATRows ? BVASNAME.x : VATFrameNum+1.0");
    expect(include).toContain("#if defined(VAT_BLEND) && defined(INSTANCES)");
  });
});

describe("rowOffset", () => {
  it("shows the chosen row, blended toward the next by its fraction", () => {
    expect(shownRows(rowOffset(clip, 7))).toEqual({ row: 47, next: 48, between: 0 });
    const between = shownRows(rowOffset(clip, 7.25));
    expect([between.row, between.next]).toEqual([47, 48]);
    expect(between.between).toBeCloseTo(0.25);
  });

  it("blends a loop's last row back into its first", () => {
    const last = shownRows(rowOffset(clip, 31.5));
    expect([last.row, last.next]).toEqual([71, 40]);
    expect(last.between).toBeCloseTo(0.5);
  });

  it("keeps a row inside the clip, and a one-shot's last row whole", () => {
    expect(shownRows(rowOffset(clip, -3))).toEqual({ row: 40, next: 41, between: 0 });
    expect(shownRows(rowOffset(clip, 99)).row).toBe(71);
    expect(shownRows(rowOffset(clip, 31))).toEqual({ row: 71, next: 40, between: 0 });
  });
});

describe("advanceRow", () => {
  it("plays one clip length per clip duration at rate 1", () => {
    expect(advanceRow(clip, 0, clip.seconds / 2, 1, true)).toBeCloseTo(16);
    expect(advanceRow(clip, 0, clip.seconds / 4, 2, true)).toBeCloseTo(16);
  });

  it("wraps a loop and holds a one-shot on its last row", () => {
    expect(advanceRow(clip, 30, clip.seconds / 8, 1, true)).toBeCloseTo(2);
    const held = advanceRow(clip, 30, clip.seconds, 1, false);
    expect(held).toBe(31);
    expect(finished(clip, held)).toBe(true);
    expect(finished(clip, 30.5)).toBe(false);
  });
});
