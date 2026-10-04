import type { Material } from "@babylonjs/core/Materials/material";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { RawTexture2DArray } from "@babylonjs/core/Materials/Textures/rawTexture2DArray";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { Scene } from "@babylonjs/core/scene";
import { FLAT_SURFACES, LEVEL_MATERIALS, MATERIALS } from "./building-geometry";
import type { FogOfWar } from "./fog";
import { loadArray } from "./terrain-material";

/** Per-vertex texture u, v, layer and baked shade, and per-vertex tint, written by the geometry builder. */
export const SURFACE_ATTRIBUTE = "buildingSurface";
export const TINT_ATTRIBUTE = "buildingTint";
/** Per-instance team colour (rgb), painted onto cloth and team-painted faces, and a 0..1 weathering seed (w) so no two buildings match. */
export const TEAM_ATTRIBUTE = "buildingTeam";

const FIRST_FLAT = MATERIALS.length;
const CLOTH = FIRST_FLAT + FLAT_SURFACES.indexOf("cloth");
const IRON = FIRST_FLAT + FLAT_SURFACES.indexOf("iron");
const DARK = FIRST_FLAT + FLAT_SURFACES.indexOf("dark");
const PLASTER = MATERIALS.indexOf("plaster");
const ROOFS = (["thatch", "tiles", "slate", "slates"] as const).map((name) => MATERIALS.indexOf(name));

export interface BuildingTextures {
  albedo: RawTexture2DArray;
  surface: RawTexture2DArray;
}

/** materials.mjs builds the common surfaces; buildings.mjs the dressed stone and slates. */
function textureUrl(name: (typeof MATERIALS)[number], map: "albedo" | "surface"): string {
  const folder = (LEVEL_MATERIALS as readonly string[]).includes(name) ? "buildings" : "materials";
  return `/assets/${folder}/${name}_${map}.webp`;
}

export async function loadBuildingTextures(scene: Scene): Promise<BuildingTextures> {
  const [albedo, surface] = await Promise.all([
    loadArray(scene, MATERIALS.map((name) => textureUrl(name, "albedo"))),
    loadArray(scene, MATERIALS.map((name) => textureUrl(name, "surface"))),
  ]);
  return { albedo, surface };
}

/** One PBR material for every procedural building: each vertex names its scanned surface, so a building is one draw. */
export function buildingMaterial(scene: Scene, textures: BuildingTextures, fog: FogOfWar | null): PBRMaterial {
  const material = new PBRMaterial("buildings", scene);
  material.metallic = 0;
  material.roughness = 1;
  material.albedoColor.set(1, 1, 1);
  new BuildingSurfaces(material, textures);
  fog?.apply(material);
  return material;
}

/** Samples the scanned albedo, normal and roughness by the vertex's layer, with ground-contact darkening and grime. */
class BuildingSurfaces extends MaterialPluginBase {
  constructor(
    material: Material,
    private readonly textures: BuildingTextures,
  ) {
    super(material, "BuildingSurfaces", 100, { BUILDING_SURFACES: false });
    this._enable(true);
  }

  override getClassName(): string {
    return "BuildingSurfaces";
  }

  override isCompatible(shaderLanguage: number): boolean {
    return shaderLanguage === 0;
  }

  override prepareDefines(defines: MaterialDefines): void {
    defines["BUILDING_SURFACES"] = true;
  }

  override getAttributes(attributes: string[]): void {
    attributes.push(SURFACE_ATTRIBUTE, TINT_ATTRIBUTE, TEAM_ATTRIBUTE);
  }

  override getSamplers(samplers: string[]): void {
    samplers.push("buildingAlbedo", "buildingRelief");
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    uniformBuffer.setTexture("buildingAlbedo", this.textures.albedo);
    uniformBuffer.setTexture("buildingRelief", this.textures.surface);
  }

