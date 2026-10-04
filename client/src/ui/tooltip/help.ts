import { content, type Cost, type ResourceName, type UnitDef } from "../../content/content";

const HERO_DUTIES = `Gains experience from nearby kills, unlocks Q, W, E and R, spends a stat point every level, picks a talent at levels ${content.rules.heroTalentLevels.join(", ")}, and heals while resting. Revive it at a town center if it falls.`;

/** What each unit, building and resource is for, in a sentence a new player can act on. */
export const ROLE: Record<string, string> = {
  villager: "Gathers resources and builds. Right-click a tree, bush or mine to gather, or a foundation to help build.",
  spearman: "Cheap front-line infantry that holds the line in front of your archers.",
  archer: "Shoots from range. Fragile up close, so keep it behind your Footmen.",
  rider: "Fast, tough cavalry for raiding villagers and running down archers.",
  paladin: `A sturdy melee hero who cleaves the ranks around him and charges into the fray. ${HERO_DUTIES}`,
  warchief: `A brawling melee hero who cleaves, rallies and charges at the head of the horde. ${HERO_DUTIES}`,
  archmage: `A ranged caster who hurls fireballs, wards allies with armor, blinks out of reach and calls down a stunning meteor. ${HERO_DUTIES}`,
  ranger: `A swift archer hero who rains volleys on clustered foes, speeds allied attacks and rolls clear of danger. ${HERO_DUTIES}`,
  shaman: `A ranged caster who strikes with lightning, drives allies into a bloodlust, heals the warband and splits the earth. ${HERO_DUTIES}`,
  blademaster: `A fast melee duelist who spins through crowds, cuts a path with Wind Walk and ends fights with a bladestorm. ${HERO_DUTIES}`,
  knight: "Heavy cavalry only Humans field: tough, armored and quick, it rides down archers.",
  berserker: "Orc shock infantry: hits very hard but wears no armor, so strike first.",
  wolf: "Neutral guardian of a camp. Kill it for hero experience and a bounty.",
  troll: "Boss of a camp. Slow but brutal; bring an army and your hero.",
  townCenter: "The heart of your base: trains villagers, takes every resource and shoots nearby enemies. Keep a town center or villagers alive to stay in the game.",
  house: "Raises your population limit so you can train more units.",
  storehouse: "Drop-off for every resource. Build it beside woods or mines so villagers walk less.",
  farm: "Food that never runs out once berry bushes are gone. One villager works each farm.",
  barracks: "Trains Footmen, Crossbowmen and Raiders; at level 2, Humans add Knights and Orcs add Berserkers.",
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
