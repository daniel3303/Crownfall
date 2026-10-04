import { describe, expect, it } from "vitest";
import { content, heroCooldownFactor, itemDef, itemRefund, shutdownGold } from "../src/content/content";
import type { HeroState } from "../src/net/protocol";
import { itemStatLines, shopBlock, shopItems } from "../src/ui/hud/items";

// Every key ItemDef declares; content.json must not grow one the client type does not mirror.
const ITEM_KEYS = ["id", "name", "cost", "attack", "hp", "armor", "attackSpeed", "moveSpeed", "lifeSteal", "regen", "cooldownReduction", "description"];

function hero(patch: Partial<HeroState> = {}): HeroState {
  return {
    id: 7,
    unit: "paladin",
    level: 1,
    xp: 0,
    xpLevelStart: 0,
    xpNextLevel: 100,
    cooldowns: [0, 0, 0, 0],
    unspentPoints: 0,
    ranks: content.heroStats.map(() => 0),
    reviveSeconds: 0,
    canRevive: false,
    reviveCost: [0, 0, 0, 0],
    items: [null, null, null, null, null, null],
    canShop: true,
    streak: 0,
    cooldownFactor: 1,
    stats: { hp: 300, maxHp: 300, attack: 20, cooldown: 1, range: 0.6, speed: 2.6, armorMelee: 2, armorPierce: 2, lifeSteal: 0, sight: 16, regen: 0, regenerating: false },
    ...patch,
  };
}

const rich = [5000, 5000, 5000, 5000];

describe("hero items", () => {
  it("declares only keys the client mirrors", () => {
    for (const item of content.items) expect(ITEM_KEYS).toEqual(expect.arrayContaining(Object.keys(item)));
  });

  it("lists cheap starters first and a late item last", () => {
    const items = shopItems();
    const gold = (id: string) => itemDef(id)!.cost.gold ?? 0;

    expect(items[0]!.cost.gold).toBeLessThanOrEqual(150);
    expect(gold(items[items.length - 1]!.id)).toBeGreaterThanOrEqual(600);
    expect(items.length).toBe(content.items.length);
  });

  it("describes every stat an item gives", () => {
    const blade = itemDef("warlordBlade")!;
    const plate = itemDef("plateArmor")!;

    expect(itemStatLines(blade).map((l) => l.text)).toEqual([`+${blade.attack} attack`, `+${Math.round(blade.attackSpeed! * 100)}% attack speed`]);
    expect(itemStatLines(plate).map((l) => l.icon)).toEqual(["maxHealth", "armor"]);
    for (const item of content.items) expect(itemStatLines(item).length).toBeGreaterThan(0);
  });

  it("refuses a purchase for the same reason the server would, in its order", () => {
    const sword = itemDef("ironSword")!;
    const full = ["regenRing", "hasteGloves", "vampireFang", "sageTalisman", "plateArmor", "warlordBlade"];

    expect(shopBlock(sword, hero({ id: 0 }), rich)).toBe("fallen");
    expect(shopBlock(sword, hero({ canShop: false }), rich)).toBe("away");
    expect(shopBlock(sword, hero({ items: ["ironSword", null, null, null, null, null] }), rich)).toBe("owned");
    expect(shopBlock(sword, hero({ items: full }), rich)).toBe("full");
    expect(shopBlock(sword, hero(), [0, 0, 0, 0])).toBe("poor");
    expect(shopBlock(sword, hero(), rich)).toBeNull();
  });

  it("refunds the server's share of the price, rounded down", () => {
    const plate = itemDef("plateArmor")!;
    const refund = itemRefund(plate);

    expect(refund.gold).toBe(Math.floor(plate.cost.gold! * content.rules.itemSellRefund));
    expect(refund.food).toBeUndefined();
  });

  it("stacks item cooldown reduction on the level's under one cap", () => {
    const rules = content.rules;

    expect(heroCooldownFactor(1, 0.2)).toBeCloseTo(0.8);
    expect(heroCooldownFactor(5, 0)).toBeCloseTo(heroCooldownFactor(5));
    expect(heroCooldownFactor(1000, 1)).toBeCloseTo(1 - rules.heroCooldownReductionCap);
  });

  it("pays a shutdown bonus only from the rules' streak length", () => {
    const rules = content.rules;

    expect(shutdownGold(rules.heroShutdownStreak - 1)).toBe(0);
    expect(shutdownGold(rules.heroShutdownStreak)).toBe(rules.heroShutdownGold);
    expect(shutdownGold(rules.heroShutdownStreak + 2)).toBe(rules.heroShutdownGold + 2 * rules.heroShutdownGoldPerKill);
  });
});