  override getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType === "vertex") {
      return {
        CUSTOM_VERTEX_DEFINITIONS: `
#ifdef BUILDING_SURFACES
attribute vec4 ${SURFACE_ATTRIBUTE};
attribute vec3 ${TINT_ATTRIBUTE};
attribute vec4 ${TEAM_ATTRIBUTE};
varying vec4 vBuildingSurface;
varying vec3 vBuildingTint;
varying float vBuildingSeed;
varying float vBuildingPainted;
#endif
`,
        CUSTOM_VERTEX_MAIN_END: `
#ifdef BUILDING_SURFACES
  // A negative shade marks a team-painted face; cloth always takes the team colour, everything else keeps its own tint.
  vBuildingSurface = vec4(${SURFACE_ATTRIBUTE}.xyz, abs(${SURFACE_ATTRIBUTE}.w));
  bool teamPainted = abs(${SURFACE_ATTRIBUTE}.z - ${CLOTH.toFixed(1)}) < 0.5 || ${SURFACE_ATTRIBUTE}.w < 0.0;
  vBuildingTint = teamPainted ? ${TINT_ATTRIBUTE} * ${TEAM_ATTRIBUTE}.rgb : ${TINT_ATTRIBUTE};
  vBuildingPainted = teamPainted ? 1.0 : 0.0;
  vBuildingSeed = ${TEAM_ATTRIBUTE}.w;
#endif
`,
      };
    }
    if (shaderType !== "fragment") return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
#ifdef BUILDING_SURFACES
uniform highp sampler2DArray buildingAlbedo;
uniform highp sampler2DArray buildingRelief;
varying vec4 vBuildingSurface;
varying vec3 vBuildingTint;
varying float vBuildingSeed;
varying float vBuildingPainted;
vec3 buildingAlbedoOut;
vec3 buildingNormalOut;
float buildingRoughOut;
float buildingMetalOut;
float buildingHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float buildingNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(buildingHash(i), buildingHash(i + vec3(1.0, 0.0, 0.0)), u.x), mix(buildingHash(i + vec3(0.0, 1.0, 0.0)), buildingHash(i + vec3(1.0, 1.0, 0.0)), u.x), u.y),
    mix(mix(buildingHash(i + vec3(0.0, 0.0, 1.0)), buildingHash(i + vec3(1.0, 0.0, 1.0)), u.x), mix(buildingHash(i + vec3(0.0, 1.0, 1.0)), buildingHash(i + vec3(1.0, 1.0, 1.0)), u.x), u.y),
    u.z);
}
#endif
`,
      CUSTOM_FRAGMENT_MAIN_BEGIN: `
