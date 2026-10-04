import { describe, expect, it } from "vitest";
import { buildingDef, heroKit, raceHeroes, trainableFor, trainLock, unitDef } from "../src/content/content";
import { heroUnlockLevel, isHeroUnlocked, pickedHero } from "../src/meta/heroes";

describe("race heroes", () => {
  it("offers three heroes per race with the classic one first, each with a four-ability kit", () => {
    expect(raceHeroes("humans").map((h) => h.id)).toEqual(["paladin", "archmage", "ranger"]);
    expect(raceHeroes("orcs").map((h) => h.id)).toEqual(["warchief", "shaman", "blademaster"]);
    for (const hero of [...raceHeroes("humans"), ...raceHeroes("orcs")]) expect(heroKit(hero.id).map((a) => a.key)).toEqual(["Q", "W", "E", "R"]);
  });

  it("gates the new heroes by profile level and owns the classic ones from the start", () => {
    expect(heroUnlockLevel("paladin")).toBe(1);
    expect(heroUnlockLevel("archmage")).toBe(2);
    expect(heroUnlockLevel("shaman")).toBe(2);
    expect(heroUnlockLevel("ranger")).toBe(3);
    expect(heroUnlockLevel("blademaster")).toBe(3);
    expect(isHeroUnlocked("ranger", 2)).toBe(false);
    expect(isHeroUnlocked("ranger", 3)).toBe(true);
  });

  it("leads the saved pick only while the race fields it and the level owns it", () => {
    expect(pickedHero("humans", "archmage", 2)).toBe("archmage");
    expect(pickedHero("humans", "archmage", 1)).toBe("paladin");
    expect(pickedHero("humans", "shaman", 9)).toBe("paladin");
    expect(pickedHero("orcs", undefined, 9)).toBe("warchief");
  });
});

describe("race units", () => {
  it("lists each race's own unique unit at the barracks and hides the other race's", () => {
    const barracks = buildingDef("barracks");

    expect(trainableFor(barracks, "humans")).toEqual(["spearman", "archer", "rider", "knight"]);
    expect(trainableFor(barracks, "orcs")).toEqual(["spearman", "archer", "rider", "berserker"]);
  });

  it("locks a unique unit until its barracks reaches level 2, with the server's reason", () => {
    const barracks = buildingDef("barracks");

    expect(trainLock(unitDef("knight"), barracks, 1)).toBe("Knight needs a level 2 Barracks.");
    expect(trainLock(unitDef("knight"), barracks, 2)).toBeNull();
    expect(trainLock(unitDef("spearman"), barracks, 1)).toBeNull();
  });
});
