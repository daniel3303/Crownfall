import { describe, expect, it } from "vitest";
import { bodyInRect, distanceToBody, HERO_PICK_REACH, nearestBody, type PickCandidate } from "../src/render/screen-pick";

const body = { feet: { x: 100, y: 200 }, head: { x: 100, y: 140 } };

describe("distanceToBody", () => {
  it("is zero on the head, the waist and the feet of a standing unit", () => {
    expect(distanceToBody(body, 100, 140)).toBe(0);
    expect(distanceToBody(body, 100, 170)).toBe(0);
    expect(distanceToBody(body, 100, 200)).toBe(0);
  });

  it("measures sideways from the body and past the head or feet from their ends", () => {
    expect(distanceToBody(body, 112, 160)).toBe(12);
    expect(distanceToBody(body, 100, 130)).toBe(10);
    expect(distanceToBody(body, 103, 204)).toBe(5);
  });

  it("treats a body seen from straight above as a point", () => {
    expect(distanceToBody({ feet: { x: 10, y: 10 }, head: { x: 10, y: 10 } }, 13, 14)).toBe(5);
  });
});

describe("bodyInRect", () => {
  it("catches a unit whose head is boxed although its feet are not", () => {
    expect(bodyInRect(body, { x0: 80, y0: 130, x1: 120, y1: 150 })).toBe(true);
  });

  it("accepts the rectangle's corners in any order", () => {
    expect(bodyInRect(body, { x0: 120, y0: 210, x1: 80, y1: 190 })).toBe(true);
  });

  it("misses a unit standing beside the box", () => {
    expect(bodyInRect(body, { x0: 110, y0: 130, x1: 150, y1: 210 })).toBe(false);
  });

  it("catches a body crossed by a box thinner than a sample step", () => {
    expect(bodyInRect(body, { x0: 80, y0: 152, x1: 120, y1: 154 })).toBe(true);
    expect(bodyInRect({ feet: { x: 100, y: 200 }, head: { x: 130, y: 140 } }, { x0: 112, y0: 160, x1: 113, y1: 180 })).toBe(true);
  });
});

describe("nearestBody", () => {
  const at = (x: number, item: string, hero = false): PickCandidate<string> => ({
    item,
    body: { feet: { x, y: 200 }, head: { x, y: 150 } },
    reach: 10,
    hero,
  });

  it("picks the nearest body within reach, and nothing beyond it", () => {
    expect(nearestBody([at(100, "near"), at(130, "far")], 106, 170, true)).toBe("near");
    expect(nearestBody([at(100, "near")], 111, 170, true)).toBeUndefined();
  });

  it("lets a hero be clicked from farther away", () => {
    expect(nearestBody([at(100, "hero", true)], 100 + 10 * HERO_PICK_REACH - 1, 170, false)).toBe("hero");
  });

  it("lets a hero win a shared click only where heroes are favoured", () => {
    const crowd = [at(100, "spearman"), at(112, "hero", true)];

    expect(nearestBody(crowd, 105, 170, true)).toBe("hero");
    expect(nearestBody(crowd, 105, 170, false)).toBe("spearman");
  });
});
