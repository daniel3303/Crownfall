import { audio } from "../audio";
import { buildingDef, heroKit, isTargeted, isVillager } from "../content/content";
import { contextCommand } from "../game/commands";
import { canPlace, isLineBuilding, lineCells, placementOrigin } from "../game/placement";
import { Selection } from "../game/selection";
import type { ClientWorld, WorldEntity } from "../game/world";
import type { Connection } from "../net/connection";
import { Flags, type Command, type GameEvent } from "../net/protocol";
import { Minimap } from "../render/minimap";
import { GameRenderer } from "../render/renderer";
import { store, type InputMode, type SelectionView } from "../ui/store";
import { CursorPreview } from "./cursor-preview";
import { EventPresenter } from "./event-presenter";
import { HoverProbe } from "./hover-probe";
import { describeSelection } from "./selection-view";

const PUBLISH_INTERVAL_MS = 150;
const MINIMAP_INTERVAL_MS = 100;
const NO_ENTITY = -1;

/** One running match on screen: wires the renderer, selection, commands and HUD to the client world. */
export class GameView {
  readonly renderer: GameRenderer;
  readonly selection = new Selection();
  readonly minimap: Minimap;
  private readonly presenter: EventPresenter;
  private lastPublish = 0;
  private lastMinimap = 0;
  private selectionVersion = -1;
  private centered = false;
  private idleCursor = 0;
  private lastPicked = NO_ENTITY;
  /** Where the pointer last was over the battlefield, for quick-cast abilities. */
  private pointer: { x: number; y: number } | null = null;
  private disposed = false;
  private readonly cursor: CursorPreview;
  private readonly hover: HoverProbe;

  constructor(
    canvas: HTMLCanvasElement,
    overlay: HTMLCanvasElement,
    minimapCanvas: HTMLCanvasElement,
    readonly world: ClientWorld,
    private readonly connection: Connection,
  ) {
    this.renderer = new GameRenderer(canvas, overlay, world);
    this.minimap = new Minimap(minimapCanvas, world);
    this.presenter = new EventPresenter(world, this.renderer, this.minimap);
    this.cursor = new CursorPreview(world, this.renderer);
    this.hover = new HoverProbe(world, this.renderer, () => this.selection.entities(this.world));
    this.renderer.beforeFrame = (now) => this.frame(now);
    this.renderer.camera.lookAt(world.width / 2, world.height / 2);
    this.renderer.start();
    store.set({ loading: true });
    this.renderer.ready.then(
      () => !this.disposed && store.set({ loading: false }),
      (error: unknown) => {
        if (this.disposed) return;
        store.set({ loading: false, loadError: `Could not load the game models. ${error instanceof Error ? error.message : ""}`.trim() });
      },
    );
  }

  get mode(): InputMode {
    return store.get().mode;
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.dispose();
  }

  onSnapshot(): void {
    this.selection.prune(this.world);
    this.presenter.snapshot(performance.now());
    if (!this.centered) {
      const home = [...this.world.entities.values()].find((e) => this.world.isMine(e.owner) && e.info.def.id === "townCenter");
      if (home) {
        this.renderer.camera.lookAt(home.x, home.y + 2);
        this.centered = true;
      }
    }
  }

  onEvents(events: GameEvent[]): void {
    this.presenter.present(events, performance.now());
  }

  // Selection --------------------------------------------------------------------------------

  clickSelect(px: number, py: number, additive: boolean, double: boolean): void {
    const entity = this.renderer.pick(px, py);
    // A double-click selects the kind only when both clicks picked the same unit, not a neighbour that walked under the cursor.
    const sameKind = double && entity !== undefined && entity.id === this.lastPicked;
    this.lastPicked = entity?.id ?? NO_ENTITY;
    // A click on open ground keeps the selection, so a missed click in a fight never drops the hero.
    if (!entity) return;
    if (sameKind && entity.info.category === "unit" && this.world.isMine(entity.owner)) {
      const canvas = this.renderer.engine.getRenderingCanvas()!;
      const onScreen = this.renderer.unitsInRect({ x0: 0, y0: 0, x1: canvas.clientWidth, y1: canvas.clientHeight });
      this.selection.set(onScreen.filter((u) => u.kind === entity.kind).map((u) => u.id));
    } else if (additive) {
      this.selection.toggle(this.world, entity);
    } else {
      this.selection.set([entity.id]);
    }
    audio.play("select");
  }

