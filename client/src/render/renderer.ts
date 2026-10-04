import { Engine } from "@babylonjs/core/Engines/engine";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { Scene } from "@babylonjs/core/scene";
import { isHero, kinds, type BuildingDef } from "../content/content";
import type { ClientWorld, WorldEntity } from "../game/world";
import { AssetLibrary } from "./assets";
import { buildingMaterial, loadBuildingTextures } from "./building-material";
import { RtsCamera } from "./camera";
import { Effects } from "./effects";
import { EntityLayer } from "./entities";
import { FogOfWar } from "./fog";
import { loadTreeModels } from "./forest";
import { SceneLighting } from "./lighting";
import { Overlay, type ScreenRect } from "./overlay";
import { PlacementGhost, type GhostCell } from "./placement-ghost";
import { renderPortraits } from "./portraits";
import { initialResolution, nextResolution, type ResolutionState } from "./resolution";
import { bodyInRect, nearestBody, type PickCandidate, type ScreenBody } from "./screen-pick";
import { StructureCatalog } from "./structures";
import { Terrain } from "./terrain";
import { loadTerrainTextures } from "./terrain-material";
import { loadUnitModel, modelId } from "./unit-models";

/** Half the width of a unit's clickable body, in pixels at the default zoom, per tile of its radius plus a margin. */
const UNIT_PICK_PX = 22;
const UNIT_PICK_MARGIN = 0.4;

/** A left-click selects anything, favouring heroes; a right-click order only ever targets a foe. */
export type PickPurpose = "select" | "order";

/** Owns the Babylon engine and scene; everything game-specific is read from the ClientWorld each frame. */
export class GameRenderer {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: RtsCamera;
  readonly effects: Effects;
  readonly overlay: Overlay;
  /** Resolves once the models are loaded; nothing is drawn before then. */
  readonly ready: Promise<void>;
  private readonly fog: FogOfWar;
  private readonly lighting: SceneLighting;
  private terrain: Terrain | null = null;
  private entities: EntityLayer | null = null;
  private ghost: PlacementGhost | null = null;
  private readonly onResize = () => this.engine.resize();
  private resolution: ResolutionState;
  selected: ReadonlySet<number> = new Set();
  beforeFrame: (now: number) => void = () => {};

  constructor(
    canvas: HTMLCanvasElement,
    overlayCanvas: HTMLCanvasElement,
    private readonly world: ClientWorld,
  ) {
    this.engine = new Engine(canvas, true, { stencil: false, preserveDrawingBuffer: false, powerPreference: "high-performance" }, false);
    this.resolution = initialResolution(window.devicePixelRatio);
    this.engine.setHardwareScalingLevel(1 / this.resolution.ratio);
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.02, 0.03, 0.04, 1);
    this.scene.skipPointerMovePicking = true;
    this.scene.detachControl();


    this.camera = new RtsCamera(this.scene, world.width, world.height);
    this.lighting = new SceneLighting(this.scene, this.camera);
    this.fog = new FogOfWar(this.scene, world.fog);
    this.effects = new Effects(this.scene);
    this.overlay = new Overlay(overlayCanvas, this.camera, (entity) => this.entities?.entityHeight(entity) ?? 1);

    const abyss = CreateGround("abyss", { width: world.width * 4, height: world.height * 4 }, this.scene);
    abyss.position.set(world.width / 2, -0.6, -world.height / 2);
    const abyssMaterial = new StandardMaterial("abyss", this.scene);
    abyssMaterial.diffuseColor = new Color3(0.03, 0.04, 0.05);
    abyssMaterial.specularColor = Color3.Black();
    abyss.material = abyssMaterial;
    abyss.isPickable = false;


