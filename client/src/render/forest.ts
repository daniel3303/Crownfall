import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Material } from "@babylonjs/core/Materials/material";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF/2.0/glTFLoader";
import "@babylonjs/loaders/glTF/2.0/Extensions/EXT_texture_webp";
import type { ClientWorld } from "../game/world";
import { isWaterTile, Tile } from "../net/protocol";
import { InstanceBatch } from "./batch";
import type { FogOfWar } from "./fog";
import type { SceneLighting } from "./lighting";
import { fbm, hash2 } from "./terrain-field";

/** Trees are batched per square of this many tiles, so the camera culls whole off-screen stands. */
const CHUNK = 16;
/** Pines grow in stands and broadleaves in groves: species follows noise this many tiles across. */
const STAND_SIZE = 11;
const PINE_HEIGHT = 3.1;
const BROADLEAF_HEIGHT = 2.6;
const HEIGHT_VARIANCE = 0.35;

export interface TreeModels {
  pines: Mesh[];
  broadleaves: Mesh[];
  /** Berry bushes for the food node, not planted by the forest. */
  bushes: Mesh[];
  sway: TreeSway;
}

/** Bushes are modelled one unit tall like the trees; a berry bush is wider than it is tall. */
const BUSH_SCALE = new Vector3(1.15, 0.8, 1.15);

/** Loads trees.glb into hidden template meshes, each with its bark and leaf materials as one multi-material mesh. */
export async function loadTreeModels(scene: Scene, fog: FogOfWar): Promise<TreeModels> {
  const container = await LoadAssetContainerAsync("/assets/trees.glb", scene);
  container.addAllToScene();
  const sway = new TreeSway();
  const pines: Mesh[] = [];
  const broadleaves: Mesh[] = [];
  const bushes: Mesh[] = [];
  const prepared = new Set<Material>();
  for (const holder of container.transformNodes.filter((node) => node.parent?.name === "__root__")) {
    const parts = holder.getChildMeshes(false).filter((m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0);
    for (const part of parts) {
      part.computeWorldMatrix(true);
      const material = part.material as PBRMaterial;
      if (!prepared.has(material)) {
        prepared.add(material);
        prepareMaterial(material, fog, sway);
      }
    }
    const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, true);
    if (!merged) continue;
    // The merge bakes the loader's mirrored root into the vertices, so the glTF winding flag no longer applies.
    merged.sideOrientation = Material.CounterClockWiseSideOrientation;
    merged.name = holder.name;
    merged.isVisible = false;
    merged.isPickable = false;
    merged.receiveShadows = true;
    if (holder.name.startsWith("bush")) {
      merged.scaling.copyFrom(BUSH_SCALE);
      merged.bakeCurrentTransformIntoVertices();
      bushes.push(merged);
    } else (holder.name.startsWith("pine") ? pines : broadleaves).push(merged);
  }
  for (const node of container.transformNodes) node.dispose();
  if (pines.length === 0 || broadleaves.length === 0 || bushes.length === 0) throw new Error("trees.glb is missing a species");
  return { pines, broadleaves, bushes, sway };
}

function prepareMaterial(material: PBRMaterial, fog: FogOfWar, sway: TreeSway): void {
  material.metallic = 0;
  if (material.transparencyMode === PBRMaterial.PBRMATERIAL_ALPHATEST) {
    // The build points leaf normals out of the crown; flipping them on back faces would darken half the canopy.
    material.twoSidedLighting = false;
    material.backFaceCulling = false;
    sway.attach(material);
  }
  fog.apply(material);
}

/** Every tree in the map, one culled thin-instance batch per template per chunk, rebuilt chunk by chunk as trees fall. */
export class Forest {
  private readonly batches = new Map<string, InstanceBatch>();
  private readonly matrix = new Matrix();
  private readonly scale = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly position = new Vector3();

  constructor(
    private readonly world: ClientWorld,
    private readonly models: TreeModels,
    private readonly lighting: SceneLighting,
  ) {}

  /** Rebuilds every chunk on the first call, then only the chunks holding changed tiles. */
  rebuild(changes: { x: number; y: number }[] | null): void {
    const chunks = new Set<string>();
    if (!changes) {
      for (let cy = 0; cy < Math.ceil(this.world.height / CHUNK); cy++) {
        for (let cx = 0; cx < Math.ceil(this.world.width / CHUNK); cx++) chunks.add(`${cx},${cy}`);
      }
    } else {
      for (const { x, y } of changes) chunks.add(`${Math.floor(x / CHUNK)},${Math.floor(y / CHUNK)}`);
    }
    for (const key of chunks) {
      const [cx, cy] = key.split(",").map(Number) as [number, number];
      this.fillChunk(cx, cy);
    }
  }

  set time(seconds: number) {
    this.models.sway.time = seconds;
  }

