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
  hero: string;
  description: string;
  buildingHpMultiplier?: number;
}

export interface AbilityDef {
  id: string;
  name: string;
  key: string;
  effect: "nova" | "buff" | "strike" | "dash";
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
  /** Dash travel speed in tiles per second. */
  speed?: number;
  /** Seconds a dash stuns what it hits. */
  stun?: number;
  description: string;
}

export interface HeroStatDef {
  id: string;
  name: string;
  /** Flat for damage and health, a fraction for speeds and life steal. */
  perRank: number;
  description: string;
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

/** What an ability's cooldown is multiplied by for a hero of this level, as the server's RulesDef works it out. */
export function heroCooldownFactor(level: number): number {
  const rules = content.rules;
  return 1 - Math.min(rules.heroCooldownReductionMax, rules.heroCooldownReductionPerLevel * Math.max(0, level - 1));
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
