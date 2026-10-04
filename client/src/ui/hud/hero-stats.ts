import { content, RESOURCE_NAMES, type HeroStatDef } from "../../content/content";
import type { HeroState } from "../../net/protocol";

/** Stats whose ranks add a fraction (shown as a percent) rather than a flat amount. */
const PERCENT_STATS = new Set(["attackSpeed", "moveSpeed", "lifeSteal"]);

export interface HeroStatRow {
  id: string;
  icon: string;
  label: string;
  value: string;
  /** What spent ranks add, e.g. "+6" or "+12%"; absent with no ranks. */
  bonus?: string;
  tip: string;
}

function round1(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function isPercentStat(def: HeroStatDef): boolean {
  return PERCENT_STATS.has(def.id);
}

/** What `ranks` ranks of a stat add, formatted with its unit: "+9" or "+24%". */
export function statEffect(def: HeroStatDef, ranks: number): string {
  const total = def.perRank * ranks;
  return `+${isPercentStat(def) ? percent(total) : round1(total)}`;
}

function rankBonus(hero: HeroState, statId: string): string | undefined {
  const index = content.heroStats.findIndex((s) => s.id === statId);
  const ranks = hero.ranks[index] ?? 0;
  return index >= 0 && ranks > 0 ? statEffect(content.heroStats[index]!, ranks) : undefined;
}

/** The hero's live stats as HUD rows, each with the share its spent ranks add. */
export function heroStatRows(hero: HeroState): HeroStatRow[] {
  const s = hero.stats;
  const rules = content.rules;
  return [
    {
      id: "attackDamage",
      icon: "attackDamage",
      label: "Attack",
      value: round1(s.attack),
      bonus: rankBonus(hero, "attackDamage"),
      tip: "Damage of each basic attack, before the target's armor. Levels, Attack Damage ranks, items, talents and attack buffs raise it.",
    },
    {
      id: "attackSpeed",
      icon: "attackSpeed",
      label: "Attack speed",
      value: `${(1 / Math.max(0.01, s.cooldown)).toFixed(2)}/s`,
      bonus: rankBonus(hero, "attackSpeed"),
      tip: `Basic attacks per second (one every ${s.cooldown.toFixed(2)} s). Attack Speed ranks, items, talents and buffs add up.`,
    },
    {
      id: "maxHealth",
      icon: "maxHealth",
      label: "Health",
      value: `${Math.ceil(s.hp)}/${Math.ceil(s.maxHp)}`,
      bonus: rankBonus(hero, "maxHealth"),
      tip: "Current and maximum health. Levels, Max Health ranks, items and talents raise the maximum.",
    },
    {
      id: "regen",
      icon: "regen",
      label: "Regeneration",
      value: s.regenerating ? `+${round1(s.regen)}/s` : "resting",
      tip: `After ${rules.heroRegenDelaySeconds} s without taking damage, your hero heals ${percent(rules.heroRegenPerSecond)} of its maximum health per second. Regeneration items heal it all the time, even in a fight.`,
    },
    {
      id: "armor",
      icon: "armor",
      label: "Armor",
      value: `${s.armorMelee}/${s.armorPierce}`,
      tip: "Melee / ranged armor: subtracted from every hit of that kind. Armor items, talents and warding buffs add to it.",
    },
    {
      id: "moveSpeed",
      icon: "moveSpeed",
      label: "Speed",
      value: round1(s.speed),
      bonus: rankBonus(hero, "moveSpeed"),
      tip: "Tiles per second. Movement Speed ranks, items, talents and buffs add up.",
    },
    {
      id: "lifeSteal",
      icon: "lifeSteal",
      label: "Life steal",
      value: percent(s.lifeSteal),
      tip: "Share of basic-attack damage dealt that heals your hero. Life Steal ranks, items and talents give it.",
    },
    {
      id: "sight",
      icon: "sight",
      label: "Sight",
      value: String(s.sight),
      tip: "Vision radius in tiles. Trees block the view behind them.",
    },
  ];
}

/** "100 food, 50 gold" for a cost listed in resource order. */
export function describeCost(cost: readonly number[]): string {
  return cost
    .map((amount, i) => (amount > 0 ? `${amount} ${RESOURCE_NAMES[i]}` : ""))
    .filter(Boolean)
    .join(", ");
}
