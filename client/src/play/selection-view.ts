import { isVillager } from "../content/content";
import type { ClientWorld, WorldEntity } from "../game/world";
import { NEUTRAL_OWNER, type ProductionState } from "../net/protocol";
import { NEUTRAL_COLOR, playerColor } from "../ui/palette";
import type { EntityView, SelectionView } from "../ui/store";

/** What the HUD shows for a selection: a unit roster, one own building with its queue, or one other entity. */
export function describeSelection(world: ClientWorld, entities: WorldEntity[], production: ProductionState[]): SelectionView {
  if (entities.length === 0) return { kind: "none" };
  const own = entities.filter((e) => e.info.category === "unit" && world.isMine(e.owner));
  if (own.length > 0) {
    const groups = new Map<string, { defId: string; name: string; count: number }>();
    for (const unit of own) {
      const group = groups.get(unit.info.def.id) ?? { defId: unit.info.def.id, name: unit.info.def.name, count: 0 };
      group.count++;
      groups.set(unit.info.def.id, group);
    }
    return {
      kind: "units",
      groups: [...groups.values()],
      total: own.length,
      villagers: own.some((u) => u.info.category === "unit" && isVillager(u.info.def)),
      single: own.length === 1 ? describeEntity(world, own[0]!) : null,
    };
  }
  const entity = entities[0]!;
  if (entity.info.category === "building" && world.isMine(entity.owner)) {
    const queue = production.find((p) => p.id === entity.id);
    return {
      kind: "building",
      entity: describeEntity(world, entity),
      constructing: world.isUnderConstruction(entity),
      trains: entity.info.def.trains ?? [],
      queue: queue?.queue ?? [],
      progress: queue?.progress ?? 0,
    };
  }
  return { kind: "other", entity: describeEntity(world, entity) };
}

export function describeEntity(world: ClientWorld, entity: WorldEntity): EntityView {
  const owner = world.players.find((p) => p.index === entity.owner);
  const neutralName = entity.info.category === "node" ? "Resource" : "Wild creature";
  return {
    id: entity.id,
    defId: entity.info.def.id,
    name: entity.info.def.name,
    ownerName: owner?.name ?? (entity.owner === NEUTRAL_OWNER ? neutralName : ""),
    color: owner ? playerColor(world.players, owner.index) : NEUTRAL_COLOR,
    hp: entity.hp,
    maxHp: entity.maxHp,
    extra: entity.extra,
    flags: entity.flags,
    level: entity.level,
    upgrading: entity.upgrading,
    upgradeProgress: entity.upgradeProgress,
    mine: world.isMine(entity.owner),
    category: entity.info.category,
  };
}
