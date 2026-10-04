import { abilityDef, content, heroKit, unitDef, type AbilityDef, type TalentDef } from "../../content/content";

/** Talents never take an ability's base cooldown below this many seconds, as on the server. */
const MIN_BASE_COOLDOWN = 1;

/** The kit slot whose ability answers a key, or -1; keys compare without case. */
export function slotForKey(heroId: string | undefined, key: string): number {
  return heroKit(heroId).findIndex((a) => a.key.toLowerCase() === key.toLowerCase());
}

/** The hero's talents by tier, null where unpicked; ids the hero does not offer read as unpicked. */
export function pickedTalents(heroId: string, ids: readonly (string | null)[] | undefined): (TalentDef | null)[] {
  const tiers = unitDef(heroId).talents ?? [];
  return tiers.map((options, tier) => options.find((t) => t.id === ids?.[tier]) ?? null);
}

/** The first tier the hero's level has opened that no pick fills yet, or -1. */
export function openTalentTier(heroId: string, level: number, ids: readonly (string | null)[] | undefined): number {
  const levels = content.rules.heroTalentLevels ?? [];
  return pickedTalents(heroId, ids).findIndex((talent, tier) => talent === null && level >= (levels[tier] ?? Infinity));
}

/** An ability's numbers for a hero of this level with these talents; base cooldown before the level and item factor. */
export interface AbilityNumbers {
  damage?: number;
  heal?: number;
  cooldown: number;
  radius: number;
  range?: number;
  duration?: number;
  stun?: number;
}

/** The same sums the server's HeroState makes: a talent changes only the ability it names. */
export function abilityNumbers(ability: AbilityDef, level: number, talents: readonly (TalentDef | null)[]): AbilityNumbers {
  const sum = (pick: (t: TalentDef) => number | undefined) =>
    talents.reduce((total, t) => (t && t.ability === ability.id ? total + (pick(t) ?? 0) : total), 0);
  const grown = (base: number | undefined, perLevel: number | undefined) => (base === undefined ? undefined : base + (perLevel ?? 0) * Math.max(0, level - 1));
  const boost = 1 + sum((t) => t.abilityDamage);
  const damage = grown(ability.damage, ability.damagePerLevel);
  const heal = grown(ability.heal, ability.healPerLevel);
  const extra = (base: number | undefined, pick: (t: TalentDef) => number | undefined) => {
    const added = sum(pick);
    return base === undefined && added === 0 ? undefined : (base ?? 0) + added;
  };
  return {
    damage: damage === undefined ? undefined : Math.round(damage * boost),
    heal: heal === undefined ? undefined : Math.round(heal * boost),
    cooldown: Math.max(Math.min(ability.cooldown, MIN_BASE_COOLDOWN), ability.cooldown - sum((t) => t.cooldown)),
    radius: ability.radius + sum((t) => t.radius),
    range: extra(ability.range, (t) => t.range),
    duration: extra(ability.duration, (t) => t.duration),
    stun: extra(ability.stun, (t) => t.stun),
  };
}

const percent = (share: number) => `${Math.round(share * 100)}%`;
const seconds = (value: number) => `${Number(value.toFixed(1))} s`;

/** One short line per effect of a talent, worded from its numbers. */
export function talentLines(talent: TalentDef): string[] {
  const ability = talent.ability ? abilityDef(talent.ability) : undefined;
  const name = ability?.name ?? "";
  const lines: string[] = [];
  if (talent.abilityDamage) lines.push(`+${percent(talent.abilityDamage)} ${name} ${ability?.effect === "heal" ? "healing" : "damage"}`);
  if (talent.radius) lines.push(`+${talent.radius} ${name} radius`);
  if (talent.range) lines.push(`+${talent.range} ${name} range`);
  if (talent.duration) lines.push(`+${seconds(talent.duration)} ${name} duration`);
  if (talent.stun) lines.push(`+${seconds(talent.stun)} ${name} stun`);
  if (talent.cooldown) lines.push(`−${seconds(talent.cooldown)} ${name} cooldown`);
  if (talent.hp) lines.push(`+${talent.hp} health`);
  if (talent.attack) lines.push(`+${talent.attack} attack damage`);
  if (talent.armor && (talent.armor.melee || talent.armor.pierce)) {
    lines.push(talent.armor.melee === talent.armor.pierce ? `+${talent.armor.melee} armor` : `+${talent.armor.melee} melee, +${talent.armor.pierce} pierce armor`);
  }
  if (talent.attackSpeed) lines.push(`+${percent(talent.attackSpeed)} attack speed`);
  if (talent.moveSpeed) lines.push(`+${percent(talent.moveSpeed)} move speed`);
  if (talent.lifeSteal) lines.push(`+${percent(talent.lifeSteal)} life steal`);
  return lines;
}

/** The icon a talent shows: its ability's, or the hero stat it raises most plainly. */
export function talentIcon(talent: TalentDef): string {
  if (talent.ability) return talent.ability;
  if (talent.hp) return "maxHealth";
  if (talent.attack) return "attackDamage";
  if (talent.armor) return "armor";
  if (talent.attackSpeed) return "attackSpeed";
  if (talent.moveSpeed) return "moveSpeed";
  if (talent.lifeSteal) return "lifeSteal";
  return "talent";
}
