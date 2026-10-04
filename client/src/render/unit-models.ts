import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import "@babylonjs/core/Animations/animatable";
import { BakedVertexAnimationManager } from "@babylonjs/core/BakedVertexAnimation/bakedVertexAnimationManager";
import { VertexAnimationBaker } from "@babylonjs/core/BakedVertexAnimation/vertexAnimationBaker";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { Material } from "@babylonjs/core/Materials/material";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF/2.0/glTFLoader";
import "@babylonjs/loaders/glTF/2.0/Extensions/EXT_texture_webp";
import "@babylonjs/loaders/glTF/2.0/Extensions/KHR_mesh_quantization";
import type { UnitDef } from "../content/content";
import type { FogOfWar } from "./fog";
import { VAT_BLEND, VAT_BLEND_DEFINE } from "./vat-blend";
import type { Clip } from "./vat-clock";

/** Rows per second in the baked animation texture; the shader blends between neighbouring rows. */
export const BAKE_FPS = 30;
/** Per-instance owner colour (rgb, display space) and a 0..1 look seed (w) that shades skin, hair and cloth. */
export const TEAM_COLOR = "teamColor";
/** The sky's share in unit lighting, over the scene's: armour needs more of it to read as metal from above. */
const SKY_REFLECTION = 1.4;
/** Share of the owner colour's saturation the cloth dye keeps. */
const DYE_SATURATION = 0.8;
/** Brightens metal albedo toward real steel reflectance (about 0.56 linear). */
const METAL_REFLECTANCE = 1.8;
/** Bind-pose floor and inverse height, so shading can tell the feet from the head on any model. */
const BIND_FRAME = "unitBindFrame";

export type { Clip } from "./vat-clock";

/** The character a unit kind draws: its own, or another's it borrows until its own is built. */
export function modelId(def: UnitDef): string {
  return def.model ?? def.id;
}

/** One `make` per character model, indexed by kind: kinds sharing a model share its entry. */
export function byModel<T>(units: readonly { kind: number; def: UnitDef }[], make: (model: string, def: UnitDef) => T): { byKind: T[]; models: T[] } {
  const made = new Map<string, T>();
  const byKind: T[] = [];
  for (const { kind, def } of units) {
    const id = modelId(def);
    let entry = made.get(id);
    if (entry === undefined) {
      entry = make(id, def);
      made.set(id, entry);
    }
    byKind[kind] = entry;
  }
  return { byKind, models: [...made.values()] };
}

/** One animated character kind: a hidden skinned mesh whose clips are baked into a vertex animation texture. */
export interface UnitModel {
  mesh: Mesh;
  manager: BakedVertexAnimationManager;
  clips: Map<string, Clip>;
  /** The mesh's world matrix (the loader's mirrored root) and its inverse, to conjugate instance matrices. */
  world: Matrix;
  inverse: Matrix;
  /** Bind-pose height in model units. */
  height: number;
}

export async function loadUnitModel(scene: Scene, id: string, fog: FogOfWar): Promise<UnitModel> {
  const container = await LoadAssetContainerAsync(`/assets/units/${id}.glb`, scene);
  container.addAllToScene();
  const mesh = container.meshes.find((m): m is Mesh => m instanceof Mesh && m.skeleton !== null && m.getTotalVertices() > 0);
  if (!mesh) throw new Error(`Unit model ${id} has no skinned mesh`);
  const material = mesh.material;
  if (!(material instanceof PBRMaterial)) throw new Error(`Unit model ${id} has no PBR material`);
  // The occlusion shares the surface map with roughness and metal (red, green, blue): read it there, one sample not two.
  const occlusion = material.ambientTexture;
  material.ambientTexture = null;
  if (occlusion && occlusion !== material.metallicTexture) occlusion.dispose();
  material.useAmbientOcclusionFromMetallicTextureRed = true;
  // Armour edges and buckles sparkle from pixel to pixel at battlefield zoom without it.
  material.enableSpecularAntiAliasing = true;
  material.environmentIntensity = SKY_REFLECTION;
  const bounds = mesh.getBoundingInfo().boundingBox;
  new UnitSurfacePlugin(material, bounds.minimum.y, bounds.extendSize.y * 2);
  fog.apply(material);
  mesh.receiveShadows = true;

  const { data, clips } = bake(mesh, container.animationGroups);
  for (const group of container.animationGroups) group.dispose();
  const manager = new BakedVertexAnimationManager(scene);
  manager.texture = new VertexAnimationBaker(scene, mesh).textureFromBakedVertexData(data);
  mesh.bakedVertexAnimationManager = manager;

  const world = mesh.computeWorldMatrix(true).clone();
  return { mesh, manager, clips, world, inverse: Matrix.Invert(world), height: bounds.extendSize.y * 2 };
}

