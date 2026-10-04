import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { kindInfo } from "../content/content";
import type { ClientWorld, WorldEntity } from "../game/world";
import { Flags, NEUTRAL_OWNER } from "../net/protocol";
import { hexToRgb, NEUTRAL_COLOR, playerColor } from "../ui/palette";
import { InstanceBatch } from "./batch";
import type { SceneLighting } from "./lighting";
import { TEAM_ATTRIBUTE } from "./building-material";
import { WALL_KINDS, type WallPiece } from "./building-recipes";
import { FRONT_YAW, type StructureCatalog } from "./structures";
import { hash2, WATER_LEVEL } from "./terrain-field";
import { UnitLayer } from "./unit-layer";
import type { UnitModel } from "./unit-models";

const RING_MINE: [number, number, number] = [0.3, 1, 0.45];
const RING_ALLY: [number, number, number] = [0.35, 0.75, 1];
const RING_ENEMY: [number, number, number] = [1, 0.3, 0.25];
const RING_NEUTRAL: [number, number, number] = [1, 0.85, 0.3];
const HERO_RING: [number, number, number] = [1, 0.78, 0.25];
const RUIN_MS = 30000;
const RUIN_SINK_MS = 2500;
const RUIN_SINK_DEPTH = 0.9;
const HEX_SIDES = 6;
/** Selection ring diameter: around a unit's collision radius plus a margin, or just outside a footprint. */
const UNIT_RING_SCALE = 2.6;
const UNIT_RING_MARGIN = 0.25;
const BUILDING_RING_SCALE = 1.05;
const RING_LIFT = 0.06;

/** The eight neighbours a wall tile can join, orthogonal first. */
const WALL_DIRECTIONS: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];
/** Albedo is linear; player colours are sRGB. */
const GAMMA = 2.2;

/** A building's level from the snapshot, once the protocol carries one. */
function levelOf(entity: WorldEntity): number {
  return (entity as WorldEntity & { level?: number }).level ?? 1;
}

function isUpgrading(entity: WorldEntity): boolean {
  return (entity as WorldEntity & { upgrading?: boolean }).upgrading === true;
}

interface Ruin {
  kind: number;
  /** The level the building fell at, which picks its ruin. */
  level: number;
  x: number;
  y: number;
  yaw: number;
  until: number;
}

/** Draws every known entity with thin instances: animated units per kind, buildings per procedural look, nodes per KayKit template. */
export class EntityLayer {
  private readonly units: UnitLayer;
  private readonly structureBatches = new Map<Mesh, InstanceBatch>();
  private readonly rings: InstanceBatch;
  private readonly ruins: Ruin[] = [];
  private readonly colorCache = new Map<number, [number, number, number]>();
  private readonly clothCache = new Map<number, [number, number, number]>();
  /** Team of the wall, gate or wall tower on each tile this frame, so neighbours can join up. */
  private readonly wallTiles = new Map<number, number>();
  private readonly teamCache = new Map<number, number>();
  private readonly matrix = new Matrix();
  private readonly scale = new Vector3();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();

  constructor(
    scene: Scene,
    models: Map<string, UnitModel>,
    private readonly structures: StructureCatalog,
    private readonly lighting: SceneLighting,
    private readonly world: ClientWorld,
  ) {
    this.units = new UnitLayer(scene, models, lighting, (owner) => this.ownerColor(owner));
    const ring = CreateTorus("ring", { diameter: 1, thickness: 0.06, tessellation: 32 }, scene);
    const ringMaterial = new StandardMaterial("ring", scene);
    ringMaterial.disableLighting = true;
    ringMaterial.emissiveColor = Color3.White();
    ring.material = ringMaterial;
    this.rings = new InstanceBatch(ring, { color: 4 });
  }

  heightOf(kind: number, level = 1): number {
    return this.units.heightOf(kind) ?? this.structures.heightOf(kind, level) ?? 1;
  }

  /** The height of an entity's top, for health bars: buildings grow with their level, wading units stand lower. */
  entityHeight(entity: WorldEntity): number {
    return this.standOf(entity) + this.heightOf(entity.kind, entity.info.category === "building" ? levelOf(entity) : 1);
  }

  /** The height a unit's feet stand at (lower on a beach or in the shallows); 0 for everything else. */
  standOf(entity: WorldEntity): number {
    return entity.info.category === "unit" ? this.units.groundAt(entity.renderX, entity.renderY).height : 0;
  }

