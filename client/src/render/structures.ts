import type { Material } from "@babylonjs/core/Materials/material";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";
import { footprintSize, kinds, type KindInfo } from "../content/content";
import type { MeshData } from "./building-geometry";
import { SURFACE_ATTRIBUTE, TINT_ATTRIBUTE } from "./building-material";
import {
  FINISHED,
  RUIN,
  buildingData,
  buildingHeight,
  constructionStep,
  isWallKind,
  lookLevel,
  upgradeScaffoldData,
  variantsOf,
  wallPieceData,
  type Stage,
  type WallPiece,
} from "./building-recipes";
import { DECOR_ROCKS, NODE_VARIANTS, decorRockData, hasNodeRecipe, nodeData } from "./node-recipes";
import { hash2 } from "./terrain-field";

/** Building fronts are modelled facing +Z (north); turning them half round faces them toward the camera. */
export const FRONT_YAW = Math.PI;

function stageOf(progress: number | null): Stage {
  return progress === null ? FINISHED : { kind: "construction", step: constructionStep(progress) };
}

function stageKey(stage: Stage): string {
  return stage.kind === "construction" ? `c${stage.step}` : stage.kind;
}

/**
 * Procedural buildings and resource nodes, covered in scanned stone, plaster, timber, roofing and rock, built once per
 * look on first use. Team colours are per instance, so one mesh serves every team.
 */
export class StructureCatalog {
  private readonly meshes = new Map<string, Mesh>();

  constructor(
    private readonly scene: Scene,
    private readonly material: Material,
    private readonly bushes: Mesh[],
  ) {}

  /** Model height for health bars and picking; buildings grow with their level. */
  heightOf(kind: number, level = 1): number | undefined {
    const info = kinds[kind];
    if (!info) return undefined;
    if (info.category === "node") return 1;
    if (info.category !== "building") return undefined;
    return buildingHeight(info.def.id, level);
  }

  /** A building's look at its level, or its construction step while progress (0..100) is set. */
  building(info: KindInfo, entityId: number, progress: number | null, level = 1): { mesh: Mesh; scale: number } {
    const id = info.def.id;
    const look = lookLevel(id, level);
    const variant = Math.floor(Math.min(0.999, hash2(entityId, 11)) * variantsOf(id));
    const stage = stageOf(progress);
    const key = `${id}:${look}:${variant}:${stageKey(stage)}`;
    return { mesh: this.mesh(key, () => buildingData(id, footprintSize(info), look, variant, stage)), scale: 1 };
  }

  /** One piece of a wall tile: its post (a gate or tower for those kinds) or an arm toward a neighbour. */
  wallPiece(info: KindInfo, piece: WallPiece, level: number, progress: number | null): Mesh {
    const id = info.def.id;
    const look = lookLevel(piece === "post" ? id : "wall", level);
    const stage = stageOf(progress);
    return this.mesh(`${id}:${piece}:${look}:${stageKey(stage)}`, () => wallPieceData(id, piece, look, stage));
  }

  /** Scaffolding round a building being upgraded, drawn over its current look. */
  upgradeScaffold(info: KindInfo, level: number): Mesh {
    const id = info.def.id;
    const look = lookLevel(id, level);
    return this.mesh(`${id}:${look}:upgrade`, () => upgradeScaffoldData(id, footprintSize(info), look));
  }

  /** A resource node's meshes: scanned boulders for mines and quarries, a berry-laden bush for food. */
  node(kind: number, entityId: number): Mesh[] {
    const info = kinds[kind];
    if (!info || !hasNodeRecipe(info.def.id)) return [];
    const variant = Math.floor(Math.min(0.999, hash2(entityId, 5)) * NODE_VARIANTS);
    const mesh = this.mesh(`node:${info.def.id}:${variant}`, () => nodeData(info.def.id, variant));
    if (info.def.id !== "berries") return [mesh];
    return [this.bushes[variant % this.bushes.length]!, mesh];
  }

  /** Field stones for the terrain to scatter. */
  decorRocks(): Mesh[] {
    return Array.from({ length: DECOR_ROCKS }, (_, variant) => this.mesh(`decor-rock:${variant}`, () => decorRockData(variant)));
  }

  /** What is left where a building fell at `level`: the bottom of its walls amid rubble. */
  ruin(info: KindInfo, level = 1): { mesh: Mesh; scale: number } {
    const id = info.def.id;
    const look = lookLevel(id, level);
    if (isWallKind(id)) return { mesh: this.mesh(`${id}:${look}:ruin`, () => wallPieceData(id, "post", look, RUIN)), scale: 1 };
    return { mesh: this.mesh(`${id}:${look}:ruin`, () => buildingData(id, footprintSize(info), look, 0, RUIN)), scale: 1 };
  }

  private mesh(key: string, build: () => MeshData): Mesh {
    let mesh = this.meshes.get(key);
    if (!mesh) {
      mesh = toMesh(`building-${key}`, this.scene, build(), this.material);
      this.meshes.set(key, mesh);
    }
    return mesh;
  }
}

function toMesh(name: string, scene: Scene, data: MeshData, material: Material): Mesh {
  const mesh = new Mesh(name, scene);
  const vertexData = new VertexData();
  vertexData.positions = data.positions;
  vertexData.normals = data.normals;
  vertexData.indices = data.indices;
  vertexData.applyToMesh(mesh);
  mesh.setVerticesData(SURFACE_ATTRIBUTE, data.surface, false, 4);
  mesh.setVerticesData(TINT_ATTRIBUTE, data.tint, false, 3);
  mesh.material = material;
  mesh.isVisible = false;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  mesh.metadata = { teamColored: true };
  return mesh;
}
