import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Material } from "@babylonjs/core/Materials/material";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF/2.0/glTFLoader";
import "@babylonjs/loaders/glTF/2.0/Extensions/KHR_mesh_quantization";
import type { FogOfWar } from "./fog";
import { weather } from "./weathering";

/** The remaining KayKit models (water plants): one hidden template mesh per env.glb node, sharing the palette material. */
export class AssetLibrary {
  private readonly templates = new Map<string, Mesh>();
  private material!: StandardMaterial;

  private constructor(private readonly scene: Scene) {}

  static async load(scene: Scene, fog: FogOfWar): Promise<AssetLibrary> {
    const library = new AssetLibrary(scene);
    await library.loadEnvironment(fog);
    return library;
  }

  /** Throws for a name the asset pipeline did not export, so a typo fails at load, not as an invisible model. */
  template(name: string): Mesh {
    const mesh = this.templates.get(name);
    if (!mesh) throw new Error(`Missing model ${name}`);
    return mesh;
  }

  private async loadEnvironment(fog: FogOfWar): Promise<void> {
    // StandardMaterial lights in gamma space, so the palette must stay raw sRGB rather than decode to linear.
    const container = await LoadAssetContainerAsync("/assets/env.glb", this.scene, { pluginOptions: { gltf: { useSRGBBuffers: false } } });
    const holders = container.transformNodes.filter((node) => node.parent?.name === "__root__");
    const palette = (holders[0]?.getChildMeshes(false)[0]?.material as PBRMaterial | null)?.albedoTexture ?? null;
    if (palette) {
      // Keep the palette alive past container.dispose(); the scene owns it from here on.
      const index = container.textures.indexOf(palette);
      if (index >= 0) container.textures.splice(index, 1);
      this.scene.addTexture(palette);
    }
    this.material = new StandardMaterial("kaykit", this.scene);
    this.material.diffuseTexture = palette;
    this.material.specularColor = new Color3(0.06, 0.06, 0.06);
    weather(this.material);
    fog.apply(this.material);
    for (const holder of holders) {
      const meshes = holder.getChildMeshes(false).filter((m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0);
      for (const mesh of meshes) mesh.computeWorldMatrix(true);
      const merged = meshes.length > 0 ? Mesh.MergeMeshes(meshes, false, true) : null;
      if (!merged) continue;
      // The merge bakes the loader's mirrored root into the vertices, so the glTF winding flag no longer applies.
      merged.sideOrientation = Material.CounterClockWiseSideOrientation;
      this.register(holder.name, merged);
    }
    container.dispose();
  }

  private register(name: string, mesh: Mesh): Mesh {
    mesh.name = name;
    mesh.material = this.material;
    mesh.isVisible = false;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    this.templates.set(name, mesh);
    return mesh;
  }
}