  addCorpse(id: number, kind: number, owner: number, x: number, y: number, now: number): void {
    this.units.addCorpse(id, kind, owner, x, y, now);
  }

  cast(heroId: number, slot: number, now: number): void {
    this.units.cast(heroId, slot, now);
  }

  /** Leaves rubble where a building fell; it sinks away after a while. */
  addRuin(kind: number, x: number, y: number, now: number, level = 1): void {
    this.ruins.push({ kind, level, x, y, yaw: Math.floor(hash2(Math.round(x), Math.round(y)) * 6) * (Math.PI / 3), until: now + RUIN_MS });
  }

  update(world: ClientWorld, selected: ReadonlySet<number>, now: number): void {
    this.units.begin(now);
    for (const batch of this.structureBatches.values()) batch.begin();
    this.rings.begin();
    this.indexWalls(world);
    for (const entity of world.entities.values()) {
      if (entity.info.category === "unit") this.units.draw(world, entity);
      else this.drawStructure(world, entity);
      if (selected.has(entity.id)) this.ring(entity, this.ringColor(world, entity), 1);
      else if ((entity.flags & Flags.Hero) !== 0) this.ring(entity, HERO_RING, 0.85);
    }
    this.drawRuins(now);
    this.units.end(world);
    for (const batch of this.structureBatches.values()) batch.end();
    this.rings.end();
  }

  private drawStructure(world: ClientWorld, entity: WorldEntity): void {
    if (entity.info.category === "node") {
      // Mines keep their adit toward the camera.
      this.compose(entity.renderX, entity.renderY, entity.info.def.id === "goldMine" ? FRONT_YAW : Math.floor(hash2(entity.id, 3) * HEX_SIDES) * ((Math.PI * 2) / HEX_SIDES), 1);
      for (const mesh of this.structures.node(entity.kind, entity.id)) this.pushBuilding(mesh, NEUTRAL_OWNER, hash2(entity.id, 29));
      return;
    }
    const progress = world.isUnderConstruction(entity) ? entity.extra : null;
    if ((WALL_KINDS as readonly string[]).includes(entity.info.def.id)) {
      this.drawWall(world, entity, progress);
      return;
    }
    const { mesh, scale } = this.structures.building(entity.info, entity.id, progress, levelOf(entity));
    this.compose(entity.renderX, entity.renderY, FRONT_YAW, scale);
    const seed = hash2(entity.id, 29);
    this.pushBuilding(mesh, entity.owner, seed);
    if (progress === null && isUpgrading(entity)) this.pushBuilding(this.structures.upgradeScaffold(entity.info, levelOf(entity)), entity.owner, seed);
  }

  private indexWalls(world: ClientWorld): void {
    this.wallTiles.clear();
    for (const entity of world.entities.values()) {
      if (entity.info.category !== "building" || !(WALL_KINDS as readonly string[]).includes(entity.info.def.id)) continue;
      this.wallTiles.set(this.tileKey(Math.floor(entity.renderX), Math.floor(entity.renderY)), this.teamOf(world, entity.owner));
    }
  }

  private tileKey(x: number, y: number): number {
    return y * this.world.width + x;
  }

  private joins(x: number, y: number, team: number): boolean {
    return x >= 0 && y >= 0 && x < this.world.width && this.wallTiles.get(this.tileKey(x, y)) === team;
  }

  /**
   * A wall tile is a post plus an arm toward each joined neighbour; a diagonal arm only where no orthogonal pair
   * already turns the corner. A gate turns to lie along the wall it sits in.
   */
  private drawWall(world: ClientWorld, entity: WorldEntity, progress: number | null): void {
    const x = Math.floor(entity.renderX);
    const y = Math.floor(entity.renderY);
    const team = this.teamOf(world, entity.owner);
    const level = levelOf(entity);
    const isGate = entity.info.def.id === "gate";
    let gateYaw = 0;
    for (const [dx, dy] of WALL_DIRECTIONS) {
      if (!this.joins(x + dx, y + dy, team)) continue;
      const diagonal = dx !== 0 && dy !== 0;
      if (diagonal && (this.joins(x + dx, y, team) || this.joins(x, y + dy, team))) continue;
      const yaw = Math.atan2(dy, dx);
      if (isGate) {
        gateYaw = yaw;
        break;
      }
      this.drawWallPiece(entity, diagonal ? "diagonal" : "arm", level, progress, yaw);
    }
    this.drawWallPiece(entity, "post", level, progress, isGate ? gateYaw : entity.info.def.id === "wallTower" ? FRONT_YAW : 0);
  }

