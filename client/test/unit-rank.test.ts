import { describe, expect, it } from "vitest";
import { buildingDef, buildingStats, content, heroCooldownFactor, heroKillGold, kindInfo, kinds, troopRank } from "../src/content/content";
import { levelFields } from "../src/game/world";
import { Flags, type EntityRecord } from "../src/net/protocol";

const kindOf = (id: string) => kinds.findIndex((k) => k.def.id === id);

function unit(id: string, extra: number, flags = 0): EntityRecord {
  return { id: 1, kind: kindOf(id), owner: 0, x: 1, y: 1, hp: 10, maxHp: 10, state: 0, facing: 0, extra, flags, attackSpeed: 1 };
}

describe("troopRank", () => {
  it("gives a unit from an upgraded barracks that level's health and attack", () => {
    const elite = troopRank("spearman", 3);
    const barracks = buildingStats(buildingDef("barracks"), 3);

    expect(elite).toEqual({ name: "Elite", hp: barracks.troopHp, attack: barracks.troopAttack, trainer: "Barracks" });
    expect(troopRank("spearman", 2)?.name).toBe("Veteran");
  });

  it("names no rank where no stronger troops are drilled", () => {
    expect(troopRank("spearman", 1)).toBeNull();
    expect(troopRank("villager", 3)).toBeNull();
  });
});

describe("levelFields", () => {
  it("reads a soldier's rank, but not a load it carries, from its extra byte", () => {
    const spearman = kindInfo(kindOf("spearman"))!;

    expect(levelFields(unit("spearman", 3), spearman).level).toBe(3);
    expect(levelFields(unit("spearman", 9, Flags.Carrying), spearman).level).toBe(1);
  });

  it("keeps a hero's level while it carries a load", () => {
    const hero = kinds.find((k) => k.category === "unit" && k.def.id === "paladin")!;

    expect(levelFields(unit("paladin", 6, Flags.Hero | Flags.Carrying), hero).level).toBe(6);
  });
});

describe("heroKillGold", () => {
  it("pays more for a higher level hero", () => {
    expect(heroKillGold(5)).toBeGreaterThan(heroKillGold(1));
    expect(heroKillGold(1)).toBe(100);
  });
});

describe("heroCooldownFactor", () => {
  it("shortens ability cooldowns with every hero level, down to the cap", () => {
    expect(heroCooldownFactor(1)).toBe(1);
    expect(heroCooldownFactor(6)).toBeCloseTo(1 - 5 * content.rules.heroCooldownReductionPerLevel);
    expect(heroCooldownFactor(3)).toBeLessThan(heroCooldownFactor(2));
    expect(heroCooldownFactor(1000)).toBeCloseTo(1 - content.rules.heroCooldownReductionMax);
  });
});
