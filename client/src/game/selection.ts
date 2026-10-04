import type { ClientWorld, WorldEntity } from "./world";

const GROUP_COUNT = 10;

/**
 * The selected entities. Own units can be multi-selected; a building or a foreign entity is always
 * selected alone, so the command card shows one context.
 */
export class Selection {
  private ids: number[] = [];
  private readonly groups: number[][] = Array.from({ length: GROUP_COUNT }, () => []);
  version = 0;

  get all(): readonly number[] {
    return this.ids;
  }

  entities(world: ClientWorld): WorldEntity[] {
    return this.ids.map((id) => world.entities.get(id)).filter((e): e is WorldEntity => e !== undefined);
  }

  ownUnits(world: ClientWorld): WorldEntity[] {
    return this.entities(world).filter((e) => e.info.category === "unit" && world.isMine(e.owner));
  }

  set(ids: number[]): void {
    this.ids = [...new Set(ids)];
    this.version++;
  }

  /** Shift-click: toggle an own unit in a unit selection, or replace a building selection. */
  toggle(world: ClientWorld, entity: WorldEntity): void {
    const current = this.entities(world);
    const unitSelection = current.length > 0 && current.every((e) => e.info.category === "unit" && world.isMine(e.owner));
    if (!unitSelection || entity.info.category !== "unit" || !world.isMine(entity.owner)) {
      this.set([entity.id]);
      return;
    }
    this.set(this.ids.includes(entity.id) ? this.ids.filter((id) => id !== entity.id) : [...this.ids, entity.id]);
  }

  clear(): void {
    if (this.ids.length === 0) return;
    this.ids = [];
    this.version++;
  }

  /** Drops anything dead, out of sight or turned into a ghost. */
  prune(world: ClientWorld): void {
    const alive = this.ids.filter((id) => {
      const entity = world.entities.get(id);
      return entity !== undefined && !entity.ghost;
    });
    if (alive.length !== this.ids.length) this.set(alive);
  }

  saveGroup(index: number): void {
    this.groups[index] = [...this.ids];
  }

  recallGroup(world: ClientWorld, index: number): boolean {
    const ids = (this.groups[index] ?? []).filter((id) => world.entities.has(id));
    this.groups[index] = ids;
    if (ids.length === 0) return false;
    this.set(ids);
    return true;
  }
}
