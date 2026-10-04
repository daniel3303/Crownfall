import { buildingDef, buildingLevels, buildingStats, content, RESOURCE_NAMES, type BuildingDef, type BuildingStats, type ResourceName } from "../../content/content";

export interface StatChange {
  label: string;
  from: string;
  to: string;
}

function armor(stats: BuildingStats): string {
  return `${stats.armor.melee}/${stats.armor.pierce}`;
}

function percent(multiplier: number): string {
  return `+${Math.round((multiplier - 1) * 100)}%`;
}

/**
 * What the upgrade from one level to the next changes, one row per stat that moves. Health is scaled by the
 * owner's race bonus so it matches the building's real health.
 */
export function upgradeChanges(def: BuildingDef, level: number, hpMultiplier = 1): StatChange[] {
  const from = buildingStats(def, level);
  const to = buildingStats(def, level + 1);
  if (to.level === from.level) return [];
  const rows: StatChange[] = [
    { label: "Health", from: String(Math.round(from.hp * hpMultiplier)), to: String(Math.round(to.hp * hpMultiplier)) },
    { label: "Armor", from: armor(from), to: armor(to) },
    { label: "Sight", from: String(from.sight), to: String(to.sight) },
    { label: "Population", from: `+${from.pop}`, to: `+${to.pop}` },
    { label: "Arrow damage", from: String(from.attack?.damage ?? 0), to: String(to.attack?.damage ?? 0) },
    { label: "Arrow range", from: String(from.attack?.range ?? 0), to: String(to.attack?.range ?? 0) },
    { label: "Arrow reload", from: `${from.attack?.cooldown ?? 0}s`, to: `${to.attack?.cooldown ?? 0}s` },
    { label: "Training speed", from: percent(from.trainSpeed), to: percent(to.trainSpeed) },
    { label: "Troop health", from: percent(from.troopHp), to: percent(to.troopHp) },
    { label: "Troop attack", from: percent(from.troopAttack), to: percent(to.troopAttack) },
    { label: "Farm yield", from: `x${from.foodRate}`, to: `x${to.foodRate}` },
    { label: "Storage", from: String(from.storage), to: String(to.storage) },
  ];
  return rows.filter((row) => row.from !== row.to);
}

/** The town center level the next upgrade needs, or 0. */
export function upgradeRequirement(def: BuildingDef, level: number): number {
  const levels = buildingLevels(def);
  return level < levels.length ? levels[level]!.townCenterLevel : 0;
}

export type StorageLevel = "ok" | "near" | "full";

/** Share of the cap at which the top bar starts warning. */
export const NEAR_FULL_SHARE = 0.85;

export function storageLevel(amount: number, cap: number): StorageLevel {
  if (cap <= 0 || amount >= cap) return "full";
  return amount >= cap * NEAR_FULL_SHARE ? "near" : "ok";
}

/** Base storage per resource of each building that stores, for the resource tooltip. */
export function storageSources(): { name: string; storage: number }[] {
  return content.buildings.filter((b) => (b.storage ?? 0) > 0).map((b) => ({ name: b.name, storage: b.storage! }));
}

/** The gold a market lot of each tradable resource costs or earns, keyed by resource. */
export function tradableResources(prices: { buy: number[] }): ResourceName[] {
  return RESOURCE_NAMES.filter((_, i) => (prices.buy[i] ?? 0) > 0);
}

export function isMarket(defId: string): boolean {
  return buildingDef(defId).market === true;
}
