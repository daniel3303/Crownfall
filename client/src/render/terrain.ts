import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import type { Scene } from "@babylonjs/core/scene";
import type { ClientWorld } from "../game/world";
import { isWaterTile, Tile } from "../net/protocol";
import { InstanceBatch } from "./batch";
import { TEAM_ATTRIBUTE } from "./building-material";
import type { FogOfWar } from "./fog";
import { Forest, type TreeModels } from "./forest";
import type { SceneLighting } from "./lighting";
import { buildHeights, buildSplat, hash2, HEIGHT_RES, SPLAT_RES, splatAround, WATER_LEVEL, type TileGrid } from "./terrain-field";
import { splatTexture, terrainMaterial, TerrainSplat, type TerrainTextures } from "./terrain-material";
import { waterField, WaterSurface } from "./water";
import type { AssetLibrary } from "./assets";

const WATER_PLANTS = ["waterlily_A", "waterlily_B", "waterplant_A", "waterplant_B", "waterplant_C"];
/** Tiles of bare ground round a building's footprint. */
const YARD = 1;
/** Lilies need this much water over the bed, or the beach would swallow them. */
const PLANT_CLEARANCE = 0.06;

/** Height-mapped ground with blended photo-scanned surfaces, a lake surface over it, instanced trees and decor. */
export class Terrain {
  private readonly heights: Float32Array;
  private readonly splatData: [Uint8Array, Uint8Array];
  private readonly splat: [RawTexture, RawTexture];
  private readonly forest: Forest;
  private readonly rocks: InstanceBatch[];
  /** Tiles worn bare round buildings, and the buildings already worn in. */
  private readonly trodden: Uint8Array;
  private readonly worn = new Set<number>();
  private readonly ground: TileGrid;
  private readonly plants: InstanceBatch[];
  private readonly waterSurface: WaterSurface;
  private readonly matrix = new Matrix();
  private tilesVersion = -1;

  constructor(
    scene: Scene,
    private readonly world: ClientWorld,
    fog: FogOfWar,
    assets: AssetLibrary,
    lighting: SceneLighting,
    textures: TerrainTextures,
    trees: TreeModels,
    rocks: Mesh[],
  ) {
    const { width, height } = world;
    this.trodden = new Uint8Array(width * height);
    this.ground = { width, height, tile: (x, y) => world.tile(x, y), trodden: (x, y) => this.trodden[y * width + x] === 1 };
    this.heights = buildHeights(world);
    this.splatData = buildSplat(this.ground);
    this.splat = [splatTexture(scene, this.splatData[0], width, height), splatTexture(scene, this.splatData[1], width, height)];
    const groundMaterial = terrainMaterial(scene);
    new TerrainSplat(groundMaterial, textures, this.splat, width, height);
    fog.apply(groundMaterial);

    const ground = this.buildGround(scene);
    ground.material = groundMaterial;
    ground.isPickable = false;
    ground.receiveShadows = true;
    ground.freezeWorldMatrix();

    const water = CreateGround("water", { width: width + 40, height: height + 40 }, scene);
    water.position.set(width / 2, WATER_LEVEL, -height / 2);
    const waterMaterial = new StandardMaterial("water", scene);
    waterMaterial.specularColor = new Color3(0.9, 0.92, 0.95);
    waterMaterial.specularPower = 180;
    // Blended so the shallows show the lake bed; the plugin sets the per-pixel alpha.
    waterMaterial.alpha = 0.999;
    const depth = waterField(scene, width, height, (x, y) => isWaterTile(world.tile(x, y)), this.heights, HEIGHT_RES);
    this.waterSurface = new WaterSurface(waterMaterial, depth);
    fog.apply(waterMaterial);
    water.material = waterMaterial;
    water.isPickable = false;
    water.freezeWorldMatrix();

    this.forest = new Forest(world, trees, lighting);
    this.rocks = rocks.map((mesh) => new InstanceBatch(mesh, { [TEAM_ATTRIBUTE]: 4 }));
    this.plants = WATER_PLANTS.map((name) => new InstanceBatch(assets.template(name)));
  }

  sync(now: number): void {
    this.waterSurface.time = now / 1000;
    this.forest.time = now / 1000;
    this.repaint(this.wearYards());
    if (this.tilesVersion === this.world.tilesVersion) return;
    const first = this.tilesVersion < 0;
    this.tilesVersion = this.world.tilesVersion;
    const changes = this.world.pendingTileChanges;
    this.world.pendingTileChanges = [];
    if (!first) this.repaint(changes);
    this.forest.rebuild(first ? null : changes);
    this.rebuildDecor();
  }