  boxSelect(x0: number, y0: number, x1: number, y1: number, additive: boolean): void {
    const units = this.renderer.unitsInRect({ x0, y0, x1, y1 });
    const military = units.filter((u) => u.info.category === "unit" && !isVillager(u.info.def));
    const picked = military.length > 0 && military.length < units.length && !additive ? military : units;
    if (picked.length === 0) return;
    const mine = this.selection.ownUnits(this.world).map((u) => u.id);
    this.selection.set(additive ? [...mine, ...picked.map((u) => u.id)] : picked.map((u) => u.id));
    audio.play("select");
  }

  selectHero(center: boolean): void {
    const hero = this.hero();
    if (!hero) {
      store.notify("Your hero is not on the field.", "warning");
      return;
    }
    this.selection.set([hero.id]);
    if (center) this.renderer.camera.lookAt(hero.renderX, hero.renderY);
  }

  /** Keeps the camera on the hero while Space is held; a fallen hero leaves it where it is. */
  followHero(): void {
    const hero = this.hero();
    if (hero) this.renderer.camera.lookAt(hero.renderX, hero.renderY);
  }

  nextIdleVillager(): void {
    const idle = this.idleVillagers();
    if (idle.length === 0) return;
    const villager = idle[this.idleCursor++ % idle.length]!;
    this.selection.set([villager.id]);
    this.renderer.camera.lookAt(villager.renderX, villager.renderY);
  }

  saveGroup(index: number): void {
    this.selection.saveGroup(index);
  }

  recallGroup(index: number, center: boolean): void {
    if (!this.selection.recallGroup(this.world, index) || !center) return;
    const first = this.selection.entities(this.world)[0];
    if (first) this.renderer.camera.lookAt(first.renderX, first.renderY);
  }

  // Orders -----------------------------------------------------------------------------------

  setMode(mode: InputMode): void {
    store.set({ mode });
    if (mode.kind !== "place") {
      this.cursor.lineStart = null;
      this.renderer.hidePlacement();
    }
  }

  /** Right-click (or a mode click) at a screen point. */
  order(px: number, py: number, attackMove: boolean): void {
    const ground = this.renderer.camera.groundAt(px, py);
    if (!ground) return;
    this.orderAt(ground.x, ground.y, this.renderer.pick(px, py, "order"), attackMove);
  }

  orderAt(x: number, y: number, entity: WorldEntity | undefined, attackMove: boolean): void {
    const command = contextCommand(this.world, this.selection.entities(this.world), { x, y, entity }, attackMove);
    if (!command) return;
    this.issue(command);
    const now = performance.now();
    if (command.type === "attack") {
      this.renderer.effects.ring(entity!.renderX, entity!.renderY, 0.9, [1, 0.3, 0.25], 450, now, true);
      audio.play("attack");
    } else if (command.type === "rally") {
      this.cursor.setRally(command.building, x, y);
      this.renderer.effects.ring(x, y, 0.8, [1, 0.85, 0.3], 500, now, true);
      audio.play("move");
    } else {
      this.renderer.effects.ring(x, y, 0.8, attackMove ? [1, 0.45, 0.2] : [0.4, 1, 0.5], 450, now, true);
      audio.play(attackMove ? "attack" : "move");
    }
  }

  stop(): void {
    const units = this.selection.ownUnits(this.world).map((u) => u.id);
    if (units.length > 0) this.issue({ type: "stop", units });
  }

  beginPlacement(building: string): void {
    if (!this.selectedVillagers().length) return;
    this.setMode({ kind: "place", building });
  }

