// Builds client/public/assets/trees.glb: procedural trees from ez-tree (MIT) dressed in CC0 photo-scanned bark and
// leaves. Each variant is one node with a bark and a leaf primitive, normalised to a height of 1.
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Document, NodeIO } from "@gltf-transform/core";
import { EXTTextureWebP } from "@gltf-transform/extensions";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const cache = join(here, ".cache", "trees");
const out = join(here, "../../client/public/assets/trees.glb");
const USER_AGENT = "crownfall-asset-build/1.0";
const CARD = 512;
const BARK = 256;

// ez-tree 1.1.0 loads its own textures through the DOM when imported; the build never uses them.
const fakeElement = () => ({ style: {}, addEventListener() {}, removeEventListener() {}, setAttribute() {}, getContext: () => null });
globalThis.document = { createElementNS: fakeElement, createElement: fakeElement };
globalThis.self = globalThis;
const { Tree } = await import("@dgreenheck/ez-tree");

/** Few, large leaf cards and coarse branches keep a tree near 1.2k triangles: thousands stand on a map at once. */
const LEAN = { sections: [5, 2, 2, 1], segments: [5, 3, 3, 3] };
const VARIANTS = [
  ...[11, 23, 37].map((seed, i) => ({ name: `pine_${i}`, preset: "Pine Medium", seed, leaf: "needles", bark: "pine", children: [30], leaves: 6, leafScale: 3.4 })),
  ...[5, 19].map((seed, i) => ({ name: `oak_${i}`, preset: "Oak Medium", seed, leaf: "broadleaf", bark: "oak", levels: 2, children: [6, 3], leaves: 5, leafScale: 4.2 })),
  ...[7, 29].map((seed, i) => ({ name: `ash_${i}`, preset: "Ash Medium", seed, leaf: "broadleaf", bark: "oak", levels: 2, children: [5, 4], leaves: 4, leafScale: 4.2 })),
  ...[3].map((seed, i) => ({ name: `aspen_${i}`, preset: "Aspen Medium", seed, leaf: "broadleaf", bark: "oak", children: [8, 3], leaves: 4, leafScale: 3.6 })),
  // Berry bushes: the resource node, not forest trees.
  ...[13, 31].map((seed, i) => ({ name: `bush_${i}`, preset: "Bush 1", seed, leaf: "broadleaf", bark: "oak", levels: 2, children: [6, 3], leaves: 5, leafScale: 2.2 })),
];

async function download(url, file) {
  if (existsSync(file)) return file;
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  return file;
}

const polyHaven = (kind, ext, id, map) => download(`https://dl.polyhaven.org/file/ph-assets/${kind}/${ext}/1k/${id}/${id}_${map}_1k.${ext}`, join(cache, `${id}_${map}.${ext}`));

async function ambientCg(id) {
  const zip = await download(`https://ambientcg.com/get?file=${id}_1K-PNG.zip`, join(cache, `${id}.zip`));
  const dir = join(cache, id);
  if (!existsSync(dir) || readdirSync(dir).length === 0) execFileSync("unzip", ["-oq", zip, "-d", dir]);
  return { color: join(dir, `${id}_1K-PNG_Color.png`), opacity: join(dir, `${id}_1K-PNG_Opacity.png`) };
}

/** Joins a colour image and a greyscale mask into RGBA. */
async function withAlpha(color, mask, region) {
  const crop = (file) => (region ? sharp(file).extract(region) : sharp(file));
  const { width, height } = region ?? (await sharp(color).metadata());
  // Separate pipelines: sharp would apply removeAlpha after joinChannel and drop the mask. sRGB first turns 16-bit masks into 8-bit.
  const alpha = await sharp(await crop(mask).toColourspace("srgb").png().toBuffer()).extractChannel(0).raw().toBuffer();
  const rgb = await crop(color).removeAlpha().png().toBuffer();
  return sharp(await sharp(rgb).joinChannel(alpha, { raw: { width, height, channels: 1 } }).png().toBuffer());
}

