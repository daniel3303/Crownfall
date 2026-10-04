import { isVillager } from "../content/content";
import { Tile, type Command } from "../net/protocol";
import type { ClientWorld, WorldEntity } from "./world";

export interface GroundTarget {
  x: number;
  y: number;
  entity?: WorldEntity;
}

/** The order a right-click means for the current selection, like Age of Empires' smart command. */
export function contextCommand(world: ClientWorld, selected: WorldEntity[], target: GroundTarget, attackMove: boolean): Command | null {
  const units = selected.filter((e) => e.info.category === "unit" && world.isMine(e.owner));
  if (units.length === 0) return rallyCommand(world, selected, target);
  const ids = units.map((u) => u.id);
  const villagers = units.every((u) => u.info.category === "unit" && isVillager(u.info.def));
  const entity = target.entity;
  if (entity && !attackMove) {
    // Villagers rob an enemy drop-off; any soldiers sent along attack it.
    if (isRaidable(world, entity) && units.some((u) => u.info.category === "unit" && isVillager(u.info.def))) {
      return { type: "gather", units: ids, target: entity.id };
    }
    if (world.isHostile(entity)) return { type: "attack", units: ids, target: entity.id };
    if (entity.info.category === "node") return { type: "gather", units: ids, target: entity.id };
    if (villagers && entity.info.category === "building" && world.isAlly(entity.owner)) {
      if (world.isUnderConstruction(entity)) return { type: "construct", units: ids, target: entity.id };
      if (entity.info.def.id === "farm" && world.isMine(entity.owner)) return { type: "gather", units: ids, target: entity.id };
    }
  }
  if (entity && attackMove && world.isHostile(entity)) return { type: "attack", units: ids, target: entity.id };
  const tileX = Math.floor(target.x);
  const tileY = Math.floor(target.y);
  if (!attackMove && world.tile(tileX, tileY) === Tile.Tree && world.fog.isExplored(tileX, tileY)) {
    return { type: "gather", units: ids, target: 0, tileX, tileY };
  }
  return { type: "move", units: ids, x: target.x, y: target.y, attackMove };
}

/** A finished enemy building that takes resources, which villagers can steal from. */
export function isRaidable(world: ClientWorld, entity: WorldEntity): boolean {
  return (
    entity.info.category === "building" &&
    !entity.ghost &&
    world.isHostile(entity) &&
    (entity.info.def.dropOff?.length ?? 0) > 0 &&
    !world.isUnderConstruction(entity)
  );
}

function rallyCommand(world: ClientWorld, selected: WorldEntity[], target: GroundTarget): Command | null {
  const building = selected.length === 1 ? selected[0] : undefined;
  if (!building || building.info.category !== "building" || !world.isMine(building.owner) || !building.info.def.trains?.length) {
    return null;
  }
  return { type: "rally", building: building.id, x: target.x, y: target.y };
}
