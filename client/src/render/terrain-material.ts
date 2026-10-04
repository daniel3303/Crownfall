import { Constants } from "@babylonjs/core/Engines/constants";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { RawTexture2DArray } from "@babylonjs/core/Materials/Textures/rawTexture2DArray";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { Scene } from "@babylonjs/core/scene";
import { LAYERS, SPLAT_RES } from "./terrain-field";

/** Texture repeat size in tiles per layer, in LAYERS order: big enough to hide the repeat, small enough to keep detail. */
const LAYER_SCALE = [5, 6, 4, 4, 4.5, 5];
const ANISOTROPY = 8;

export interface TerrainTextures {
  /** sRGB albedo per layer. */
  albedo: RawTexture2DArray;
  /** OpenGL-convention tangent-space normal XY in RG, roughness in B. */
  surface: RawTexture2DArray;
}

/** Decodes every layer image into one 2D array texture with mipmaps, so the shader binds one sampler for all layers. */
export async function loadArray(scene: Scene, urls: string[]): Promise<RawTexture2DArray> {
  const bitmaps = await Promise.all(
    urls.map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Missing texture ${url}`);
      // Raw bytes: the albedo is decoded to linear in the shader, and normals must not be colour-managed.
      return createImageBitmap(await response.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
    }),
  );
  const size = bitmaps[0]!.width;
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  const data = new Uint8Array(size * size * 4 * urls.length);
  bitmaps.forEach((bitmap, i) => {
    context.drawImage(bitmap, 0, 0, size, size);
    data.set(context.getImageData(0, 0, size, size).data, i * size * size * 4);
    bitmap.close();
  });
  const texture = new RawTexture2DArray(data, size, size, urls.length, Constants.TEXTUREFORMAT_RGBA, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = ANISOTROPY;
  return texture;
}

export async function loadTerrainTextures(scene: Scene): Promise<TerrainTextures> {
  const [albedo, surface] = await Promise.all([
    loadArray(scene, LAYERS.map((layer) => `/assets/terrain/${layer}_albedo.webp`)),
    loadArray(scene, LAYERS.map((layer) => `/assets/terrain/${layer}_surface.webp`)),
  ]);
  return { albedo, surface };
}

export function splatTexture(scene: Scene, data: Uint8Array, width: number, height: number): RawTexture {
  const texture = RawTexture.CreateRGBATexture(data, width * SPLAT_RES, height * SPLAT_RES, scene, false, false, Texture.BILINEAR_SAMPLINGMODE);
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  return texture;
}

/**
 * Blends six PBR ground layers per pixel from two splat textures, sampling each layer twice at different
 * rotations and scales mixed by noise so the repeat never shows. Feeds albedo, normal and roughness to the PBR shader.
 */
export class TerrainSplat extends MaterialPluginBase {
  constructor(
    material: PBRMaterial,
    private readonly textures: TerrainTextures,
    private readonly splats: [RawTexture, RawTexture],
    private readonly mapWidth: number,
    private readonly mapHeight: number,
  ) {
    super(material, "TerrainSplat", 100, { TERRAIN_SPLAT: false });
    this._enable(true);
  }

  override getClassName(): string {
    return "TerrainSplat";
  }

  override isCompatible(shaderLanguage: number): boolean {
    return shaderLanguage === 0;
  }

  override prepareDefines(defines: MaterialDefines): void {
    defines["TERRAIN_SPLAT"] = true;
  }

  override getSamplers(samplers: string[]): void {
    samplers.push("terrainAlbedo", "terrainSurface", "terrainSplatA", "terrainSplatB");
  }

  override getUniforms() {
    return {
      ubo: [
        { name: "terrainMapSize", size: 2, type: "vec2" },
        { name: "terrainScaleA", size: 4, type: "vec4" },
        { name: "terrainScaleB", size: 2, type: "vec2" },
      ],
      fragment: "#ifdef TERRAIN_SPLAT\nuniform vec2 terrainMapSize;\nuniform vec4 terrainScaleA;\nuniform vec2 terrainScaleB;\n#endif\n",
    };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    const [a, b, c, d, e, f] = LAYER_SCALE;
    uniformBuffer.updateFloat2("terrainMapSize", this.mapWidth, this.mapHeight);
    uniformBuffer.updateFloat4("terrainScaleA", 1 / a!, 1 / b!, 1 / c!, 1 / d!);
    uniformBuffer.updateFloat2("terrainScaleB", 1 / e!, 1 / f!);
    uniformBuffer.setTexture("terrainAlbedo", this.textures.albedo);
    uniformBuffer.setTexture("terrainSurface", this.textures.surface);
    uniformBuffer.setTexture("terrainSplatA", this.splats[0]);
    uniformBuffer.setTexture("terrainSplatB", this.splats[1]);
  }

  override getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType !== "fragment") return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
#ifdef TERRAIN_SPLAT
uniform highp sampler2DArray terrainAlbedo;
uniform highp sampler2DArray terrainSurface;
uniform sampler2D terrainSplatA;
uniform sampler2D terrainSplatB;
vec3 terrainAlbedoOut;
vec3 terrainNormalOut;
float terrainRoughOut;
float terrainHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float terrainNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(terrainHash(i), terrainHash(i + vec2(1.0, 0.0)), u.x), mix(terrainHash(i + vec2(0.0, 1.0)), terrainHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// OpenGL normal maps point green toward the image top, which is -v here because the images upload top row first.
vec2 terrainNormalXY(vec3 surface) {
  vec2 n = surface.rg * 2.0 - 1.0;
  return vec2(n.x, -n.y);
}
// Adds one layer: two samples, the second rotated and rescaled, blended by large-scale noise to hide tiling.
void terrainLayer(float layer, float weight, float scale, vec2 p, float blend) {
  if (weight < 0.004) return;
  vec2 uvA = p * scale;
  vec2 uvB = mat2(0.8, -0.6, 0.6, 0.8) * (p * scale * 0.71) + vec2(0.37, 0.61);
  vec3 albedo = mix(texture2D(terrainAlbedo, vec3(uvA, layer)).rgb, texture2D(terrainAlbedo, vec3(uvB, layer)).rgb, blend);
  vec3 surfA = texture2D(terrainSurface, vec3(uvA, layer)).rgb;
  vec3 surfB = texture2D(terrainSurface, vec3(uvB, layer)).rgb;
  vec2 nA = terrainNormalXY(surfA);
  // The rotated sample's normal turns with its UVs, so rotate it back.
  vec2 nB = mat2(0.8, 0.6, -0.6, 0.8) * terrainNormalXY(surfB);
  terrainAlbedoOut += toLinearSpace(albedo) * weight;
  terrainNormalOut.xy += mix(nA, nB, blend) * weight;
  terrainRoughOut += mix(surfA.b, surfB.b, blend) * weight;
}
#endif
`,
      CUSTOM_FRAGMENT_MAIN_BEGIN: `
#ifdef TERRAIN_SPLAT
  {
    vec2 terrainP = vec2(vPositionW.x, -vPositionW.z);
    vec2 terrainUv = terrainP / terrainMapSize;
    vec4 splatA = texture2D(terrainSplatA, terrainUv);
    vec4 splatB = texture2D(terrainSplatB, terrainUv);
    float blend = smoothstep(0.3, 0.7, terrainNoise(terrainP * 0.09));
    terrainAlbedoOut = vec3(0.0);
    terrainNormalOut = vec3(0.0);
    terrainRoughOut = 0.0;
    terrainLayer(0.0, splatA.r, terrainScaleA.x, terrainP, blend);
    terrainLayer(1.0, splatA.g, terrainScaleA.y, terrainP, blend);
    terrainLayer(2.0, splatA.b, terrainScaleA.z, terrainP, blend);
    terrainLayer(3.0, splatA.a, terrainScaleA.w, terrainP, blend);
    terrainLayer(4.0, splatB.r, terrainScaleB.x, terrainP, blend);
    terrainLayer(5.0, splatB.g, terrainScaleB.y, terrainP, blend);
    terrainNormalOut.z = sqrt(max(0.0, 1.0 - dot(terrainNormalOut.xy, terrainNormalOut.xy)));
  }
#endif
`,
      CUSTOM_FRAGMENT_UPDATE_ALBEDO: `
#ifdef TERRAIN_SPLAT
  surfaceAlbedo = terrainAlbedoOut;
#endif
`,
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
#ifdef TERRAIN_SPLAT
  {
    // Map u runs along +X and map v along -Z; this frame follows the ground's slope from there.
    vec3 terrainT = normalize(vec3(1.0, 0.0, 0.0) - normalW * normalW.x);
    vec3 terrainB = cross(normalW, terrainT);
    normalW = normalize(terrainT * terrainNormalOut.x + terrainB * terrainNormalOut.y + normalW * terrainNormalOut.z);
  }
#endif
`,
      CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS: `
#ifdef TERRAIN_SPLAT
  metallicRoughness = vec2(0.0, clamp(terrainRoughOut, 0.35, 1.0));
#endif
`,
    };
  }
}

/** The sky probe's share on the ground: its bright horizon washes the grass pale, so the sun and sky light carry it. */
const TERRAIN_ENVIRONMENT = 0;

export function terrainMaterial(scene: Scene): PBRMaterial {
  const material = new PBRMaterial("terrain", scene);
  material.metallic = 0;
  material.roughness = 1;
  material.albedoColor.set(1, 1, 1);
  material.environmentIntensity = TERRAIN_ENVIRONMENT;
  return material;
}