    window.addEventListener("resize", this.onResize);
    this.ready = this.load();
  }

  start(): void {
    this.engine.runRenderLoop(() => {
      if (!this.terrain || !this.entities) return;
      const now = performance.now();
      this.beforeFrame(now);
      this.world.interpolate(now);
      this.fog.sync();
      this.terrain.sync(now);
      this.lighting.update();
      this.entities.update(this.world, this.selected, now);
      this.effects.update(now);
      this.scene.render();
      this.overlay.draw(this.world, this.selected, now);
      this.adaptResolution(now);
    });
  }

  /** Trades render resolution for frame rate: foliage overdraw at Retina resolution can outrun the GPU. */
  private adaptResolution(now: number): void {
    const next = nextResolution(this.resolution, this.engine.getFps(), now);
    if (next.ratio !== this.resolution.ratio) this.engine.setHardwareScalingLevel(1 / next.ratio);
    this.resolution = next;
  }

  heightOf(kind: number): number {
    return this.entities?.heightOf(kind) ?? 1;
  }

  /** Rubble where a building fell. */
  addRuin(kind: number, x: number, y: number, now: number, level = 1): void {
    this.entities?.addRuin(kind, x, y, now, level);
  }

  /** A body that plays its death clip where a unit fell. */
  addCorpse(id: number, kind: number, owner: number, x: number, y: number, now: number): void {
    this.entities?.addCorpse(id, kind, owner, x, y, now);
  }

  /** Plays a hero's ability animation. */
  cast(heroId: number, slot: number, now: number): void {
    this.entities?.cast(heroId, slot, now);
  }

  dispose(): void {
    window.removeEventListener("resize", this.onResize);
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }

  private async load(): Promise<void> {
    // One load per character: kinds that borrow another's model share it.
    const ids = [...new Set(kinds.flatMap((k) => (k.category === "unit" ? [modelId(k.def)] : [])))];
    const [assets, ground, walls, trees, ...units] = await Promise.all([
      AssetLibrary.load(this.scene, this.fog),
      loadTerrainTextures(this.scene),
      loadBuildingTextures(this.scene),
      loadTreeModels(this.scene, this.fog),
      ...ids.map((id) => loadUnitModel(this.scene, id, this.fog)),
    ]);
    if (this.scene.isDisposed) return;
    const models = new Map(ids.map((id, i) => [id, units[i]!]));
    const structures = new StructureCatalog(this.scene, buildingMaterial(this.scene, walls, this.fog), trees.bushes);
    this.terrain = new Terrain(this.scene, this.world, this.fog, assets, this.lighting, ground, trees, structures.decorRocks());
    this.entities = new EntityLayer(this.scene, models, structures, this.lighting, this.world);
    this.ghost = new PlacementGhost(this.scene, structures);
    // Building icons for the HUD, drawn in their own offscreen engine once the battlefield is ready.
    renderPortraits().catch((error: unknown) => console.warn("Building portraits failed; the HUD keeps its symbols.", error));
  }

  /** Building preview at a top-left tile, tinted green when the spot looks legal. */
  showPlacement(def: BuildingDef, x: number, y: number, valid: boolean): void {
    this.ghost?.show(def, x, y, valid);
  }

  /** Preview of a dragged line of one-tile buildings such as walls, each cell tinted by whether it can be built. */
  showPlacementLine(def: BuildingDef, cells: readonly GhostCell[]): void {
    this.ghost?.showLine(def, cells);
  }

  hidePlacement(): void {
    this.ghost?.hide();
  }

  /** The entity under a screen point: units by their on-screen body, buildings and nodes by footprint. */
  pick(px: number, py: number, purpose: PickPurpose = "select"): WorldEntity | undefined {
    const unit = nearestBody(this.unitCandidates(purpose), px, py, purpose === "select");
    if (unit) return unit;
    const ground = this.camera.groundAt(px, py);
    if (!ground) return undefined;
    for (const entity of this.world.entities.values()) {
      if (entity.info.category === "unit") continue;
      const f = this.world.footprint(entity);
      if (ground.x >= f.x - 0.2 && ground.y >= f.y - 0.2 && ground.x <= f.x + f.size + 0.2 && ground.y <= f.y + f.size + 0.4) return entity;
    }
    return undefined;
  }

  /** Units a click may mean; an order skips friends, since a friendly target would turn an attack into a plain move. */
  private *unitCandidates(purpose: PickPurpose): Generator<PickCandidate<WorldEntity>> {
    const scale = this.camera.scale;
    for (const entity of this.world.entities.values()) {
      if (entity.info.category !== "unit" || (purpose === "order" && !this.world.isHostile(entity))) continue;
      const body = this.bodyOf(entity);
      if (!body) continue;
      const reach = UNIT_PICK_PX * scale * (UNIT_PICK_MARGIN + entity.info.def.radius);
      yield { item: entity, body, reach, hero: isHero(entity.info.def) };
    }
  }

  /** Own units with any part of their body inside a screen rectangle. */
  unitsInRect(rect: ScreenRect): WorldEntity[] {
    const result: WorldEntity[] = [];
    for (const entity of this.world.entities.values()) {
      if (entity.info.category !== "unit" || !this.world.isMine(entity.owner)) continue;
      const body = this.bodyOf(entity);
      if (body && bodyInRect(body, rect)) result.push(entity);
    }
    return result;
  }

  /** A unit's body on screen, from its feet to the top of its model. */
  private bodyOf(entity: WorldEntity): ScreenBody | null {
    const stand = this.entities?.standOf(entity) ?? 0;
    const feet = this.camera.toScreen(entity.renderX, entity.renderY, stand);
    const head = this.camera.toScreen(entity.renderX, entity.renderY, stand + this.heightOf(entity.kind));
    return feet && head ? { feet, head } : null;
  }

  /** Map-space corners of the visible ground, for the minimap's view outline. */
  viewCorners(): ({ x: number; y: number } | null)[] {
    const canvas = this.engine.getRenderingCanvas();
    const w = canvas?.clientWidth ?? 0;
    const h = canvas?.clientHeight ?? 0;
    return [this.camera.groundAt(0, 0), this.camera.groundAt(w, 0), this.camera.groundAt(w, h), this.camera.groundAt(0, h)];
  }
}
