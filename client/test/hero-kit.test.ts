import { describe, expect, it } from "vitest";
import { abilityDef, content, unitDef } from "../src/content/content";
import { abilityNumbers, openTalentTier, pickedTalents, slotForKey, talentIcon, talentLines } from "../src/ui/hud/hero-kit";

// Every key AbilityDef and TalentDef declare; game.json must not grow one the client types do not mirror.
const ABILITY_KEYS = ["id", "name", "key", "effect", "unlockLevel", "cooldown", "radius", "range", "damage", "damagePerLevel", "duration", "delay", "attackSpeedBonus", "speedBonus", "armorBonus", "attackBonus", "heal", "healPerLevel", "speed", "stun", "buildingMultiplier", "description"];
const TALENT_KEYS = ["id", "name", "ability", "abilityDamage", "cooldown", "radius", "range", "duration", "stun", "hp", "attack", "armor", "attackSpeed", "moveSpeed", "lifeSteal"];

const talent = (hero: string, id: string) => unitDef(hero).talents!.flat().find((t) => t.id === id)!;

describe("hero kits", () => {
  it("maps each key to the slot of the hero's own ability", () => {
    expect(slotForKey("archmage", "q")).toBe(0);
    expect(slotForKey("archmage", "R")).toBe(3);
    expect(slotForKey("shaman", "e")).toBe(2);
    expect(slotForKey("paladin", "z")).toBe(-1);
    expect(slotForKey(undefined, "q")).toBe(-1);
  });

  it("mirrors every ability and talent key game.json uses", () => {
    const talents = content.units.flatMap((u) => u.talents?.flat() ?? []);

    expect(talents.length).toBeGreaterThan(0);
    for (const a of content.abilities) expect(ABILITY_KEYS).toEqual(expect.arrayContaining(Object.keys(a)));
    for (const t of talents) expect(TALENT_KEYS).toEqual(expect.arrayContaining(Object.keys(t)));
  });
});

describe("talent tiers", () => {
  it("reads the picks per tier and ignores an id the hero does not offer", () => {
    const picks = pickedTalents("paladin", ["bulwark", "warDrums", null]);

    expect(picks.map((t) => t?.id ?? null)).toEqual(["bulwark", null, null]);
  });

  it("opens the lowest tier the level has reached that no pick fills", () => {
    const [first, second] = content.rules.heroTalentLevels;

    expect(openTalentTier("ranger", first! - 1, [null, null, null])).toBe(-1);
    expect(openTalentTier("ranger", first!, [null, null, null])).toBe(0);
    expect(openTalentTier("ranger", second!, [null, null, null])).toBe(0);
    expect(openTalentTier("ranger", second!, ["barbedVolley", null, null])).toBe(1);
    expect(openTalentTier("ranger", first!, ["barbedVolley", null, null])).toBe(-1);
  });
});

describe("ability numbers", () => {
  it("grows damage with level and raises only the ability a talent names", () => {
    const cleave = abilityDef("cleave");
    const charge = abilityDef("charge");
    const picks = [talent("paladin", "righteousCleave")];

    const plain = abilityNumbers(cleave, 5, []);
    const talented = abilityNumbers(cleave, 5, picks);

    expect(plain.damage).toBe(cleave.damage! + 4 * cleave.damagePerLevel!);
    expect(talented.damage).toBe(Math.round(plain.damage! * 1.35));
    expect(talented.radius).toBe(cleave.radius + 0.5);
    expect(abilityNumbers(charge, 5, picks)).toEqual(abilityNumbers(charge, 5, []));
  });

  it("takes talent seconds off the base cooldown and adds stun", () => {
    const charge = abilityDef("charge");

    const numbers = abilityNumbers(charge, 7, [null, talent("paladin", "relentlessCharge")]);

    expect(numbers.cooldown).toBe(charge.cooldown - 4);
    expect(numbers.stun).toBe(charge.stun! + 0.5);
  });

  it("grows a heal with level and boosts it with its talent", () => {
    const wave = abilityDef("healingWave");

    const numbers = abilityNumbers(wave, 3, [null, talent("shaman", "tidalHealing")]);

    expect(numbers.heal).toBe(Math.round((wave.heal! + 2 * wave.healPerLevel!) * 1.5));
    expect(numbers.damage).toBeUndefined();
  });
});

describe("talent text", () => {
  it("words each effect from the talent's numbers", () => {
    expect(talentLines(talent("paladin", "righteousCleave"))).toEqual(["+35% Cleave damage", "+0.5 Cleave radius"]);
    expect(talentLines(talent("paladin", "relentlessCharge"))).toEqual(["+0.5 s Charge stun", "−4 s Charge cooldown"]);
    expect(talentLines(talent("shaman", "tidalHealing"))).toContain("+50% Healing Wave healing");
    expect(talentLines(talent("paladin", "bulwark"))).toEqual(["+2 armor"]);
    expect(talentLines(talent("warchief", "warlord"))).toEqual(["+6 attack damage", "+15% attack speed"]);
  });

  it("shows the ability's icon, or the stat a plain talent raises", () => {
    expect(talentIcon(talent("archmage", "searingFireball"))).toBe("fireball");
    expect(talentIcon(talent("paladin", "crusadersVigor"))).toBe("maxHealth");
    expect(talentIcon(talent("ranger", "fleetFoot"))).toBe("moveSpeed");
  });
});
