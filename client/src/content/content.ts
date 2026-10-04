import gameJson from "../../../content/game.json";

export type ResourceName = "food" | "wood" | "stone" | "gold";
export const RESOURCE_NAMES: ResourceName[] = ["food", "wood", "stone", "gold"];
export type Cost = Partial<Record<ResourceName, number>>;

export interface Armor {
  melee: number;
  pierce: number;
}

export interface UnitDef {
  id: string;
  name: string;
  /** The model the client draws when the unit borrows another's until its own exists. */
  model?: string;
  hp: number;
  attack: number;
  damageType: "melee" | "pierce";
  range: number;
  cooldown: number;
  armor: Armor;
  speed: number;
  sight: number;
  /** Radius in which the unit picks its own fights; defaults to sight. */
  acquireRange?: number;
  radius: number;
  cost?: Cost;
  trainTime?: number;
  pop?: number;
  xp: number;
  tags: string[];
  bonus?: { vs: string; damage: number }[];
  gatherRates?: Cost;
  buildRate?: number;
  bounty?: Cost;
  /** Per-level growth; each level adds `curve` times more of it than the one before. */
  growth?: { hp: number; attack: number; curve?: number };
  /** Radius around a melee blow's target in which every other enemy takes the full blow too. */
  splash?: number;
  /** A hero's kit by slot, as ability ids. */
  abilities?: string[];
  /** A hero's talent tiers, one per `rules.heroTalentLevels` entry, each a choice of options. */
  talents?: TalentDef[][];
  /** Races that may train the unit; empty or absent means every race. */
  races?: string[];
  /** Level the training building must reach before it trains the unit. */
  requiresTrainerLevel?: number;
}

/** A passive hero perk; ability modifiers apply to `ability` only, stat bonuses always. */
export interface TalentDef {
  id: string;
  name: string;
  ability?: string;
  /** Share added to the ability's damage or healing. */
  abilityDamage?: number;
  /** Seconds taken off the ability's base cooldown. */
  cooldown?: number;
  radius?: number;
  range?: number;
  duration?: number;
  stun?: number;
  hp?: number;
  attack?: number;
  armor?: Armor;
  attackSpeed?: number;
  moveSpeed?: number;
  lifeSteal?: number;
}

export interface BuildingDef {
  id: string;
  name: string;
  size: number;
  hp: number;
  armor: Armor;
  sight: number;
  cost: Cost;
  buildTime: number;
  pop?: number;
  dropOff?: ResourceName[];
  trains?: string[];
  attack?: AttackDef;
  walkable?: boolean;
  foodRate?: number;
  /** How much of each resource the building lets its owner store. */
  storage?: number;
  /** True when the owner can trade resources for gold here. */
  market?: boolean;
  trainSpeed?: number;
  /** Upgrade steps for levels 2 and up. */
  levels?: BuildingLevelDef[];
  tags?: string[];
  hotkey?: string;
}

/** One upgrade step: its price and time, and the stats that change; a stat left out keeps its previous value. */
export interface BuildingLevelDef {
  cost: Cost;
  time: number;
  townCenterLevel?: number;
  hp?: number;
  armor?: Armor;
  sight?: number;
  pop?: number;
  attack?: AttackDef;
  foodRate?: number;
  trainSpeed?: number;
  storage?: number;
  troopHp?: number;
  troopAttack?: number;
}

export interface AttackDef {
  damage: number;
  damageType: string;
  range: number;
  cooldown: number;
}

/** A building's resolved stats at one level, with the price of upgrading into it (empty at level 1). */
export interface BuildingStats {
  level: number;
  hp: number;
  armor: Armor;
  sight: number;
  pop: number;
  attack?: AttackDef;
  foodRate: number;
  trainSpeed: number;
  storage: number;
  /** Health and attack multipliers for units trained at this level. */
  troopHp: number;
  troopAttack: number;
  cost: Cost;
  time: number;
  townCenterLevel: number;
}