  /** Places the current foundation at a screen point; returns false when the spot was refused locally. */
  place(px: number, py: number): boolean {
    const mode = this.mode;
    const ground = this.renderer.camera.groundAt(px, py);
    if (mode.kind !== "place" || !ground) return false;
    const def = buildingDef(mode.building);
    const origin = placementOrigin(def, ground.x, ground.y);
    if (!canPlace(this.world, def, origin.x, origin.y)) {
      store.notify("Can't build there.", "warning");
      return false;
    }
    const units = this.selectedVillagers().map((u) => u.id);
    if (units.length === 0) return false;
    this.issue({ type: "build", units, building: def.id, x: origin.x, y: origin.y });
    audio.play("place");
    return true;
  }

  /** Starts dragging a wall line at a screen point; false when the building being placed is not laid in lines. */
  beginLine(px: number, py: number): boolean {
    const mode = this.mode;
    const ground = this.renderer.camera.groundAt(px, py);
    if (mode.kind !== "place" || !ground) return false;
    const def = buildingDef(mode.building);
    if (!isLineBuilding(def)) return false;
    this.cursor.lineStart = placementOrigin(def, ground.x, ground.y);
    return true;
  }

  /** Lays the dragged line ending at a screen point; returns false when no tile of it could be placed. */
  endLine(px: number, py: number): boolean {
    const start = this.cursor.lineStart;
    this.cursor.lineStart = null;
    const mode = this.mode;
    const ground = this.renderer.camera.groundAt(px, py);
    if (!start || mode.kind !== "place" || !ground) return false;
    const def = buildingDef(mode.building);
    const cells = lineCells(this.world, def, start, placementOrigin(def, ground.x, ground.y));
    const units = this.selectedVillagers().map((u) => u.id);
    if (!cells.some((c) => c.valid) || units.length === 0) {
      store.notify("Can't build there.", "warning");
      return false;
    }
    const end = cells[cells.length - 1]!;
    this.issue({ type: "buildLine", units, building: def.id, x1: start.x, y1: start.y, x2: end.x, y2: end.y });
    audio.play("place");
    return true;
  }

  /**
   * Casts a hero ability. A quick cast aims a targeted one at the pointer straight away, as LoL's quick cast does;
   * otherwise, or with no pointer over the map yet, it waits for a click on the ground.
   */
  castAbility(slot: number, quick: boolean): void {
    const ability = heroKit(this.world.heroOf(this.world.you))[slot];
    if (!ability) return;
    if (isTargeted(ability)) {
      const ground = quick && this.pointer ? this.renderer.camera.groundAt(this.pointer.x, this.pointer.y) : null;
      if (ground) {
        if (this.mode.kind === "ability") this.setMode({ kind: "normal" });
        this.issue({ type: "ability", slot, x: ground.x, y: ground.y });
      } else this.setMode({ kind: "ability", slot });
      return;
    }
    const hero = this.hero();
    this.issue({ type: "ability", slot, x: hero?.x ?? 0, y: hero?.y ?? 0 });
  }

  castAt(px: number, py: number): void {
    const mode = this.mode;
    const ground = this.renderer.camera.groundAt(px, py);
    if (mode.kind !== "ability" || !ground) return;
    this.issue({ type: "ability", slot: mode.slot, x: ground.x, y: ground.y });
    this.setMode({ kind: "normal" });
  }

  /** Takes one talent of an open tier; the server checks the level and that the tier is still free. */
  pickTalent(tier: number, talent: string): void {
    this.issue({ type: "pickTalent", tier, talent });
    audio.play("levelUp");
  }

  /** Spends one banked hero point on a stat. */
  learnStat(stat: string): void {
    this.issue({ type: "heroStat", stat });
  }

  /** Pays to revive the fallen hero; 0 lets the server pick a completed town center. */
  reviveHero(building = 0): void {
    this.issue({ type: "reviveHero", building });
  }

  /** Buys an item for the hero; the server checks it stands at a town center and can pay. */
  buyItem(item: string): void {
    this.issue({ type: "buyItem", item });
    audio.play("coin");
  }