/**
 * Samples every clip into rows of bone matrices. glTF clips animate the bone-linked transform nodes,
 * which Babylon's own baker does not drive, so each frame is posed through its animation group.
 */
function bake(mesh: Mesh, groups: AnimationGroup[]): { data: Float32Array; clips: Map<string, Clip> } {
  const skeleton = mesh.skeleton!;
  const rows: Float32Array[] = [];
  const clips = new Map<string, Clip>();
  for (const group of groups) group.stop();
  for (const group of groups) {
    const fps = group.targetedAnimations[0]?.animation.framePerSecond ?? 60;
    const seconds = (group.to - group.from) / fps;
    // At least two rows, so a pose clip still has a row to blend toward.
    const count = Math.max(2, Math.round(seconds * BAKE_FPS));
    group.start(false, 1, group.from, group.to);
    group.pause();
    for (let i = 0; i < count; i++) {
      // Excludes the end frame: a loop blends from its last row back into its first, which is that frame.
      group.goToFrame(group.from + ((group.to - group.from) * i) / count);
      skeleton.prepare(true);
      rows.push(skeleton.getTransformMatrices(mesh).slice());
    }
    group.stop();
    clips.set(group.name, { start: rows.length - count, end: rows.length - 1, seconds: Math.max(seconds, 1 / BAKE_FPS) });
  }
  skeleton.returnToRest();
  const stride = rows[0]!.length;
  const data = new Float32Array(stride * rows.length);
  rows.forEach((row, i) => data.set(row, i * stride));
  return { data, clips };
}


/**
 * Reads the atlases' team mask (albedo alpha 128) and tone class (surface alpha: 255 skin, 192 dyed hide, 0 hair, 128
 * the rest) to dye cloth, shade each unit from its look seed, and lay grime and boot mud fixed to the bind pose.
 */
class UnitSurfacePlugin extends MaterialPluginBase {
  constructor(
    material: Material,
    private readonly floor: number,
    private readonly height: number,
  ) {
    super(material, "UnitSurface", 150, { UNIT_SURFACE: false, [VAT_BLEND_DEFINE]: false });
    this._enable(true);
  }

  override getClassName(): string {
    return "UnitSurfacePlugin";
  }

  override isCompatible(shaderLanguage: number): boolean {
    return shaderLanguage === 0;
  }

  override prepareDefines(defines: MaterialDefines): void {
    defines["UNIT_SURFACE"] = true;
    defines[VAT_BLEND_DEFINE] = true;
  }

  override getAttributes(attributes: string[]): void {
    attributes.push(TEAM_COLOR, VAT_BLEND);
  }

  override getUniforms(): { ubo: { name: string; size: number; type: string }[]; vertex: string } {
    return { ubo: [{ name: BIND_FRAME, size: 2, type: "vec2" }], vertex: `#ifdef UNIT_SURFACE\nuniform vec2 ${BIND_FRAME};\n#endif\n` };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    uniformBuffer.updateFloat2(BIND_FRAME, this.floor, 1 / this.height);
  }

  override getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType === "vertex") {
      return {
        CUSTOM_VERTEX_DEFINITIONS: `
#ifdef UNIT_SURFACE
attribute vec4 ${TEAM_COLOR};
varying vec4 vUnitTeam;
varying vec3 vUnitBind;
#endif
#ifdef ${VAT_BLEND_DEFINE}
attribute vec4 ${VAT_BLEND};
#endif
`,
        CUSTOM_VERTEX_MAIN_END: `
#ifdef UNIT_SURFACE
  vUnitTeam = ${TEAM_COLOR};
  vUnitBind = vec3(position.x, position.y - ${BIND_FRAME}.x, position.z) * ${BIND_FRAME}.y;
#endif
`,
      };
    }
    if (shaderType !== "fragment") return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