export interface NodeDef {
  id: string;
  name: string;
  size: number;
  amount: number;
  resource: ResourceName;
}

export interface RaceDef {
  id: string;
  name: string;
  /** The classic hero, which a seat leads when it picks none. */
  hero: string;
  /** Every hero a seat of this race may pick, the classic one first. */
  heroes?: string[];
  description: string;
  buildingHpMultiplier?: number;
}

export interface AbilityDef {
  id: string;
  name: string;
  key: string;
  effect: "nova" | "buff" | "strike" | "dash" | "heal";
  unlockLevel: number;
  cooldown: number;
  radius: number;
  range?: number;
  damage?: number;
  damagePerLevel?: number;
  duration?: number;
  delay?: number;
  attackSpeedBonus?: number;
  speedBonus?: number;
  /** Armor a buff adds against both damage types. */
  armorBonus?: number;
  /** Share a buff adds to attack damage. */
  attackBonus?: number;
  /** Health a heal restores at level 1, growing by `healPerLevel`. */
  heal?: number;
  healPerLevel?: number;
  /** Dash travel speed in tiles per second. */
  speed?: number;
  /** Seconds a dash or strike stuns what it hits. */
  stun?: number;
  buildingMultiplier?: number;
  description: string;
}

export interface HeroStatDef {
  id: string;
  name: string;
  /** Flat for damage and health, a fraction for speeds and life steal. */
  perRank: number;
  description: string;
}

/** An item a hero carries in an inventory slot; every stat is flat or a fraction, and a stat left out is 0. */
export interface ItemDef {
  id: string;
  name: string;
  cost: Cost;
  attack?: number;
  hp?: number;
  armor?: Armor;
  attackSpeed?: number;
  moveSpeed?: number;
  lifeSteal?: number;
  /** Hp per second, always on. */
  regen?: number;
  /** Share taken off ability cooldowns, before the overall cap. */
  cooldownReduction?: number;
  description: string;
}

export interface KillStreakDef {
  kills: number;
  title: string;
}

export interface DragonDef {
  unit: string;
  spawnSeconds: number;
  respawnSeconds: number;
  gold: number;
  buffSeconds: number;
  buffAttack: number;
  leashRange: number;
}

export interface Rules {
  tickRate: number;
  carryCapacity: number;
  tributeTax: number;
  populationLimit: number;
  heroXpLevels: number[];
  heroXpStepGrowth: number;
  heroRespawnSeconds: number;
  heroRespawnPerLevel: number;
  heroKillGold: number;
  heroKillGoldPerLevel: number;
  heroCooldownReductionPerLevel: number;
  heroCooldownReductionMax: number;
  /** Cap on level and item cooldown reduction together. */
  heroCooldownReductionCap: number;
  firstBloodGold: number;
  heroShutdownStreak: number;
  heroShutdownGold: number;
  heroShutdownGoldPerKill: number;
  killStreaks: KillStreakDef[];
  /** Hero level at which each talent tier opens. */
  heroTalentLevels: number[];
  heroInventorySlots: number;
  /** Tiles from an own completed town center within which a hero trades items. */
  itemShopRange: number;
  itemSellRefund: number;
  dragon?: DragonDef;
  heroRegenDelaySeconds: number;
  heroRegenPerSecond: number;
  stealRate: number;
  market: { lot: number; prices: Cost; spread: number; step: number; minPrice: number; maxPrice: number; driftPerSecond: number };
}

export interface GameContent {
  rules: Rules;
  units: UnitDef[];
  buildings: BuildingDef[];
  nodes: NodeDef[];
  races: RaceDef[];
  abilities: AbilityDef[];
  heroStats: HeroStatDef[];
  items: ItemDef[];
}

export type KindInfo =
  | { kind: number; category: "unit"; def: UnitDef }
  | { kind: number; category: "building"; def: BuildingDef }
  | { kind: number; category: "node"; def: NodeDef };

