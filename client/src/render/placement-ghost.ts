import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { kinds, type BuildingDef } from "../content/content";
import { InstanceBatch } from "./batch";
import { isWallKind } from "./building-recipes";
import { FRONT_YAW, type StructureCatalog } from "./structures";

const VALID = new Color3(0.25, 0.85, 0.35);
const INVALID = new Color3(0.95, 0.2, 0.15);
const MODEL_TINT = 0.35;
const MODEL_ALPHA = 0.55;
const PLATE_ALPHA = 0.4;
const PLATE_LIFT = 0.04;

/** One tile of a dragged line of buildings, such as a wall. */
export interface GhostCell {
  x: number;
  y: number;
  valid: boolean;
}

/** The building about to be placed: a see-through copy of its model over a tinted footprint plate. */
export class PlacementGhost {
  private readonly plate: Mesh;
  private readonly plateMaterial: StandardMaterial;
  private readonly modelMaterial: StandardMaterial;
  private readonly models = new Map<string, Mesh>();
  private readonly linePlates: InstanceBatch;
  private readonly lineModels = new Map<string, InstanceBatch>();
  private shown: Mesh | null = null;
  private shownLine: InstanceBatch | null = null;
  private readonly matrix = new Matrix();
  private readonly yaw = Quaternion.RotationYawPitchRoll(FRONT_YAW, 0, 0);

  constructor(
    private readonly scene: Scene,
    private readonly structures: StructureCatalog,
  ) {
    this.plateMaterial = new StandardMaterial("ghost-plate", scene);
    this.plateMaterial.disableLighting = true;
    this.plateMaterial.alpha = PLATE_ALPHA;
    this.plate = CreateGround("ghost-plate", { width: 1, height: 1 }, scene);
    this.plate.material = this.plateMaterial;
    this.plate.isPickable = false;
    this.plate.isVisible = false;
    this.modelMaterial = new StandardMaterial("ghost-model", scene);
    this.modelMaterial.diffuseColor = new Color3(0.75, 0.75, 0.75);
    this.modelMaterial.alpha = MODEL_ALPHA;
    this.modelMaterial.specularColor = Color3.Black();

    const linePlate = CreateGround("ghost-line-plate", { width: 0.94, height: 0.94 }, scene);
    const linePlateMaterial = new StandardMaterial("ghost-line-plate", scene);
    linePlateMaterial.disableLighting = true;
    linePlateMaterial.emissiveColor = Color3.White();
    linePlateMaterial.alpha = PLATE_ALPHA;
    linePlate.material = linePlateMaterial;
    this.linePlates = new InstanceBatch(linePlate, { color: 4 });
  }

  show(def: BuildingDef, x: number, y: number, valid: boolean): void {
    const model = this.model(def);
    if (this.shown !== model || this.shownLine) this.hide();
    this.shown = model;
    const tint = valid ? VALID : INVALID;
    this.plateMaterial.emissiveColor = tint;
    tint.scaleToRef(MODEL_TINT, this.modelMaterial.emissiveColor);
    this.plate.isVisible = true;
    this.plate.scaling.set(def.size, 1, def.size);
    this.plate.position.set(x + def.size / 2, PLATE_LIFT, -(y + def.size / 2));
    model.isVisible = true;
    model.position.set(x + def.size / 2, 0, -(y + def.size / 2));
  }

  /** A dragged line of one-tile buildings: a tinted plate per cell and the model on every cell that can be built. */
  showLine(def: BuildingDef, cells: readonly GhostCell[]): void {
    this.hide();
    const models = this.lineModelsFor(def);
    this.linePlates.begin();
    models.begin();
    const scale = new Vector3(1, 1, 1);
    for (const cell of cells) {
      const position = new Vector3(cell.x + def.size / 2, PLATE_LIFT, -(cell.y + def.size / 2));
      Matrix.ComposeToRef(scale, Quaternion.Identity(), position, this.matrix);
      const tint = cell.valid ? VALID : INVALID;
      this.linePlates.pushColored(this.matrix, tint.r, tint.g, tint.b, 1);
      if (!cell.valid) continue;
      position.y = 0;
      Matrix.ComposeToRef(scale, this.yaw, position, this.matrix);
      models.push(this.matrix);
    }
    this.linePlates.end();
    models.end();
    VALID.scaleToRef(MODEL_TINT, this.modelMaterial.emissiveColor);
    this.shownLine = models;
  }

  hide(): void {
    this.plate.isVisible = false;
    if (this.shown) this.shown.isVisible = false;
    this.shown = null;
    if (this.shownLine) {
      this.shownLine.begin();
      this.shownLine.end();
      this.linePlates.begin();
      this.linePlates.end();
    }
    this.shownLine = null;
  }

  private model(def: BuildingDef): Mesh {
    const key = def.id;
    let mesh = this.models.get(key);
    if (mesh) return mesh;
    mesh = this.copy(def, `ghost-${key}`);
    mesh.rotation.y = FRONT_YAW;
    this.models.set(key, mesh);
    return mesh;
  }

  private lineModelsFor(def: BuildingDef): InstanceBatch {
    const key = def.id;
    let batch = this.lineModels.get(key);
    if (!batch) {
      batch = new InstanceBatch(this.copy(def, `ghost-line-${key}`));
      this.lineModels.set(key, batch);
    }
    return batch;
  }

  /** The finished model's geometry under the ghost material, so any building look works as a ghost. */
  private copy(def: BuildingDef, name: string): Mesh {
    const info = kinds.find((k) => k.category === "building" && k.def.id === def.id)!;
    const template = isWallKind(def.id) ? this.structures.wallPiece(info, "post", 1, null) : this.structures.building(info, 0, null).mesh;
    const mesh = new Mesh(name, this.scene);
    template.geometry!.applyToMesh(mesh);
    // Thin-instance buffers live on the geometry, so the ghost must not share the batched template's.
    mesh.makeGeometryUnique();
    mesh.sideOrientation = template.sideOrientation;
    mesh.material = this.modelMaterial;
    mesh.isPickable = false;
    mesh.isVisible = false;
    return mesh;
  }
}
