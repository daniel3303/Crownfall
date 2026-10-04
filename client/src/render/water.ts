import { Constants } from "@babylonjs/core/Engines/constants";
import type { Material } from "@babylonjs/core/Materials/material";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { Scene } from "@babylonjs/core/scene";
import { LAKE_DEPTH, WATER_LEVEL } from "./terrain-field";

/** Tiles from the shore at which water reaches its deep colour. */
const DEEP_TILES = 4;

/** Water depth per terrain vertex, sampled by the lake surface. */
export interface WaterField {
  texture: RawTexture;
  /** Maps a world (x, -z) to the texture's UV: uv = p * scale.xy + scale.zw. */
  scale: [number, number, number, number];
}

/**
 * Per terrain vertex: red is the distance from the shore (0 on land, 1 at DEEP_TILES tiles) for the deep colour, green
 * how far the bed lies below the surface (0 at the waterline, 1 at full depth) for foam and transparency.
 */
export function waterField(scene: Scene, width: number, height: number, isWater: (x: number, y: number) => boolean, heights: Float32Array, res: number): WaterField {
  const distance = shoreDistance(width, height, isWater);
  const w = width * res + 1;
  const h = height * res + 1;
  const data = new Uint8Array(w * h * 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tiles = bilinear(distance, width, height, x / res - 0.5, y / res - 0.5);
      const depth = (WATER_LEVEL - heights[y * w + x]!) / (WATER_LEVEL - LAKE_DEPTH);
      data[(y * w + x) * 2] = Math.round(Math.min(1, tiles / DEEP_TILES) * 255);
      data[(y * w + x) * 2 + 1] = Math.round(Math.min(1, Math.max(0, depth)) * 255);
    }
  }
  const texture = new RawTexture(data, w, h, Constants.TEXTUREFORMAT_RG, scene, false, false, Texture.BILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE);
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  return { texture, scale: [res / w, res / h, 0.5 / w, 0.5 / h] };
}

/** Breadth-first steps from every water tile to the nearest land tile; land is 0. */
function shoreDistance(width: number, height: number, isWater: (x: number, y: number) => boolean): Float32Array {
  const distance = new Float32Array(width * height).fill(Infinity);
  const queue: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isWater(x, y)) {
        distance[y * width + x] = 0;
        queue.push(y * width + x);
      }
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const x = i % width;
    const y = (i - x) / width;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (distance[n]! > distance[i]! + 1) {
        distance[n] = distance[i]! + 1;
        queue.push(n);
      }
    }
  }
  // An all-water map has no shore; treat it as deep everywhere.
  for (let i = 0; i < distance.length; i++) if (distance[i] === Infinity) distance[i] = DEEP_TILES;
  return distance;
}

/** Samples a per-tile grid at a point in tile-centre coordinates, clamping at the edges. */
function bilinear(grid: Float32Array, width: number, height: number, x: number, y: number): number {
  const cx = Math.min(width - 1, Math.max(0, x));
  const cy = Math.min(height - 1, Math.max(0, y));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = cx - x0;
  const fy = cy - y0;
  const top = grid[y0 * width + x0]! * (1 - fx) + grid[y0 * width + x1]! * fx;
  const bottom = grid[y1 * width + x0]! * (1 - fx) + grid[y1 * width + x1]! * fx;
  return top * (1 - fy) + bottom * fy;
}

/**
 * Lake surface on a StandardMaterial: layered moving ripples bent into the normal, shallow-to-deep colour,
 * sky reflection that grows at grazing angles, and a thin band of animated foam at the waterline. No textures beyond the depth field.
 */
export class WaterSurface extends MaterialPluginBase {
  time = 0;

  constructor(
    material: Material,
    private readonly field: WaterField,
  ) {
    super(material, "WaterSurface", 150, { WATER_SURFACE: false });
    this._enable(true);
  }

  override getClassName(): string {
    return "WaterSurface";
  }

  override isCompatible(shaderLanguage: number): boolean {
    return shaderLanguage === 0;
  }

  override prepareDefines(defines: MaterialDefines): void {
    defines["WATER_SURFACE"] = true;
  }