  /** One vertex every 1/HEIGHT_RES of a tile, so beaches slope smoothly instead of stepping tile by tile. */
  private buildGround(scene: Scene): Mesh {
    const w = this.world.width * HEIGHT_RES + 1;
    const h = this.world.height * HEIGHT_RES + 1;
    const positions = new Float32Array(w * h * 3);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 3;
        positions[o] = x / HEIGHT_RES;
        positions[o + 1] = this.heights[y * w + x]!;
        positions[o + 2] = -y / HEIGHT_RES;
      }
    }
    const indices = new Uint32Array((w - 1) * (h - 1) * 6);
    let i = 0;
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w - 1; x++) {
        const a = y * w + x;
        indices.set([a, a + w, a + 1, a + 1, a + w, a + w + 1], i);
        i += 6;
      }
    }
    const normals = new Float32Array(positions.length);
    VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    data.normals = normals;
    const mesh = new Mesh("terrain", scene);
    data.applyToMesh(mesh, false);
    return mesh;
  }

  /**
   * Wears the ground bare round every building as it comes into view, and leaves it worn after the building falls;
   * returns the tiles that changed.
   */
  private wearYards(): { x: number; y: number }[] {
    const changes: { x: number; y: number }[] = [];
    for (const entity of this.world.entities.values()) {
      if (entity.info.category !== "building" || this.worn.has(entity.id)) continue;
      this.worn.add(entity.id);
      const f = this.world.footprint(entity);
      for (let y = Math.max(0, f.y - YARD); y < Math.min(this.world.height, f.y + f.size + YARD); y++) {
        for (let x = Math.max(0, f.x - YARD); x < Math.min(this.world.width, f.x + f.size + YARD); x++) {
          const index = y * this.world.width + x;
          if (this.trodden[index]) continue;
          this.trodden[index] = 1;
          changes.push({ x, y });
        }
      }
    }
    return changes;
  }

  /** Felled trees and worn yards repaint the ground, recomputing only the texels each changed tile reaches. */
  private repaint(changes: { x: number; y: number }[]): void {
    if (changes.length === 0) return;
    const rowTexels = this.world.width * SPLAT_RES;
    for (const { x, y } of changes) {
      const block = splatAround(this.ground, x, y);
      const { x0, y0, w, h } = block.window;
      for (let row = 0; row < h; row++) {
        const target = ((y0 + row) * rowTexels + x0) * 4;
        this.splatData[0].set(block.first.subarray(row * w * 4, (row + 1) * w * 4), target);
        this.splatData[1].set(block.second.subarray(row * w * 4, (row + 1) * w * 4), target);
      }
    }
    this.splat[0].update(this.splatData[0]);
    this.splat[1].update(this.splatData[1]);
  }

  /** Ground height at a map point, read from the nearest height vertex. */
  private groundHeight(x: number, y: number): number {
    const w = this.world.width * HEIGHT_RES + 1;
    return this.heights[Math.round(y * HEIGHT_RES) * w + Math.round(x * HEIGHT_RES)] ?? 0;
  }

  /** Rocks under the forest canopy and lilies in the shallows; trees block building there, so decor never pokes through. */
  private rebuildDecor(): void {
    for (const batch of [...this.rocks, ...this.plants]) batch.begin();
    const scale = new Vector3();
    const rotation = new Quaternion();
    const position = new Vector3();
    const { width, height } = this.world;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = this.world.tile(x, y);
        const n = hash2(x + 31, y + 17);
        const px = x + 0.2 + hash2(x + 3, y) * 0.6;
        const py = y + 0.2 + hash2(x, y + 3) * 0.6;
        let batches: InstanceBatch[];
        let lift = 0;
        if (tile === Tile.Tree && n < 0.14) {
          batches = this.rocks;
        } else if (isWaterTile(tile) && n < 0.3 && this.groundHeight(px, py) < WATER_LEVEL - PLANT_CLEARANCE && this.nearLand(x, y)) {
          batches = this.plants;
          lift = WATER_LEVEL + 0.01;
        } else {
          continue;
        }
        const size = 1.6 + hash2(y, x + 5) * 1.2;
        scale.set(size, size, size);
        Quaternion.RotationYawPitchRollToRef(hash2(x, y + 9) * Math.PI * 2, 0, 0, rotation);
        position.set(px, lift, -py);
        Matrix.ComposeToRef(scale, rotation, position, this.matrix);
        batches[Math.floor(hash2(x + 7, y + 7) * batches.length) % batches.length]!.push(this.matrix);
      }
    }
    for (const batch of [...this.rocks, ...this.plants]) batch.end();
  }

  private nearLand(x: number, y: number): boolean {
    const { width, height } = this.world;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = Math.min(width - 1, Math.max(0, x + dx));
        const ty = Math.min(height - 1, Math.max(0, y + dy));
        if (!isWaterTile(this.world.tile(tx, ty))) return true;
      }
    }
    return false;
  }
}
