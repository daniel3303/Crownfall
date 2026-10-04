import { describe, expect, it } from "vitest";
import { DEFAULT_LOOK, isUnlockedAt, registerUnlock, unlockablesOf, unlockedBetween, unlockLevel } from "../src/meta/unlocks";

describe("unlock registry", () => {
  it("owns every default cosmetic from level 1", () => {
    for (const id of Object.values(DEFAULT_LOOK)) expect(isUnlockedAt(id, 1), id).toBe(true);
  });

  it("offers several of each cosmetic kind, cheapest first", () => {
    for (const kind of ["title", "crest", "banner", "frame"] as const) {
      const items = unlockablesOf(kind);
      expect(items.length, kind).toBeGreaterThanOrEqual(5);
      expect(items.map((i) => i.level)).toEqual([...items.map((i) => i.level)].sort((a, b) => a - b));
    }
  });

  it("gates a registered hero by profile level", () => {
    registerUnlock({ id: "hero:test-ranger", kind: "hero", name: "Ranger", level: 7 });

    expect(unlockLevel("hero:test-ranger")).toBe(7);
    expect(isUnlockedAt("hero:test-ranger", 6)).toBe(false);
    expect(isUnlockedAt("hero:test-ranger", 7)).toBe(true);
  });

  it("never unlocks an id nobody registered", () => {
    expect(unlockLevel("hero:nobody")).toBeUndefined();
    expect(isUnlockedAt("hero:nobody", 999)).toBe(false);
  });

  it("lists what a climb unlocks, excluding the starting level", () => {
    const ids = unlockedBetween(1, 3).map((u) => u.id);

    expect(ids).toEqual(expect.arrayContaining(["title:squire", "crest:swords", "banner:azure", "frame:bronze"]));
    expect(ids).not.toContain("title:recruit");
    expect(unlockedBetween(5, 5)).toEqual([]);
  });
});
