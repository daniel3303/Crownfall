import { describe, expect, it } from "vitest";
import { buildingDef, buildingLevels, buildingStats, content, maxLevel } from "../src/content/content";
import { storageLevel, upgradeChanges, upgradeRequirement } from "../src/ui/hud/building-upgrades";

describe("building levels", () => {
  it("inherits every stat a level leaves out", () => {
    const house = buildingDef("house");
    const [first, second, third] = buildingLevels(house);

    expect(second!.pop).toBeGreaterThan(first!.pop);
    expect(second!.sight).toBe(first!.sight);
    expect(third!.sight).toBe(first!.sight);
    expect(buildingStats(house, 99)).toBe(third);
  });

  it("lists only the stats an upgrade changes", () => {
    const townCenter = buildingDef("townCenter");
    const rows = upgradeChanges(townCenter, 1);

    expect(rows.find((r) => r.label === "Health")).toEqual({ label: "Health", from: "2400", to: String(buildingStats(townCenter, 2).hp) });
    expect(rows.map((r) => r.label)).toContain("Storage");
    expect(rows.map((r) => r.label)).not.toContain("Farm yield");
    expect(upgradeChanges(townCenter, maxLevel(townCenter))).toEqual([]);
  });

  it("shows the stronger troops a barracks upgrade drills", () => {
    const rows = upgradeChanges(buildingDef("barracks"), 2);

    expect(rows.find((r) => r.label === "Troop health")).toEqual({ label: "Troop health", from: "+10%", to: "+25%" });
    expect(rows.map((r) => r.label)).toContain("Troop attack");
    expect(upgradeChanges(buildingDef("farm"), 1).map((r) => r.label)).not.toContain("Troop health");
  });

  it("lets every building reach level 3", () => {
    for (const def of content.buildings) expect(maxLevel(def), def.id).toBe(3);
  });

  it("gates the third barracks level behind a level 2 town center", () => {
    const barracks = buildingDef("barracks");

    expect(upgradeRequirement(barracks, 1)).toBe(0);
    expect(upgradeRequirement(barracks, 2)).toBe(2);
    expect(upgradeRequirement(barracks, 3)).toBe(0);
  });
});

describe("storageLevel", () => {
  it("warns near the cap and flags it once full", () => {
    expect(storageLevel(100, 600)).toBe("ok");
    expect(storageLevel(520, 600)).toBe("near");
    expect(storageLevel(600, 600)).toBe("full");
    expect(storageLevel(0, 0)).toBe("full");
  });
});