#ifdef BUILDING_SURFACES
  {
    float layer = floor(vBuildingSurface.z + 0.5);
    vec2 uv = vBuildingSurface.xy;
    buildingNormalOut = vec3(0.0, 0.0, 1.0);
    buildingMetalOut = 0.0;
    if (layer < ${FIRST_FLAT.toFixed(1)}) {
      buildingAlbedoOut = toLinearSpace(texture2D(buildingAlbedo, vec3(uv, layer)).rgb);
      // Paint keeps the scan's grain but not its colour, so the team colour reads true on wood and plaster.
      if (vBuildingPainted > 0.5) buildingAlbedoOut = vec3(clamp(dot(buildingAlbedoOut, vec3(0.3, 0.59, 0.11)) * 2.4 + 0.25, 0.3, 0.95));
      vec3 relief = texture2D(buildingRelief, vec3(uv, layer)).rgb;
      // OpenGL normal maps point green toward the image top, which is -v here.
      vec2 n = relief.rg * 2.0 - 1.0;
      buildingNormalOut = vec3(n.x, -n.y, sqrt(max(0.0, 1.0 - dot(n, n))));
      buildingRoughOut = clamp(relief.b, 0.4, 1.0);
    } else {
      // Flat surfaces get a faint weave of noise so a banner is not one flat colour.
      buildingAlbedoOut = vec3(0.92 + 0.08 * buildingNoise(vPositionW * 40.0));
      // Glazing is glossy enough to catch the sun; iron is worn metal.
      buildingRoughOut = layer == ${IRON.toFixed(1)} ? 0.45 : layer == ${DARK.toFixed(1)} ? 0.25 : 0.9;
      buildingMetalOut = layer == ${IRON.toFixed(1)} ? 0.7 : 0.0;
    }
    vec3 tint = vBuildingTint;
    // Each building weathered its own way: limewash from white to ochre, roofs and timber a shade lighter or darker.
    float seed = vBuildingSeed;
    if (layer == ${PLASTER.toFixed(1)}) tint *= mix(vec3(1.06, 1.02, 0.95), vec3(0.98, 0.86, 0.68), seed);
    else tint *= 0.92 + 0.16 * fract(seed * 7.13);
    float grime = buildingNoise(vPositionW * vec3(3.0, 0.8, 3.0)) * 0.6 + buildingNoise(vPositionW * 11.0) * 0.4;
    // Rain streaks run down the walls from the eaves; they show on upright faces only.
    float streaks = buildingNoise(vec3(vPositionW.x * 9.0, vPositionW.y * 0.7 + seed * 5.0, vPositionW.z * 9.0));
    float upright = 1.0 - abs(normalize(vNormalW).y);
    float wash = 1.0 - 0.18 * upright * smoothstep(0.45, 0.85, streaks);
    // Moss and lichen gather on the roofs' upward faces in patches.
    bool roof = ${ROOFS.map((index) => `layer == ${index.toFixed(1)}`).join(" || ")};
    float moss = roof ? smoothstep(0.55, 0.85, buildingNoise(vPositionW * 2.2 + seed * 13.0)) * clamp(normalize(vNormalW).y, 0.0, 1.0) : 0.0;
    // Rain-darkened feet: buildings sit in the ground instead of on it.
    float contact = mix(0.55, 1.0, smoothstep(0.0, 0.7, vPositionW.y));
    buildingAlbedoOut *= tint * vBuildingSurface.w * contact * wash * (0.86 + 0.2 * grime);
    buildingAlbedoOut = mix(buildingAlbedoOut, vec3(0.05, 0.075, 0.025) * (0.7 + 0.6 * grime), moss * 0.55);
    buildingRoughOut = mix(buildingRoughOut, 1.0, moss);
  }
#endif
`,
      CUSTOM_FRAGMENT_UPDATE_ALBEDO: `
#ifdef BUILDING_SURFACES
  surfaceAlbedo = buildingAlbedoOut;
#endif
`,
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
#ifdef BUILDING_SURFACES
  {
    // Tangent frame from screen-space derivatives: the procedural meshes carry no tangents.
    vec3 dp1 = dFdx(vPositionW);
    vec3 dp2 = dFdy(vPositionW);
    vec2 duv1 = dFdx(vBuildingSurface.xy);
    vec2 duv2 = dFdy(vBuildingSurface.xy);
    vec3 dp2perp = cross(dp2, normalW);
    vec3 dp1perp = cross(normalW, dp1);
    vec3 tangent = dp2perp * duv1.x + dp1perp * duv2.x;
    vec3 bitangent = dp2perp * duv1.y + dp1perp * duv2.y;
    float scale = inversesqrt(max(max(dot(tangent, tangent), dot(bitangent, bitangent)), 1e-12));
    vec3 perturbed = normalize(tangent * scale * buildingNormalOut.x + bitangent * scale * buildingNormalOut.y + normalW * buildingNormalOut.z);
    normalW = dot(tangent, tangent) > 0.0 ? perturbed : normalW;
  }
#endif
`,
      CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS: `
#ifdef BUILDING_SURFACES
  metallicRoughness = vec2(buildingMetalOut, buildingRoughOut);
#endif
`,
    };
  }
}