  private fillChunk(cx: number, cy: number): void {
    const touched = new Set<InstanceBatch>();
    for (const batch of this.batches.values()) {
      if (batch.mesh.metadata?.chunk === `${cx},${cy}`) {
        batch.begin();
        touched.add(batch);
      }
    }
    const x1 = Math.min(this.world.width, (cx + 1) * CHUNK);
    const y1 = Math.min(this.world.height, (cy + 1) * CHUNK);
    for (let y = cy * CHUNK; y < y1; y++) {
      for (let x = cx * CHUNK; x < x1; x++) {
        if (this.world.tile(x, y) !== Tile.Tree) continue;
        const pine = fbm(x / STAND_SIZE + 61, y / STAND_SIZE - 17) + (hash2(x + 41, y + 3) - 0.5) * 0.25 > 0.5;
        const templates = pine ? this.models.pines : this.models.broadleaves;
        const template = templates[Math.floor(hash2(x + 11, y) * templates.length) % templates.length]!;
        const batch = this.batch(template, cx, cy);
        if (!touched.has(batch)) {
          batch.begin();
          touched.add(batch);
        }
        this.place(batch, x, y, pine ? PINE_HEIGHT : BROADLEAF_HEIGHT);
      }
    }
    for (const batch of touched) batch.end();
  }

  private place(batch: InstanceBatch, x: number, y: number, height: number): void {
    const size = height * (1 - HEIGHT_VARIANCE / 2 + hash2(x, y) * HEIGHT_VARIANCE);
    const girth = size * (0.9 + hash2(y, x) * 0.2);
    this.scale.set(girth, size, girth);
    Quaternion.RotationYawPitchRollToRef(hash2(x + 5, y + 9) * Math.PI * 2, (hash2(x + 2, y) - 0.5) * 0.08, (hash2(x, y + 2) - 0.5) * 0.08, this.rotation);
    // Next to water the trunk stays near the tile centre, on the ground the terrain keeps dry there.
    const jitter = this.besideWater(x, y) ? 0.12 : 0.5;
    this.position.set(x + 0.5 + (hash2(x + 7, y) - 0.5) * jitter, 0, -(y + 0.5 + (hash2(x, y + 7) - 0.5) * jitter));
    Matrix.ComposeToRef(this.scale, this.rotation, this.position, this.matrix);
    // Slight per-tree tint so a stand reads as many trees, not one model repeated.
    const tint = 0.84 + hash2(x + 3, y + 5) * 0.28;
    const warm = (hash2(x + 13, y + 1) - 0.5) * 0.08;
    batch.pushColored(this.matrix, tint * (1 + warm), tint, tint * (1 - warm));
  }

  private besideWater(x: number, y: number): boolean {
    const { width, height } = this.world;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < width && ny < height && isWaterTile(this.world.tile(nx, ny))) return true;
    }
    return false;
  }

  private batch(template: Mesh, cx: number, cy: number): InstanceBatch {
    const key = `${template.name}@${cx},${cy}`;
    let batch = this.batches.get(key);
    if (!batch) {
      const mesh = template.clone(key, null, true, false);
      // Thin-instance buffers live on the geometry, so every chunk needs its own copy.
      mesh.makeGeometryUnique();
      mesh.metadata = { chunk: `${cx},${cy}` };
      batch = new InstanceBatch(mesh, { color: 4 }, true);
      this.lighting.addCaster(mesh, true);
      this.batches.set(key, batch);
    }
    return batch;
  }
}

/** Sways leaves in the wind: the tips move most, each tree on its own phase from its world position. */
export class TreeSway {
  time = 0;
  private readonly plugins: TreeSwayPlugin[] = [];

  attach(material: PBRMaterial): void {
    this.plugins.push(new TreeSwayPlugin(material, this));
  }
}

class TreeSwayPlugin extends MaterialPluginBase {
  constructor(
    material: Material,
    private readonly sway: TreeSway,
  ) {
    super(material, "TreeSway", 120, { TREE_SWAY: false });
    this._enable(true);
  }

  override getClassName(): string {
    return "TreeSwayPlugin";
  }

  override isCompatible(shaderLanguage: number): boolean {
    return shaderLanguage === 0;
  }

  override prepareDefines(defines: MaterialDefines): void {
    defines["TREE_SWAY"] = true;
  }

  override getUniforms() {
    return {
      ubo: [{ name: "treeSwayTime", size: 1, type: "float" }],
      vertex: "#ifdef TREE_SWAY\nuniform float treeSwayTime;\n#endif\n",
    };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    uniformBuffer.updateFloat("treeSwayTime", this.sway.time);
  }

  override getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType !== "vertex") return null;
    return {
      CUSTOM_VERTEX_UPDATE_WORLDPOS: `
#ifdef TREE_SWAY
  {
    // Models are one unit tall, so local height is how far up the tree this vertex sits.
    float swayHeight = clamp(positionUpdated.y, 0.0, 1.0);
    vec2 swayPhase = finalWorld[3].xz * 0.37;
    float swayGust = sin(treeSwayTime * 0.7 + swayPhase.x * 0.5) * 0.5 + 0.5;
    vec2 swayBend = vec2(sin(treeSwayTime * 1.7 + swayPhase.x + swayPhase.y), cos(treeSwayTime * 1.3 + swayPhase.y)) * (0.025 + 0.035 * swayGust);
    float swayFlutter = sin(treeSwayTime * 6.0 + dot(worldPos.xyz, vec3(3.1, 2.3, 4.7))) * 0.012;
    worldPos.xz += (swayBend + swayFlutter) * swayHeight * swayHeight * 3.0;
  }
#endif
`,
    };
  }
}