export const content = gameJson as unknown as GameContent;

/** Kind ids number units, then buildings, then nodes, exactly like the server's ContentDb. */
export const kinds: KindInfo[] = [
  ...content.units.map((def) => ({ category: "unit" as const, def })),
  ...content.buildings.map((def) => ({ category: "building" as const, def })),
  ...content.nodes.map((def) => ({ category: "node" as const, def })),
].map((info, kind) => ({ ...info, kind }) as KindInfo);

export function kindInfo(kind: number): KindInfo | undefined {
  return kinds[kind];
}

export function unitDef(id: string): UnitDef {
  const def = content.units.find((u) => u.id === id);
  if (!def) throw new Error(`Unknown unit ${id}`);
  return def;
}

export function buildingDef(id: string): BuildingDef {
  const def = content.buildings.find((b) => b.id === id);
  if (!def) throw new Error(`Unknown building ${id}`);
  return def;
}

export function costList(cost: Cost | undefined): number[] {
  return RESOURCE_NAMES.map((name) => cost?.[name] ?? 0);
}

export function canAfford(cost: Cost | undefined, stock: number[]): boolean {
  return costList(cost).every((amount, i) => (stock[i] ?? 0) >= amount);
}

export function isVillager(def: UnitDef): boolean {
  return def.tags.includes("villager");
}

export function isHero(def: UnitDef): boolean {
  return def.tags.includes("hero");
}

export function abilityDef(id: string): AbilityDef {
  const def = content.abilities.find((a) => a.id === id);
  if (!def) throw new Error(`Unknown ability ${id}`);
  return def;
}

/** A hero's abilities by slot; a unit without a kit has none. */
export function heroKit(heroId: string | undefined): AbilityDef[] {
  const hero = heroId ? content.units.find((u) => u.id === heroId) : undefined;
  return (hero?.abilities ?? []).map(abilityDef);
}

/** The heroes a race may lead, the classic one first. */
export function raceHeroes(raceId: string | undefined): UnitDef[] {
  const race = content.races.find((r) => r.id === raceId);
  if (!race) return [];
  return (race.heroes?.length ? race.heroes : [race.hero]).map(unitDef);
}

/** True when a seat of the race may train the unit. */
export function allowsRace(def: UnitDef, raceId: string | undefined): boolean {
  return !def.races?.length || (raceId !== undefined && def.races.includes(raceId));
}

/** The units a building trains for a seat of the race, in content order. */
export function trainableFor(def: BuildingDef, raceId: string | undefined): string[] {
  return (def.trains ?? []).filter((id) => allowsRace(unitDef(id), raceId));
}

/** Why a building of this level cannot train the unit yet, as the server words it, or null when it can. */
export function trainLock(unit: UnitDef, trainer: BuildingDef, level: number): string | null {
  const needed = unit.requiresTrainerLevel ?? 1;
  return level >= needed ? null : `${unit.name} needs a level ${needed} ${trainer.name}.`;
}

/** Abilities that wait for a click on the ground before they are cast. */
export function isTargeted(ability: AbilityDef): boolean {
  return ability.effect === "strike" || ability.effect === "dash";
}

/** Sight radius; a building's depends on its level. */
export function sightOf(info: KindInfo, level = 1): number {
  if (info.category === "node") return 0;
  return info.category === "building" ? buildingStats(info.def, level).sight : info.def.sight;
}

const statsCache = new Map<string, BuildingStats[]>();

