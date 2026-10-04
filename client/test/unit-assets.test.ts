import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import gameJson from "../../content/game.json";
import { LOOKS } from "../src/render/unit-layer";

const ASSETS = fileURLToPath(new URL("../public/assets", import.meta.url));
/** Every character model the units draw: a unit's own, or the one it borrows until its own is built. */
const UNIT_IDS = [...new Set(gameJson.units.map((unit: { id: string; model?: string }) => unit.model ?? unit.id))];
/** Every character model with a look, including one built ahead of the units that will draw it. */
const MODEL_IDS = Object.keys(LOOKS);
/** The page CSP blocks the Draco and meshopt decoders, so a model may require only these extensions. */
const ALLOWED_EXTENSIONS = ["KHR_mesh_quantization", "EXT_texture_webp"];
const MAX_TRIANGLES = 6000;
const MAX_TEXTURE = 512;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
const PORTRAIT_SIZE = 256;

interface Gltf {
  json: {
    animations?: { name?: string }[];
    extensionsRequired?: string[];
    nodes?: { name?: string }[];
    meshes: { primitives: { indices?: number }[] }[];
    accessors: { count: number }[];
    images?: { mimeType?: string; bufferView?: number }[];
    textures?: { source?: number; extensions?: { EXT_texture_webp?: { source: number } } }[];
    materials?: {
      pbrMetallicRoughness?: { baseColorTexture?: { index: number }; metallicRoughnessTexture?: { index: number } };
      normalTexture?: { index: number };
      occlusionTexture?: { index: number };
    }[];
    bufferViews: { byteOffset?: number; byteLength: number }[];
  };
  bin: Buffer;
}

/** Splits a GLB into its JSON chunk and binary chunk (12-byte header, then 8-byte chunk headers). */
function readGlb(file: string): Gltf {
  const bytes = readFileSync(file);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8")) as Gltf["json"];
  const binStart = 20 + jsonLength;
  return { json, bin: bytes.subarray(binStart + 8, binStart + 8 + bytes.readUInt32LE(binStart)) };
}

/** Width, height and alpha of a WebP from its RIFF header (extended, lossy or lossless). */
function webpInfo(bytes: Buffer): { width: number; height: number; alpha: boolean } {
  expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
  expect(bytes.toString("ascii", 8, 12)).toBe("WEBP");
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1, alpha: (bytes[20]! & 0x10) !== 0 };
  }
  if (chunk === "VP8L") {
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, alpha: ((bits >> 28) & 1) === 1 };
  }
  return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff, alpha: false };
}

const glbOf = (id: string) => readGlb(`${ASSETS}/units/${id}.glb`);

describe("unit assets built by tools/assets", () => {
  it("has a look for every character model the units draw, and a built model for every look", () => {
    expect(UNIT_IDS.filter((id) => !LOOKS[id])).toEqual([]);
    expect(MODEL_IDS.filter((id) => !existsSync(`${ASSETS}/units/${id}.glb`))).toEqual([]);
  });

  it.each(MODEL_IDS)("%s has a model with every clip its look plays", (id) => {
    const look = LOOKS[id]!;
    const { json } = glbOf(id);
    const clips = new Set(json.animations?.map((a) => a.name));
    const played = [look.idle, look.move, look.attack, look.death, look.dead, ...(look.work ?? []), ...(look.casts ?? [])];
    expect(played.filter((clip) => !clips.has(clip))).toEqual([]);
    expect((json.extensionsRequired ?? []).filter((ext) => !ALLOWED_EXTENSIONS.includes(ext))).toEqual([]);
    expect(json.nodes?.some((node) => node.name === "Head")).toBe(true);
  });

  it.each(MODEL_IDS)("%s stays within the triangle and texture budgets", (id) => {
    const { json, bin } = glbOf(id);
    const triangles = json.meshes.flatMap((mesh) => mesh.primitives).reduce((sum, p) => sum + json.accessors[p.indices!]!.count / 3, 0);
    expect(triangles).toBeLessThanOrEqual(MAX_TRIANGLES);
    // Albedo, normal and one surface map (occlusion, roughness, metal, tone).
    expect(json.images).toHaveLength(3);
    for (const image of json.images!) {
      expect(image.mimeType).toBe("image/webp");
      const view = json.bufferViews[image.bufferView!]!;
      const { width, height } = webpInfo(bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
      expect(Math.max(width, height)).toBeLessThanOrEqual(MAX_TEXTURE);
    }
  });

  it.each(MODEL_IDS)("%s keeps occlusion in the surface map the client reads roughness and metal from", (id) => {
    const { json, bin } = glbOf(id);
    expect(json.materials).toHaveLength(1);
    const material = json.materials![0]!;
    const image = (texture: { index: number } | undefined) => {
      const entry = json.textures![texture!.index]!;
      return entry.extensions?.EXT_texture_webp?.source ?? entry.source;
    };
    const surface = image(material.pbrMetallicRoughness?.metallicRoughnessTexture);
    expect(image(material.occlusionTexture)).toBe(surface);
    // Its alpha holds the tone class; without it every texel would read as skin.
    const view = json.bufferViews[json.images![surface!]!.bufferView!]!;
    expect(webpInfo(bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)).alpha).toBe(true);
    expect(new Set([image(material.pbrMetallicRoughness?.baseColorTexture), image(material.normalTexture), surface]).size).toBe(3);
  });

  it("keeps every unit model together under the download budget", () => {
    const total = MODEL_IDS.reduce((sum, id) => sum + statSync(`${ASSETS}/units/${id}.glb`).size, 0);
    expect(total).toBeLessThan(MAX_TOTAL_BYTES);
  });

  it.each(MODEL_IDS)("%s has a square portrait with alpha", (id) => {
    const file = `${ASSETS}/portraits/${id}.webp`;
    expect(existsSync(file)).toBe(true);
    expect(webpInfo(readFileSync(file))).toEqual({ width: PORTRAIT_SIZE, height: PORTRAIT_SIZE, alpha: true });
  });
});