/** Clears every pixel not connected to the largest opaque region, dropping bits of neighbouring sprigs in the crop. */
async function largestRegion(png) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const label = new Int32Array(width * height).fill(-1);
  const sizes = [];
  for (let start = 0; start < label.length; start++) {
    if (label[start] >= 0 || data[start * 4 + 3] < 16) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [start];
    label[start] = id;
    while (stack.length > 0) {
      const i = stack.pop();
      size++;
      const x = i % width;
      for (const n of [i - 1, i + 1, i - width, i + width]) {
        if (n < 0 || n >= label.length || Math.abs((n % width) - x) > 1 || label[n] >= 0 || data[n * 4 + 3] < 16) continue;
        label[n] = id;
        stack.push(n);
      }
    }
    sizes.push(size);
  }
  const keep = sizes.indexOf(Math.max(...sizes));
  for (let i = 0; i < label.length; i++) if (label[i] !== keep) data[i * 4 + 3] = 0;
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/** Three fir sprigs from Poly Haven's fir_tree_01 twig atlas fanned on one card, darker behind, stems at the bottom centre. */
async function needleCard() {
  const color = await polyHaven("Models", "jpg", "fir_tree_01", "twig_diff");
  const mask = await polyHaven("Models", "png", "fir_tree_01", "twig_alpha");
  const sprig = await largestRegion(await (await withAlpha(color, mask, { left: 300, top: 400, width: 380, height: 415 })).toBuffer());
  const fitted = await sharp(sprig).resize(Math.round(CARD * 0.86), Math.round(CARD * 0.86), { fit: "inside" }).png().toBuffer();
  const layers = [];
  for (const [angle, shade, dx] of [[-34, 0.72, -0.12], [32, 0.78, 0.12], [0, 1, 0]]) {
    const piece = await sharp(await sharp(fitted).rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()).modulate({ brightness: shade }).png().toBuffer();
    const meta = await sharp(piece).metadata();
    const left = Math.round(Math.min(CARD - meta.width, Math.max(0, CARD / 2 - meta.width / 2 + dx * CARD)));
    const top = Math.max(0, CARD - meta.height);
    const visible = await sharp(piece).extract({ left: 0, top: 0, width: Math.min(meta.width, CARD), height: Math.min(meta.height, CARD) }).png().toBuffer();
    layers.push({ input: visible, left: Math.max(0, left), top });
  }
  return sharp({ create: { width: CARD, height: CARD, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(layers).png().toBuffer();
}

/** Splits an RGBA image into its leaves: runs of columns that hold any opaque pixel. */
async function leavesOf(image) {
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const used = (x) => {
    for (let y = 0; y < info.height; y++) if (data[(y * info.width + x) * 4 + 3] > 64) return true;
    return false;
  };
  const parts = [];
  let start = -1;
  for (let x = 0; x <= info.width; x++) {
    const on = x < info.width && used(x);
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      if (x - start > 40) {
        const raw = { width: info.width, height: info.height, channels: info.channels };
        const column = await sharp(data, { raw }).extract({ left: start, top: 0, width: x - start, height: info.height }).png().toBuffer();
        parts.push(await sharp(column).trim({ threshold: 1 }).png().toBuffer());
      }
      start = -1;
    }
  }
  return parts;
}

/** Deterministic 0..1 sequence so rebuilds produce the same cards. */
function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    return s / 4294967296;
  };
}

/** A leafy twig built from ambientCG LeafSet005 scans: leaves fanned around a stem, darker towards the back. */
async function broadleafCard() {
  const { color, opacity } = await ambientCg("LeafSet005");
  const leaves = await leavesOf(await withAlpha(color, opacity));
  const rand = random(5);
  const layers = [];
  const count = 34;
  for (let i = 0; i < count; i++) {
    const leaf = leaves[i % leaves.length];
    const along = 0.18 + rand() * 0.72;
    const spread = (rand() - 0.5) * 2;
    const size = Math.round(CARD * (0.2 + rand() * 0.12));
    const angle = spread * 70 + (rand() - 0.5) * 30;
    const shade = 0.62 + (i / count) * 0.45;
    const piece = await sharp(await sharp(leaf).resize(size, size, { fit: "inside" }).rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer())
      .modulate({ brightness: shade, hue: Math.round((rand() - 0.5) * 16) })
      .png()
      .toBuffer();
    const meta = await sharp(piece).metadata();
    const cx = CARD / 2 + spread * CARD * 0.3 * Math.min(1, along * 1.6);
    const cy = CARD * (1 - along);
    layers.push({ input: piece, left: Math.round(Math.min(CARD - meta.width, Math.max(0, cx - meta.width / 2))), top: Math.round(Math.min(CARD - meta.height, Math.max(0, cy - meta.height / 2))) });
  }
  const stem = Buffer.from(`<svg width="${CARD}" height="${CARD}"><path d="M${CARD / 2} ${CARD} C ${CARD * 0.5} ${CARD * 0.7}, ${CARD * 0.46} ${CARD * 0.4}, ${CARD * 0.5} ${CARD * 0.12}" stroke="#4a3a24" stroke-width="7" fill="none"/></svg>`);
  return sharp({ create: { width: CARD, height: CARD, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: stem }, ...layers])
    .png()
    .toBuffer();
}

/** Spreads opaque colour into the transparent texels so mipmaps and filtering never pull in a dark fringe. */
async function bleed(png) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const blurred = await sharp(await sharp(png).flatten({ background: "#3d4a22" }).blur(6).raw().toBuffer(), { raw: { width: info.width, height: info.height, channels: 3 } }).raw().toBuffer();
  for (let i = 0; i < info.width * info.height; i++) {
    if (data[i * 4 + 3] > 8) continue;
    data[i * 4] = blurred[i * 3];
    data[i * 4 + 1] = blurred[i * 3 + 1];
    data[i * 4 + 2] = blurred[i * 3 + 2];
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).webp({ quality: 88, alphaQuality: 100 }).toBuffer();
}

async function barkTexture(id) {
  const file = await polyHaven("Textures", "jpg", id, "diff");
  return sharp(file).resize(BARK, BARK).webp({ quality: 82 }).toBuffer();
}