#ifdef UNIT_SURFACE
varying vec4 vUnitTeam;
varying vec3 vUnitBind;
float unitRoughShift;
// Hash without sine (Dave Hoskins): a few multiply-adds, cheaper than sin() on every unit pixel.
float unitHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float unitNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(unitHash(i), unitHash(i + vec3(1.0, 0.0, 0.0)), u.x), mix(unitHash(i + vec3(0.0, 1.0, 0.0)), unitHash(i + vec3(1.0, 1.0, 0.0)), u.x), u.y),
    mix(mix(unitHash(i + vec3(0.0, 0.0, 1.0)), unitHash(i + vec3(1.0, 0.0, 1.0)), u.x), mix(unitHash(i + vec3(0.0, 1.0, 1.0)), unitHash(i + vec3(1.0, 1.0, 1.0)), u.x), u.y),
    u.z);
}
#endif
`,
      // After the albedo block and before the reflectivity block reads surfaceAlbedo as the metals' tint.
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
#ifdef UNIT_SURFACE
  {
    float tone = 0.5;
    float metal = 0.0;
#ifdef REFLECTIVITY
    vec4 unitSurface = texture2D(reflectivitySampler, vReflectivityUV + uvOffset);
    tone = unitSurface.a;
    metal = unitSurface.b;
#endif
    float team = 0.0;
#ifdef ALBEDO
    team = clamp((1.0 - albedoTexture.a) * 2.0, 0.0, 1.0);
#endif
    // The low-poly palettes paint steel mid-grey for flat shading; as metal reflectance that reads as blackened iron.
    surfaceAlbedo = mix(surfaceAlbedo, min(surfaceAlbedo * ${METAL_REFLECTANCE.toFixed(2)}, vec3(0.9)), metal);
    // Tone classes (bands, since filtering blends values at class borders): 1 human skin, 0.75 dyed hide, 0 hair, 0.5 anything else.
    float skin = smoothstep(0.86, 0.96, tone);
    float hide = smoothstep(0.62, 0.7, tone) * (1.0 - skin);
    float hair = 1.0 - smoothstep(0.1, 0.3, tone);
    float bare = skin + hide;
    float seed = vUnitTeam.w;
    // Team cloth is grey in the atlas, so the owner colour dyes it by brightness; each unit's dye lot differs a little.
    vec3 dye = toLinearSpace(vUnitTeam.rgb * 1.45) * (0.94 + 0.12 * fract(seed * 5.31));
    // Plant dyes never reach a UI colour's purity: keep most of the hue, not all of it.
    dye = mix(vec3(dot(dye, vec3(0.2126, 0.7152, 0.0722))), dye, ${DYE_SATURATION.toFixed(2)});
    surfaceAlbedo = mix(surfaceAlbedo, surfaceAlbedo * dye, team);
    // Complexion from fair to weathered, hides lighter or darker only, hair from ash to dark, cloth a shade apart.
    vec3 complexion = mix(vec3(1.08, 1.03, 0.98), vec3(0.76, 0.64, 0.54), fract(seed * 3.17));
    float hideShade = 0.86 + 0.22 * fract(seed * 3.17);
    float hairShade = mix(0.6, 1.35, fract(seed * 7.31));
    float lot = 0.9 + 0.2 * fract(seed * 13.7);
    surfaceAlbedo *= complexion * skin + vec3(hideShade * hide + hairShade * hair + lot * max(0.0, 1.0 - bare - hair));
    // Grime and fabric grain stay on the bind pose; bare skin stays clean. Grain finer than a pixel fades out.
    vec3 p = vUnitBind;
    float grain = mix(unitNoise(p * 90.0), 0.5, smoothstep(0.5, 1.0, length(fwidth(p * 90.0))));
    float blotch = unitNoise(p * 7.0 + seed * 31.0);
    float dirt = 0.65 * blotch + 0.35 * grain;
    surfaceAlbedo *= mix(0.82 + 0.3 * dirt, 1.0, bare);
    // Dust and mud up the boots and hems, heaviest at the feet.
    float mud = (1.0 - smoothstep(0.0, 0.2, p.y)) * smoothstep(0.35, 0.7, dirt) * (1.0 - bare);
    surfaceAlbedo = mix(surfaceAlbedo, vec3(0.07, 0.055, 0.04), mud * 0.6);
    unitRoughShift = (grain - 0.5) * 0.16 + (blotch - 0.5) * 0.12 * metal + mud * 0.3;
    surfaceAlbedo = min(surfaceAlbedo, vec3(1.0));
  }
#endif
`,
      CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS: `
#ifdef UNIT_SURFACE
  metallicRoughness.g = clamp(metallicRoughness.g + unitRoughShift, 0.08, 1.0);
#endif
`,
    };
  }
}