  sellItem(slot: number): void {
    this.issue({ type: "sellItem", slot });
    audio.play("coin");
  }

  train(unit: string): void {
    const building = this.selectedOwnBuilding();
    if (building) this.issue({ type: "train", building: building.id, unit });
  }

  cancelTrain(): void {
    const building = this.selectedOwnBuilding();
    if (building) this.issue({ type: "cancelTrain", building: building.id });
  }

  /** Starts upgrading the selected own building to its next level. */
  upgrade(): void {
    const building = this.selectedOwnBuilding();
    if (building) this.issue({ type: "upgrade", building: building.id });
  }

  cancelUpgrade(): void {
    const building = this.selectedOwnBuilding();
    if (building) this.issue({ type: "cancelUpgrade", building: building.id });
  }

  /** Buys or sells one market lot of a resource at the selected own market building. */
  trade(resource: string, buy: boolean): void {
    const building = this.selectedOwnBuilding();
    if (!building) return;
    this.issue({ type: "trade", building: building.id, resource, buy });
    audio.play("coin");
  }

  tribute(to: number, resource: string, amount: number): void {
    this.issue({ type: "tribute", to, resource, amount });
    audio.play("coin");
  }

  jumpTo(x: number, y: number): void {
    this.renderer.camera.lookAt(x, y);
  }

  pointerMoved(px: number, py: number): void {
    this.pointer = { x: px, y: py };
    this.cursor.moved(px, py);
    this.hover.moved(px, py);
  }

  pointerLeft(): void {
    // Off the battlefield (over the HUD) a quick cast has nowhere to aim, so it falls back to a targeting click.
    this.pointer = null;
    this.cursor.left();
    this.hover.left();
  }

  // Frame ------------------------------------------------------------------------------------

  private frame(now: number): void {
    const focus = this.renderer.camera.focus;
    audio.setListener(focus.x, focus.y, this.renderer.camera.zoom);
    if (this.selectionVersion !== this.selection.version) {
      this.selectionVersion = this.selection.version;
      this.renderer.selected = new Set(this.selection.all);
      this.lastPublish = 0;
    }
    this.cursor.update(this.mode, this.hero(), this.selectedOwnBuilding());
    this.hover.update(now, this.mode, this.renderer.overlay.dragRect !== null);
    if (now - this.lastMinimap > MINIMAP_INTERVAL_MS) {
      this.lastMinimap = now;
      this.minimap.draw(this.renderer.viewCorners(), now);
    }
    if (now - this.lastPublish > PUBLISH_INTERVAL_MS) {
      this.lastPublish = now;
      this.publish();
    }
  }

  private publish(): void {
    store.set({
      selection: this.currentSelection(),
      latency: this.connection.latencyMs,
      idleVillagers: this.idleVillagers().length,
    });
  }

  /** Computed from the live selection, so hotkeys never act on the throttled HUD copy. */
  currentSelection(): SelectionView {
    const production = store.get().stats?.production ?? [];
    return describeSelection(this.world, this.selection.entities(this.world), production);
  }

  private hero(): WorldEntity | undefined {
    for (const entity of this.world.entities.values()) {
      if (this.world.isMine(entity.owner) && (entity.flags & Flags.Hero) !== 0) return entity;
    }
    return undefined;
  }

  private idleVillagers(): WorldEntity[] {
    return [...this.world.entities.values()].filter(
      (e) => this.world.isMine(e.owner) && e.info.category === "unit" && isVillager(e.info.def) && e.state === 0,
    );
  }

  private selectedVillagers(): WorldEntity[] {
    return this.selection.ownUnits(this.world).filter((u) => u.info.category === "unit" && isVillager(u.info.def));
  }

  private selectedOwnBuilding(): WorldEntity | undefined {
    const entities = this.selection.entities(this.world);
    const building = entities.length === 1 ? entities[0] : undefined;
    return building && building.info.category === "building" && this.world.isMine(building.owner) ? building : undefined;
  }

  private issue(command: Command): void {
    this.connection.command(command);
  }
}
