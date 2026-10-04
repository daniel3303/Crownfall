import { describe, expect, it } from "vitest";
import { content } from "../src/content/content";
import type { HeroState } from "../src/net/protocol";
import { describeCost, heroStatRows, statEffect } from "../src/ui/hud/hero-stats";

const stat = (id: string) => content.heroStats.find((s) => s.id === id)!;

function hero(ranks: Record<string, number> = {}): HeroState {
  return {
    id: 7,
    unit: "paladin",
    level: 4,
    xp: 400,
    xpLevelStart: 360,
    xpNextLevel: 560,
    cooldowns: [0, 0, 0, 0],
    unspentPoints: 0,
    ranks: content.heroStats.map((s) => ranks[s.id] ?? 0),
    reviveSeconds: 0,
    canRevive: false,
    reviveCost: [175, 0, 0, 140],
    items: [null, null, null, null, null, null],
    canShop: false,
    streak: 0,
    cooldownFactor: 0.94,
    stats: { hp: 300, maxHp: 410, attack: 25.5, cooldown: 1.0, range: 0.6, speed: 2.6, armorMelee: 3, armorPierce: 3, lifeSteal: 0.16, sight: 16, regen: 10.25, regenerating: true },
  };
}

describe("hero stats", () => {
  it("formats flat ranks as amounts and fractional ranks as percents", () => {
    expect(statEffect(stat("attackDamage"), 2)).toBe(`+${stat("attackDamage").perRank * 2}`);
    expect(statEffect(stat("attackSpeed"), 2)).toBe(`+${Math.round(stat("attackSpeed").perRank * 200)}%`);
  });

  it("shows the rank bonus only for stats with ranks", () => {
    const rows = heroStatRows(hero({ attackDamage: 2, lifeSteal: 2 }));
    const attack = rows.find((r) => r.id === "attackDamage")!;
    const speed = rows.find((r) => r.id === "moveSpeed")!;

    expect(attack.value).toBe("25.5");
    expect(attack.bonus).toBe(statEffect(stat("attackDamage"), 2));
    expect(speed.bonus).toBeUndefined();
    expect(rows.find((r) => r.id === "lifeSteal")!.value).toBe("16%");
  });

  it("reports attacks per second and live regeneration", () => {
    const rows = heroStatRows(hero());

    expect(rows.find((r) => r.id === "attackSpeed")!.value).toBe("1.00/s");
    expect(rows.find((r) => r.id === "regen")!.value).toBe("+10.3/s");
  });

  it("lists only the resources a cost uses", () => {
    expect(describeCost([175, 0, 0, 140])).toBe("175 food, 140 gold");
  });
});
