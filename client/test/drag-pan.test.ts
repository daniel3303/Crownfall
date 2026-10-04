import { describe, expect, it } from "vitest";
import { decay, grabDelta, smoothVelocity, trackVelocity, wheelIntent } from "../src/input/drag-pan";

/** A flat ground seen straight down: 10 screen px per map unit, camera centred on map (cx, cy). */
function camera(cx: number, cy: number) {
  return (px: number, py: number) => ({ x: cx + (px - 400) / 10, y: cy + (py - 300) / 10 });
}

describe("grabDelta", () => {
  it("pans so the grabbed ground point ends under the pointer", () => {
    const before = camera(50, 50);
    const delta = grabDelta({ x: 400, y: 300 }, { x: 450, y: 280 }, before)!;
    expect(delta).toEqual({ x: -5, y: 2 });
    const after = camera(50 + delta.x, 50 + delta.y);
    expect(after(450, 280)).toEqual(before(400, 300));
  });

  it("does nothing when the pointer misses the ground", () => {
    expect(grabDelta({ x: 0, y: 0 }, { x: 10, y: 10 }, () => null)).toBeNull();
  });
});

describe("fling", () => {
  it("tracks the drag speed and glides to a stop", () => {
    let velocity = { x: 0, y: 0 };
    for (let i = 0; i < 20; i++) velocity = trackVelocity(velocity, { x: 0.5, y: 0 }, 0.016);
    expect(velocity.x).toBeCloseTo(0.5 / 0.016, 1);
    const later = decay(velocity, 1);
    expect(later.x).toBeGreaterThan(0);
    expect(later.x).toBeLessThan(velocity.x * 0.01);
  });

  it("ignores a zero-length sample", () => {
    expect(trackVelocity({ x: 3, y: 4 }, { x: 1, y: 1 }, 0)).toEqual({ x: 3, y: 4 });
  });
});

describe("smoothVelocity", () => {
  it("eases toward the target the same amount over one long step as over many short ones", () => {
    let stepped = 0;
    for (let i = 0; i < 10; i++) stepped = smoothVelocity(stepped, 1, 0.01);
    expect(smoothVelocity(0, 1, 0.1)).toBeCloseTo(stepped, 10);
  });
});

describe("wheelIntent", () => {
  const wheel = (deltaX: number, deltaY: number, extra: { deltaMode?: number; ctrlKey?: boolean; wheelDeltaY?: number } = {}) => ({
    deltaX,
    deltaY,
    deltaMode: extra.deltaMode ?? 0,
    ctrlKey: extra.ctrlKey ?? false,
    wheelDeltaY: extra.wheelDeltaY,
  });

  it("zooms one step per mouse-wheel notch", () => {
    expect(wheelIntent(wheel(0, 100))).toEqual({ kind: "zoom", factor: 1.1 });
    expect(wheelIntent(wheel(0, -100))).toEqual({ kind: "zoom", factor: 1 / 1.1 });
    expect(wheelIntent(wheel(0, 3, { deltaMode: 1 }))).toEqual({ kind: "zoom", factor: 1.1 });
  });

  it("zooms on a Mac mouse wheel, whose notch Chrome scales to a few fractional pixels", () => {
    expect(wheelIntent(wheel(0, 4.000244140625, { wheelDeltaY: -120 }))).toEqual({ kind: "zoom", factor: 1.1 });
    expect(wheelIntent(wheel(0, -8, { wheelDeltaY: 240 }))).toEqual({ kind: "zoom", factor: 1 / 1.1 });
  });

  it("pans on a trackpad swipe, whose wheelDeltaY is -3 times its deltaY", () => {
    expect(wheelIntent(wheel(0, 6, { wheelDeltaY: -18 }))).toEqual({ kind: "pan", dx: 0, dy: 6 });
    expect(wheelIntent(wheel(4, 2.5, { wheelDeltaY: -7 }))).toEqual({ kind: "pan", dx: 4, dy: 2.5 });
    expect(wheelIntent(wheel(0, 120, { wheelDeltaY: -360 }))).toEqual({ kind: "pan", dx: 0, dy: 120 });
  });

  it("zooms smoothly on a trackpad pinch, which the browser flags with Ctrl", () => {
    const intent = wheelIntent(wheel(0, -4.5, { ctrlKey: true }));
    expect(intent.kind).toBe("zoom");
    expect(intent.kind === "zoom" && intent.factor).toBeCloseTo(Math.exp(-0.045), 6);
  });

  it("pans by the swipe's pixels on a two-finger trackpad swipe", () => {
    expect(wheelIntent(wheel(12, -3.5))).toEqual({ kind: "pan", dx: 12, dy: -3.5 });
    expect(wheelIntent(wheel(0, 6))).toEqual({ kind: "pan", dx: 0, dy: 6 });
  });
});
