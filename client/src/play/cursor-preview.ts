import { buildingDef, content } from "../content/content";
import { canPlace, isLineBuilding, lineCells, placementOrigin } from "../game/placement";
import type { ClientWorld, WorldEntity } from "../game/world";
import type { GroundCircle } from "../render/overlay";
import type { GameRenderer } from "../render/renderer";
import type { InputMode } from "../ui/store";

/** Draws what the cursor would do: the foundation ghost, ability range and blast circles, and rally points. */
export class CursorPreview {
  private pointer: { x: number; y: number } | null = null;
  private readonly rallies = new Map<number, { x: number; y: number }>();
  /** Start tile of a wall line being dragged, or null. */
  lineStart: { x: number; y: number } | null = null;

  constructor(
    private readonly world: ClientWorld,
    private readonly renderer: GameRenderer,
  ) {}

  moved(px: number, py: number): void {
    this.pointer = { x: px, y: py };
  }

  left(): void {
    this.pointer = null;
  }

  setRally(building: number, x: number, y: number): void {
    this.rallies.set(building, { x, y });
  }

  update(mode: InputMode, hero: WorldEntity | undefined, selectedBuilding: WorldEntity | undefined): void {
    const ground = this.pointer ? this.renderer.camera.groundAt(this.pointer.x, this.pointer.y) : null;
    if (mode.kind === "place" && ground) {
      const def = buildingDef(mode.building);
      const origin = placementOrigin(def, ground.x, ground.y);
      if (this.lineStart && isLineBuilding(def)) this.renderer.showPlacementLine(def, lineCells(this.world, def, this.lineStart, origin));
      else this.renderer.showPlacement(def, origin.x, origin.y, canPlace(this.world, def, origin.x, origin.y));
    } else {
      this.renderer.hidePlacement();
    }
    const circles: GroundCircle[] = [];
    if (mode.kind === "normal" && selectedBuilding) {
      const rally = this.rallies.get(selectedBuilding.id);
      if (rally) circles.push({ x: rally.x, y: rally.y, radius: 0.6, color: "rgba(253,224,71,0.9)" });
    }
    if (mode.kind === "ability") {
      const ability = content.abilities[mode.slot];
      if (hero && ability?.range) circles.push({ x: hero.renderX, y: hero.renderY, radius: ability.range, color: "rgba(253,224,71,0.7)" });
      if (ground && ability) circles.push({ x: ground.x, y: ground.y, radius: ability.radius, color: "rgba(248,113,113,0.95)" });
    }
    this.renderer.overlay.circles = circles;
  }
}
