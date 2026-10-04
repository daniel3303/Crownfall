import { content, type Cost, type ResourceName, type UnitDef } from "../../content/content";

/** What each unit, building and resource is for, in a sentence a new player can act on. */
export const ROLE: Record<string, string> = {
  villager: "Gathers resources and builds. Right-click a tree, bush or mine to gather, or a foundation to help build.",
  spearman: "Cheap front-line infantry that holds the line in front of your archers.",
  archer: "Shoots from range. Fragile up close, so keep it behind your Footmen.",
  rider: "Fast, tough cavalry for raiding villagers and running down archers.",
  paladin: "Your hero. Gains experience from nearby kills, unlocks Q, W, E and R, spends a stat point every level, and heals while resting. Revive it at a town center if it falls.",
  warchief: "Your hero. Gains experience from nearby kills, unlocks Q, W, E and R, spends a stat point every level, and heals while resting. Revive it at a town center if it falls.",
  wolf: "Neutral guardian of a camp. Kill it for hero experience and a bounty.",
  troll: "Boss of a camp. Slow but brutal; bring an army and your hero.",
  townCenter: "The heart of your base: trains villagers, takes every resource and shoots nearby enemies. Keep a town center or villagers alive to stay in the game.",
  house: "Raises your population limit so you can train more units.",
  storehouse: "Drop-off for every resource. Build it beside woods or mines so villagers walk less.",
  farm: "Food that never runs out once berry bushes are gone. One villager works each farm.",
  barracks: "Trains Footmen, Crossbowmen and Raiders.",
  tower: "Shoots arrows at enemies that come in range.",
  wall: "Blocks enemies and creeps. Soldiers can still break through, so back it with towers.",
  gate: "A wall tile your own and allied units walk through; enemies must break it down.",
  wallTower: "A wall tile that shoots arrows at enemies in range.",
  berries: "Fast food early in the game. Switch to farms when the bushes run out.",
  goldMine: "Gold for Crossbowmen and Raiders. Put a storehouse next to it.",
  stoneMine: "Stone for town centers and towers.",
};

export const RESOURCE_SOURCE: Record<ResourceName, string> = {
  food: "From berry bushes and farms.",
  wood: "Chopped from trees.",
  stone: "Mined at stone quarries.",
  gold: "Mined at gold mines.",
};

/** Everything a resource pays for, read from the content so it stays true when costs change. */
export function spentOn(resource: ResourceName): string[] {
  const priced: { name: string; cost?: Cost }[] = [...content.units, ...content.buildings];
  return priced.filter((item) => (item.cost?.[resource] ?? 0) > 0).map((item) => item.name);
}

/** Units this one deals bonus damage to, and units that deal bonus damage to it. */
export function counters(def: UnitDef): { strong: string[]; weak: string[] } {
  const trained = content.units.filter((u) => u.cost);
  const strong = trained.filter((u) => def.bonus?.some((b) => u.tags.includes(b.vs))).map((u) => u.name);
  const weak = trained.filter((u) => u.bonus?.some((b) => def.tags.includes(b.vs))).map((u) => u.name);
  return { strong, weak };
}