  override getSamplers(samplers: string[]): void {
    samplers.push("waterShoreSampler");
  }

  override getUniforms() {
    return {
      ubo: [
        { name: "waterTime", size: 1, type: "float" },
        { name: "waterFieldScale", size: 4, type: "vec4" },
      ],
      fragment: "#ifdef WATER_SURFACE\nuniform float waterTime;\nuniform vec4 waterFieldScale;\n#endif\n",
    };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    uniformBuffer.updateFloat("waterTime", this.time);
    const [a, b, c, d] = this.field.scale;
    uniformBuffer.updateFloat4("waterFieldScale", a, b, c, d);
    uniformBuffer.setTexture("waterShoreSampler", this.field.texture);
  }

  override getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType !== "fragment") return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
#ifdef WATER_SURFACE
uniform sampler2D waterShoreSampler;
float waterHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float waterNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(waterHash(i), waterHash(i + vec2(1.0, 0.0)), u.x), mix(waterHash(i + vec2(0.0, 1.0)), waterHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// Three wave layers drifting in different directions, so the pattern never visibly repeats.
float waterHeight(vec2 p, float t) {
  return waterNoise(p * 1.1 + vec2(t * 0.30, t * 0.17)) * 0.55
       + waterNoise(p * 2.6 - vec2(t * 0.22, -t * 0.36)) * 0.30
       + waterNoise(p * 6.3 + vec2(-t * 0.55, t * 0.48)) * 0.15;
}
// x: distance from the shore, y: depth of the bed under the surface.
vec2 waterField() {
  return texture2D(waterShoreSampler, vec2(vPositionW.x, -vPositionW.z) * waterFieldScale.xy + waterFieldScale.zw).rg;
}
#endif
`,
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
#ifdef WATER_SURFACE
        vec2 waterAt = waterField();
        baseColor.rgb = mix(vec3(0.16, 0.45, 0.44), vec3(0.03, 0.15, 0.24), smoothstep(0.0, 1.0, max(waterAt.x, waterAt.y * 0.6)));
#endif
`,
      CUSTOM_FRAGMENT_UPDATE_ALPHA: `
#ifdef WATER_SURFACE
        alpha = mix(0.35, 0.94, smoothstep(0.0, 0.8, waterField().y));
#endif
`,
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
#ifdef WATER_SURFACE
        vec2 waterP = vPositionW.xz;
        float waterE = 0.06;
        float waterDx = waterHeight(waterP + vec2(waterE, 0.0), waterTime) - waterHeight(waterP - vec2(waterE, 0.0), waterTime);
        float waterDz = waterHeight(waterP + vec2(0.0, waterE), waterTime) - waterHeight(waterP - vec2(0.0, waterE), waterTime);
        normalW = normalize(normalW - vec3(waterDx, 0.0, waterDz) * 2.2);
#endif
`,
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
#ifdef WATER_SURFACE
        vec3 waterView = normalize(vEyePosition.xyz - vPositionW);
        float waterFresnel = pow(1.0 - max(dot(normalW, waterView), 0.0), 4.0);
        color.rgb = mix(color.rgb, vec3(0.62, 0.74, 0.86), clamp(waterFresnel * 0.85 + 0.06, 0.0, 0.75));
        // Lapping foam hugs the waterline: a thin band that swells and breaks up with noise.
        float waterBed = waterField().y;
        float waterFoamNoise = waterNoise(vPositionW.xz * 4.5 + vec2(waterTime * 0.4, -waterTime * 0.3));
        float waterSurge = 0.5 + 0.5 * sin(waterTime * 1.3 + waterFoamNoise * 5.0);
        float waterNear = 1.0 - smoothstep(0.0, 0.05 + 0.07 * waterSurge, waterBed);
        float waterFoam = waterNear * smoothstep(0.35, 0.75, waterFoamNoise);
        color.rgb = mix(color.rgb, vec3(0.86, 0.9, 0.9), waterFoam * 0.55);
        color.a = max(color.a, waterFoam * 0.6);
#endif
`,
    };
  }
}
