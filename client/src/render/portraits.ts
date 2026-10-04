import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Scene } from "@babylonjs/core/scene";
import { footprintSize, kinds } from "../content/content";
import { FINISHED, buildingData, isWallKind, wallPieceData } from "./building-recipes";
import { SURFACE_ATTRIBUTE, TEAM_ATTRIBUTE, TINT_ATTRIBUTE, buildingMaterial, loadBuildingTextures } from "./building-material";
import { nodeData } from "./node-recipes";
import { hasPortraits, publishPortraits } from "./portrait-store";
import { FRONT_YAW } from "./structures";

const SIZE = 192;
/** Banner blue in linear albedo, so the portraits read as one neutral kingdom. */
const BANNER: [number, number, number] = [0.04, 0.12, 0.5];
/** A front-left three-quarter view from above, like the battlefield camera but closer. */
const ALPHA = -Math.PI / 2 - 0.55;
const BETA = 0.95;

/**
 * Draws every building kind (and the mines) once in a throwaway offscreen engine, so the HUD can show the real
 * building instead of a symbol. Runs after the battlefield has loaded and never touches its scene.
 */
export async function renderPortraits(): Promise<void> {
  if (hasPortraits()) return;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, alpha: true, premultipliedAlpha: false, stencil: false }, false);
  try {
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0, 0, 0, 0);
    const sky = new HemisphericLight("sky", new Vector3(0.2, 1, -0.3), scene);
    sky.intensity = 0.9;
    sky.groundColor = new Color3(0.42, 0.38, 0.34);
    const sun = new DirectionalLight("sun", new Vector3(0.6, -1, 0.5).normalize(), scene);
    sun.intensity = 1.3;
    sun.diffuse = new Color3(1, 0.94, 0.82);
    const camera = new ArcRotateCamera("portrait", ALPHA, BETA, 10, Vector3.Zero(), scene);
    camera.fov = 0.5;
    const material = buildingMaterial(scene, await loadBuildingTextures(scene), null);
    const subjects = kinds.flatMap((info) => {
      const id = info.def.id;
      if (info.category === "building") return [{ id, data: isWallKind(id) ? wallPieceData(id, "post", 1, FINISHED) : buildingData(id, footprintSize(info), 1, 0, FINISHED) }];
      if (info.category === "node" && id !== "berries") return [{ id, data: nodeData(id, 0) }];
      return [];
    });
    const stills = new Map<string, string>();
    for (const { id, data } of subjects) {
      const mesh = toMesh(scene, data);
      mesh.material = material;
      mesh.rotation.y = FRONT_YAW;
      mesh.computeWorldMatrix(true);
      const { center, radiusWorld } = mesh.getBoundingInfo().boundingSphere;
      camera.target.copyFrom(center);
      camera.radius = (radiusWorld / Math.sin(camera.fov / 2)) * 0.92;
      await scene.whenReadyAsync();
      scene.render();
      stills.set(id, canvas.toDataURL("image/png"));
      mesh.dispose();
    }
    publishPortraits(stills);
  } finally {
    engine.dispose();
  }
}

function toMesh(scene: Scene, data: ReturnType<typeof buildingData>): Mesh {
  const mesh = new Mesh("portrait", scene);
  const vertexData = new VertexData();
  vertexData.positions = data.positions;
  vertexData.normals = data.normals;
  vertexData.indices = data.indices;
  vertexData.applyToMesh(mesh);
  mesh.setVerticesData(SURFACE_ATTRIBUTE, data.surface, false, 4);
  mesh.setVerticesData(TINT_ATTRIBUTE, data.tint, false, 3);
  // A plain vertex buffer stands in for the battlefield's per-instance team colour.
  const team = new Float32Array((data.positions.length / 3) * 4);
  for (let i = 0; i < team.length; i += 4) team.set([...BANNER, 0.3], i);
  mesh.setVerticesData(TEAM_ATTRIBUTE, team, false, 4);
  return mesh;
}
