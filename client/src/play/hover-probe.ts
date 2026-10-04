import { contextCommand } from "../game/commands";
import type { ClientWorld, WorldEntity } from "../game/world";
import type { GameRenderer } from "../render/renderer";
import { store, type InputMode } from "../ui/store";
import { actionHint, cursorCss, cursorFor, type CursorKind } from "./cursor-style";
import { describeEntity } from "./selection-view";

/** Picking walks every unit, so the label refreshes a few times a second rather than every frame. */
const HOVER_INTERVAL_MS = 90;

/**
 * Names whatever is under the cursor in the world, and what a right-click on it would do with the selection; the
 * pointer image shows that action too.
 */
export class HoverProbe {
  private pointer: { x: number; y: number } | null = null;
  private last = 0;
  private cursor: CursorKind = "pointer";

  constructor(
    private readonly world: ClientWorld,
    private readonly renderer: GameRenderer,
    private readonly selected: () => WorldEntity[],
  ) {}

  moved(px: number, py: number): void {
    this.pointer = { x: px, y: py };
  }

  left(): void {
    this.pointer = null;
    this.clear();
  }

  update(now: number, mode: InputMode, dragging: boolean): void {
    if (now - this.last < HOVER_INTERVAL_MS) return;
    this.last = now;
    const pointer = this.pointer;
    if (dragging) return;
    const entity = pointer && mode.kind === "normal" ? this.renderer.pick(pointer.x, pointer.y) : undefined;
    const target = pointer && mode.kind === "normal" ? this.renderer.pick(pointer.x, pointer.y, "order") : undefined;
    const ground = pointer ? this.renderer.camera.groundAt(pointer.x, pointer.y) : null;
    const command = ground && mode.kind === "normal" ? contextCommand(this.world, this.selected(), { x: ground.x, y: ground.y, entity: target }, false) : null;
    this.setCursor(mode.kind === "attackMove" ? "attack" : mode.kind === "ability" ? "target" : cursorFor(this.world, command));
    // With an order to show, the card names what a right-click would act on, so the card and its hint agree.
    const shown = command && target ? target : entity;
    if (!pointer || !shown) {
      this.clear();
      return;
    }
    store.set({ hover: { entity: describeEntity(this.world, shown), x: pointer.x, y: pointer.y, action: actionHint(this.world, command) } });
  }

  /** Only touches the style when the action changed or a map drag reset it, and never mid-drag. */
  private setCursor(kind: CursorKind): void {
    const canvas = this.renderer.engine.getRenderingCanvas();
    if (!canvas || canvas.style.cursor === "grabbing" || (kind === this.cursor && canvas.style.cursor !== "")) return;
    this.cursor = kind;
    canvas.style.cursor = cursorCss(kind);
  }

  private clear(): void {
    if (store.get().hover) store.set({ hover: null });
  }
}