/** Every level's stats for a building, resolved the same way as the server's ContentDb. */
export function buildingLevels(def: BuildingDef): BuildingStats[] {
  const cached = statsCache.get(def.id);
  if (cached) return cached;
  const base: BuildingStats = {
    level: 1,
    hp: def.hp,
    armor: def.armor,
    sight: def.sight,
    pop: def.pop ?? 0,
    attack: def.attack,
    foodRate: def.foodRate ?? 0,
    trainSpeed: def.trainSpeed ?? 1,
    storage: def.storage ?? 0,
    troopHp: 1,
    troopAttack: 1,
    cost: {},
    time: 0,
    townCenterLevel: 0,
  };
  const levels = [base];
  for (const step of def.levels ?? []) {
    const prev = levels[levels.length - 1]!;
    levels.push({
      level: prev.level + 1,
      hp: step.hp ?? prev.hp,
      armor: step.armor ?? prev.armor,
      sight: step.sight ?? prev.sight,
      pop: step.pop ?? prev.pop,
      attack: step.attack ?? prev.attack,
      foodRate: step.foodRate ?? prev.foodRate,
      trainSpeed: step.trainSpeed ?? prev.trainSpeed,
      storage: step.storage ?? prev.storage,
      troopHp: step.troopHp ?? prev.troopHp,
      troopAttack: step.troopAttack ?? prev.troopAttack,
      cost: step.cost,
      time: step.time,
      townCenterLevel: step.townCenterLevel ?? 0,
    });
  }
  statsCache.set(def.id, levels);
  return levels;
}

export function buildingStats(def: BuildingDef, level: number): BuildingStats {
  const levels = buildingLevels(def);
  return levels[Math.min(Math.max(level, 1), levels.length) - 1]!;
}

/** Gold an enemy earns for slaying a hero of this level. */
export function heroKillGold(level: number): number {
  return content.rules.heroKillGold + content.rules.heroKillGoldPerLevel * Math.max(0, level - 1);
}

/** What an ability's cooldown is multiplied by for a hero of this level and item reduction, as the server's RulesDef works it out. */
export function heroCooldownFactor(level: number, itemReduction = 0): number {
  const rules = content.rules;
  const fromLevel = Math.min(rules.heroCooldownReductionMax, rules.heroCooldownReductionPerLevel * Math.max(0, level - 1));
  return 1 - Math.min(Math.max(rules.heroCooldownReductionMax, rules.heroCooldownReductionCap), fromLevel + itemReduction);
}

export function itemDef(id: string): ItemDef | undefined {
  return content.items.find((i) => i.id === id);
}

/** Gold and other resources selling an item gives back, rounded down like the server. */
export function itemRefund(item: ItemDef): Cost {
  const refund: Cost = {};
  for (const name of RESOURCE_NAMES) {
    const amount = Math.floor((item.cost[name] ?? 0) * content.rules.itemSellRefund);
    if (amount > 0) refund[name] = amount;
  }
  return refund;
}

/** Gold the slayer earns for ending a streak of this length, on top of the kill bounty. */
export function shutdownGold(streak: number): number {
  const rules = content.rules;
  if (rules.heroShutdownStreak <= 0 || streak < rules.heroShutdownStreak) return 0;
  return rules.heroShutdownGold + rules.heroShutdownGoldPerKill * (streak - rules.heroShutdownStreak);
}

export interface TroopRank {
  name: string;
  hp: number;
  attack: number;
  trainer: string;
}

/** The bonus a unit trained at a building of this level carries, or null when that level drills no stronger troops. */
export function troopRank(unitId: string, rank: number): TroopRank | null {
  if (rank <= 1) return null;
  const trainer = content.buildings.find((b) => b.trains?.includes(unitId));
  if (!trainer) return null;
  const stats = buildingStats(trainer, rank);
  if (stats.troopHp === 1 && stats.troopAttack === 1) return null;
  return { name: RANK_NAMES[Math.min(rank, RANK_NAMES.length - 1)]!, hp: stats.troopHp, attack: stats.troopAttack, trainer: trainer.name };
}

const RANK_NAMES = ["", "", "Veteran", "Elite"];

export function maxLevel(def: BuildingDef): number {
  return buildingLevels(def).length;
}

export function footprintSize(info: KindInfo): number {
  return info.category === "unit" ? 1 : info.def.size;
}