  private drawWallPiece(entity: WorldEntity, piece: WallPiece, level: number, progress: number | null, yaw: number): void {
    const mesh = this.structures.wallPiece(entity.info, piece, level, progress);
    this.compose(entity.renderX, entity.renderY, yaw, 1);
    this.pushBuilding(mesh, entity.owner, hash2(entity.id, 29));
  }

  private pushBuilding(mesh: Mesh, owner: number, seed = 0.5): void {
    const batch = this.batchFor(mesh);
    const [r, g, b] = this.clothColor(owner);
    batch.write(TEAM_ATTRIBUTE, batch.push(this.matrix), r, g, b, seed);
  }

  private drawRuins(now: number): void {
    for (let i = this.ruins.length - 1; i >= 0; i--) {
      const ruin = this.ruins[i]!;
      const left = ruin.until - now;
      const info = kindInfo(ruin.kind);
      if (left <= 0 || !info) {
        this.ruins.splice(i, 1);
        continue;
      }
      const { mesh, scale } = this.structures.ruin(info, ruin.level);
      const sink = left < RUIN_SINK_MS ? (1 - left / RUIN_SINK_MS) * -RUIN_SINK_DEPTH * scale : 0;
      this.compose(ruin.x, ruin.y, ruin.yaw, scale, sink);
      this.pushBuilding(mesh, NEUTRAL_OWNER);
    }
  }

  private compose(x: number, y: number, yaw: number, scale: number, lift = 0): void {
    this.scale.set(scale, scale, scale);
    Quaternion.RotationYawPitchRollToRef(yaw, 0, 0, this.rotation);
    this.position.set(x, lift, -y);
    Matrix.ComposeToRef(this.scale, this.rotation, this.position, this.matrix);
  }

  private batchFor(mesh: Mesh): InstanceBatch {
    let batch = this.structureBatches.get(mesh);
    if (!batch) {
      batch = new InstanceBatch(mesh, mesh.metadata?.teamColored ? { [TEAM_ATTRIBUTE]: 4 } : {});
      batch.begin();
      this.lighting.addCaster(mesh);
      this.structureBatches.set(mesh, batch);
    }
    return batch;
  }

  private ring(entity: WorldEntity, color: [number, number, number], alpha: number): void {
    const size = entity.info.category === "unit" ? entity.info.def.radius * UNIT_RING_SCALE + UNIT_RING_MARGIN : entity.info.def.size * BUILDING_RING_SCALE;
    let lift = RING_LIFT;
    if (entity.info.category === "unit") {
      // On the water when wading; on a beach, raised so its uphill side clears the slope.
      const ground = this.units.groundAt(entity.renderX, entity.renderY);
      lift += Math.max(WATER_LEVEL, ground.height) + (Math.hypot(ground.slopeX, ground.slopeY) * size) / 2;
    }
    this.compose(entity.renderX, entity.renderY, 0, 1, lift);
    this.scale.set(size, 1, size);
    Matrix.ComposeToRef(this.scale, this.rotation, this.position, this.matrix);
    this.rings.pushColored(this.matrix, color[0], color[1], color[2], alpha);
  }

  private ringColor(world: ClientWorld, entity: WorldEntity): [number, number, number] {
    if (world.isMine(entity.owner)) return RING_MINE;
    if (world.isAlly(entity.owner)) return RING_ALLY;
    return world.isHostile(entity) && entity.owner !== NEUTRAL_OWNER ? RING_ENEMY : RING_NEUTRAL;
  }

  private teamOf(world: ClientWorld, owner: number): number {
    let team = this.teamCache.get(owner);
    if (team === undefined) {
      team = world.players.find((p) => p.index === owner)?.team ?? 0;
      this.teamCache.set(owner, team);
    }
    return team;
  }

  /** The owner's colour as linear albedo, for banners and other cloth. */
  private clothColor(owner: number): [number, number, number] {
    let color = this.clothCache.get(owner);
    if (!color) {
      const [r, g, b] = this.ownerColor(owner);
      color = [r ** GAMMA, g ** GAMMA, b ** GAMMA];
      this.clothCache.set(owner, color);
    }
    return color;
  }

  private ownerColor(owner: number): [number, number, number] {
    let color = this.colorCache.get(owner);
    if (!color) {
      color = hexToRgb(owner === NEUTRAL_OWNER ? NEUTRAL_COLOR : playerColor(this.world.players, owner));
      this.colorCache.set(owner, color);
    }
    return color;
  }
}