function grow(spec) {
  const tree = new Tree();
  tree.loadPreset(spec.preset);
  const o = tree.options;
  o.seed = spec.seed;
  if (spec.levels !== undefined) o.branch.levels = spec.levels;
  for (let level = 0; level < 4; level++) {
    o.branch.sections[level] = Math.min(o.branch.sections[level], LEAN.sections[level]);
    o.branch.segments[level] = Math.min(o.branch.segments[level], LEAN.segments[level]);
  }
  (spec.children ?? []).forEach((count, level) => (o.branch.children[level] = count));
  if (spec.leaves !== undefined) o.leaves.count = spec.leaves;
  o.leaves.size *= spec.leafScale;
  tree.generate();
  return tree;
}

/** Copies a three.js geometry into glTF arrays, scaled to unit height, with v flipped to glTF's top-left origin. */
function arrays(geometry, scale) {
  const position = Float32Array.from(geometry.attributes.position.array, (v) => v * scale);
  const normal = Float32Array.from(geometry.attributes.normal.array);
  const uv = Float32Array.from(geometry.attributes.uv.array, (v, i) => (i % 2 === 1 ? 1 - v : v));
  const index = Uint32Array.from(geometry.index.array);
  return { position, normal, uv, index };
}

/** Points leaf normals away from the crown's centre so the canopy shades as one soft volume, not as flat cards. */
function roundCanopy({ position, normal }) {
  const centre = [0, 0, 0];
  const count = position.length / 3;
  for (let i = 0; i < position.length; i++) centre[i % 3] += position[i] / count;
  for (let i = 0; i < count; i++) {
    const d = [0, 1, 2].map((k) => position[i * 3 + k] - centre[k] + (k === 1 ? 0.15 : 0));
    const length = Math.hypot(...d) || 1;
    const n = [0, 1, 2].map((k) => d[k] / length * 0.8 + normal[i * 3 + k] * 0.2);
    const nl = Math.hypot(...n) || 1;
    for (let k = 0; k < 3; k++) normal[i * 3 + k] = n[k] / nl;
  }
}

mkdirSync(cache, { recursive: true });
const doc = new Document();
doc.createExtension(EXTTextureWebP).setRequired(true);
const buffer = doc.createBuffer();
const scene = doc.createScene("trees");

const texture = (name, image) => doc.createTexture(name).setImage(image).setMimeType("image/webp");
const cards = { needles: await bleed(await needleCard()), broadleaf: await bleed(await broadleafCard()) };
const barks = { pine: await barkTexture("pine_bark"), oak: await barkTexture("bark_brown_02") };
const leafMaterials = Object.fromEntries(
  Object.entries(cards).map(([name, image]) => [
    name,
    doc.createMaterial(`${name}_leaves`).setBaseColorTexture(texture(`${name}_leaves`, image)).setAlphaMode("MASK").setAlphaCutoff(0.42).setDoubleSided(true).setRoughnessFactor(0.85).setMetallicFactor(0),
  ]),
);
const barkMaterials = Object.fromEntries(
  Object.entries(barks).map(([name, image]) => [name, doc.createMaterial(`${name}_bark`).setBaseColorTexture(texture(`${name}_bark`, image)).setRoughnessFactor(0.95).setMetallicFactor(0)]),
);

function primitive(data, material) {
  const accessor = (array, type) => doc.createAccessor().setArray(array).setType(type).setBuffer(buffer);
  return doc
    .createPrimitive()
    .setAttribute("POSITION", accessor(data.position, "VEC3"))
    .setAttribute("NORMAL", accessor(data.normal, "VEC3"))
    .setAttribute("TEXCOORD_0", accessor(data.uv, "VEC2"))
    .setIndices(accessor(data.index, "SCALAR"))
    .setMaterial(material);
}

for (const spec of VARIANTS) {
  const tree = grow(spec);
  const positions = tree.branchesMesh.geometry.attributes.position.array;
  let top = 0;
  for (let i = 1; i < positions.length; i += 3) top = Math.max(top, positions[i]);
  for (const p of tree.leavesMesh.geometry.attributes.position.array.filter((_, i) => i % 3 === 1)) top = Math.max(top, p);
  const bark = arrays(tree.branchesMesh.geometry, 1 / top);
  const leaves = arrays(tree.leavesMesh.geometry, 1 / top);
  roundCanopy(leaves);
  const mesh = doc.createMesh(spec.name).addPrimitive(primitive(bark, barkMaterials[spec.bark])).addPrimitive(primitive(leaves, leafMaterials[spec.leaf]));
  scene.addChild(doc.createNode(spec.name).setMesh(mesh));
  console.log(`${spec.name.padEnd(8)} ${String(bark.index.length / 3).padStart(6)} bark, ${String(leaves.index.length / 3).padStart(6)} leaf triangles`);
}

await new NodeIO().registerExtensions([EXTTextureWebP]).write(out, doc);
console.log(`${(statSync(out).size / 1024).toFixed(0).padStart(6)} KB  trees.glb`);
