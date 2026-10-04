// Composes skinned characters from parts of glTF packs into the client's unit contract: one skin, one primitive,
// one atlas texture whose alpha marks team-coloured cloth, and only the clips the game plays.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTTextureWebP, KHRMeshQuantization } from "@gltf-transform/extensions";
import { prune, resample } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

export const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/** Atlas alpha for team-coloured texels; the client recolours them by the owner's colour. */
const TEAM_ALPHA = 128;
/** A tangent-space normal pointing straight out, as RGBA bytes. */
const FLAT_NORMAL = 0x8080ffff;
/** Tone classes in the surface atlas's alpha: human skin, dyed hide (orc, troll), hair, anything else. */
const TONE = { skin: 255, hide: 192, hair: 0, other: 128 };
/** Mean brightness team texels are normalised to, so every team colour keeps the cloth's folds at one value. */
const TEAM_GREY = 0.62;
const ATLAS = 512;
const GUTTER = 2;
const CELL = 8;
const SOURCE_SIZE = 1024;
const FINGER = /^(index|middle|pinky|ring|thumb)_/;

// ---------------------------------------------------------------------------------------------------------------
// Matrices: column-major 4x4 arrays, as glTF stores them.

export function multiply(a, b) {
  const r = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) r[c * 4 + row] += a[k * 4 + row] * b[c * 4 + k];
  return r;
}

export function invert(m) {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const det = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * det, (a02 * b10 - a01 * b11 - a03 * b09) * det, (a31 * b05 - a32 * b04 + a33 * b03) * det, (a22 * b04 - a21 * b05 - a23 * b03) * det,
    (a12 * b08 - a10 * b11 - a13 * b07) * det, (a00 * b11 - a02 * b08 + a03 * b07) * det, (a32 * b02 - a30 * b05 - a33 * b01) * det, (a20 * b05 - a22 * b02 + a23 * b01) * det,
    (a10 * b10 - a11 * b08 + a13 * b06) * det, (a01 * b08 - a00 * b10 - a03 * b06) * det, (a30 * b04 - a31 * b02 + a33 * b00) * det, (a21 * b02 - a20 * b04 - a23 * b00) * det,
    (a11 * b07 - a10 * b09 - a12 * b06) * det, (a00 * b09 - a01 * b07 + a02 * b06) * det, (a31 * b01 - a30 * b03 - a32 * b00) * det, (a20 * b03 - a21 * b01 + a22 * b00) * det,
  ];
}

function transform(m, x, y, z, w) {
  return [m[0] * x + m[4] * y + m[8] * z + m[12] * w, m[1] * x + m[5] * y + m[9] * z + m[13] * w, m[2] * x + m[6] * y + m[10] * z + m[14] * w];
}

const normalize = (v) => {
  const l = Math.hypot(...v) || 1;
  return v.map((x) => x / l);
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The rotation matrix (as column vectors) taking orthonormal frame (a1, b1) onto (a2, b2). */
function rotationBetween(a1, b1, a2, b2) {
  const frame = (a, b) => {
    const x = normalize(a);
    const y = normalize(b.map((v, i) => v - x[i] * dot(x, b)));
    return [x, y, cross(x, y)];
  };
  const [x1, y1, z1] = frame(a1, b1);
  const [x2, y2, z2] = frame(a2, b2);
  // R = F2 * F1^T, applied to a vector v as sum_i F2_i * (F1_i . v).
  return (v) => {
    const c = [dot(x1, v), dot(y1, v), dot(z1, v)];
    return [0, 1, 2].map((k) => x2[k] * c[0] + y2[k] * c[1] + z2[k] * c[2]);
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Sources

const docs = new Map();

/** Reads a glTF once, tolerating texture files a pack references but does not ship. */
export async function readDoc(path) {
  if (docs.has(path)) return docs.get(path);
  let doc;
  if (path.endsWith(".glb")) {
    doc = await io.read(path);
  } else {
    const json = JSON.parse(readFileSync(path, "utf8"));
    const dir = dirname(path);
    const resources = {};
    for (const buffer of json.buffers ?? []) resources[buffer.uri] = readFileSync(join(dir, decodeURIComponent(buffer.uri)));
    for (const image of json.images ?? []) {
      if (!image.uri) continue;
      const file = join(dir, decodeURIComponent(image.uri));
      resources[image.uri] = existsSync(file) ? readFileSync(file) : new Uint8Array(0);
    }
    doc = await io.readJSON({ json, resources });
  }
  docs.set(path, doc);
  return doc;
}

/** The joint hierarchy a character is skinned to, in its rest (bind) pose. */
export class Rig {
  constructor(doc) {
    const skin = doc.getRoot().listSkins()[0];
    this.joints = skin.listJoints();
    this.names = this.joints.map((j) => j.getName());
    this.index = new Map(this.names.map((n, i) => [n, i]));
    this.world = this.joints.map((j) => j.getWorldMatrix());
    const top = this.joints.find((j) => !this.joints.includes(j.getParentNode()));
    this.ancestors = [];
    for (let n = top.getParentNode(); n && n.propertyType === "Node"; n = n.getParentNode()) this.ancestors.unshift(n);
    this.rest = this.joints.map((j) => ({ t: j.getTranslation(), r: j.getRotation(), s: j.getScale() }));
  }

  jointOf(name) {
    const i = this.index.get(name);
    if (i === undefined) throw new Error(`The rig has no joint ${name}`);
    return i;
  }

  position(name) {
    const m = this.world[this.jointOf(name)];
    return [m[12], m[13], m[14]];
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Parts: triangle lists in the rig's bind space, each with one surface (a texture or flat per-triangle colours).

function readAttribute(primitive, semantic, size) {
  const accessor = primitive.getAttribute(semantic);
  const out = new Float32Array(accessor.getCount() * size);
  const el = [];
  for (let i = 0; i < accessor.getCount(); i++) out.set(accessor.getElement(i, el).slice(0, size), i * size);
  return out;
}

function indicesOf(primitive) {
  const indices = primitive.getIndices();
  if (indices) return Uint32Array.from(indices.getArray());
  return Uint32Array.from({ length: primitive.getAttribute("POSITION").getCount() }, (_, i) => i);
}

const present = (image) => (image && image.byteLength > 0 ? image : null);

/** Metal and wood props name their materials; untextured palette props are told apart by colour. */
const METAL_NAME = /steel|metal|iron|silver|gold|grey|gray|blade/i;
const WOOD_NAME = /wood/i;
const GLOSSY_NAME = /eye|nose/i;

/** Roughness and metalness of a flat-coloured material; the props' own factors are a uniform placeholder. */
export function flatMaterial(name, rgb) {
  if (METAL_NAME.test(name)) return { roughness: 0.35, metallic: 1 };
  if (WOOD_NAME.test(name)) return { roughness: 0.7, metallic: 0 };
  if (GLOSSY_NAME.test(name)) return { roughness: 0.25, metallic: 0 };
  const [, saturation, value] = hsv(...rgb);
  if (/atlas/i.test(name) && saturation < 0.12 && value > 0.25) return { roughness: 0.4, metallic: 1 };
  return { roughness: 0.85, metallic: 0 };
}

/**
 * A primitive's surface: its base colour texture with the normal and metallic-roughness (occlusion, roughness,
 * metalness) maps beside it, or flat colours from its factor with a roughness and metalness.
 */
function surfaceOf(primitive, override = {}) {
  const material = primitive.getMaterial();
  const name = material?.getName() ?? "";
  const factor = material?.getBaseColorFactor() ?? [1, 1, 1, 1];
  const image = present(material?.getBaseColorTexture()?.getImage());
  // An override colour is sRGB, like the atlas; material factors are linear.
  if (override.color) return { kind: "flat", color: override.color, team: override.team, material: override.material ?? flatMaterial(name, override.color) };
  if (image && !override.flat) {
    return {
      kind: "texture",
      image: override.image ?? image,
      normal: present(material.getNormalTexture()?.getImage()),
      orm: present(material.getMetallicRoughnessTexture()?.getImage()),
      metallic: override.metallic ?? material.getMetallicFactor(),
      roughness: override.roughness ?? material.getRoughnessFactor(),
      key: override.key ?? name,
      tint: override.tint,
      team: override.team,
      density: override.density ?? 1,
      dye: override.dye,
      bake: override.bake,
      tone: override.tone,
    };
  }
  return { kind: "flat", image, name, factor, team: override.team, tint: override.tint, material: override.material };
}

/**
 * Skinned meshes of `doc`, rebound onto `rig` by joint name: each vertex is moved by its source bind pose into the
 * rig's, so parts made for a slightly different body (Superhero vs Regular) land on the rig's bones.
 */
export function skinnedParts(doc, rig, { meshes, keepTriangle, surfaces = {} }) {
  const parts = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || !node.getSkin() || !meshes.includes(node.getName())) continue;
    const skin = node.getSkin();
    const sourceJoints = skin.listJoints().map((j) => j.getName());
    const map = sourceJoints.map((name) => rig.jointOf(name));
    const ibm = skin.getInverseBindMatrices();
    const rebind = sourceJoints.map((_, j) => multiply(rig.world[map[j]], ibm.getElement(j, [])));
    mesh.listPrimitives().forEach((primitive, p) => {
      const positions = readAttribute(primitive, "POSITION", 3);
      const normals = readAttribute(primitive, "NORMAL", 3);
      const uvs = primitive.getAttribute("TEXCOORD_0") ? readAttribute(primitive, "TEXCOORD_0", 2) : new Float32Array((positions.length / 3) * 2);
      const sourceJ = readAttribute(primitive, "JOINTS_0", 4);
      const sourceW = readAttribute(primitive, "WEIGHTS_0", 4);
      const count = positions.length / 3;
      const joints = new Uint16Array(count * 4);
      const weights = new Float32Array(count * 4);
      for (let v = 0; v < count; v++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) sum += sourceW[v * 4 + k];
        const pos = [0, 0, 0];
        const nor = [0, 0, 0];
        for (let k = 0; k < 4; k++) {
          const w = sourceW[v * 4 + k] / sum;
          const j = sourceJ[v * 4 + k];
          joints[v * 4 + k] = map[j];
          weights[v * 4 + k] = w;
          if (w === 0) continue;
          const pv = transform(rebind[j], positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2], 1);
          const nv = transform(rebind[j], normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2], 0);
          for (let c = 0; c < 3; c++) {
            pos[c] += pv[c] * w;
            nor[c] += nv[c] * w;
          }
        }
        positions.set(pos, v * 3);
        normals.set(normalize(nor), v * 3);
      }
      const material = primitive.getMaterial()?.getName() ?? "";
      const indices = filterIndices(indicesOf(primitive), keepTriangle, joints, weights, rig);
      const surface = surfaceOf(primitive, { ...surfaces[material], ...surfaces[node.getName()], ...surfaces[`${node.getName()}#${p}`] });
      parts.push(compact({ name: `${node.getName()}#${p}`, positions, normals, uvs, joints, weights, indices, surface }));
    });
  }
  const missing = meshes.filter((m) => !parts.some((p) => p.name.startsWith(`${m}#`)));
  if (missing.length) throw new Error(`No skinned meshes ${missing.join(", ")}`);
  return parts;
}

function filterIndices(indices, keepTriangle, joints, weights, rig) {
  if (!keepTriangle) return indices;
  const influences = (v) => [0, 1, 2, 3].map((k) => [rig.names[joints[v * 4 + k]], weights[v * 4 + k]]);
  const kept = [];
  for (let i = 0; i < indices.length; i += 3) {
    const tri = [indices[i], indices[i + 1], indices[i + 2]];
    if (keepTriangle(tri.map(influences))) kept.push(...tri);
  }
  return Uint32Array.from(kept);
}

/** Drops unreferenced vertices. */
function compact(part) {
  const remap = new Int32Array(part.positions.length / 3).fill(-1);
  let next = 0;
  for (const i of part.indices) if (remap[i] < 0) remap[i] = next++;
  const pick = (array, size) => {
    const out = new array.constructor(next * size);
    remap.forEach((to, from) => {
      if (to >= 0) for (let k = 0; k < size; k++) out[to * size + k] = array[from * size + k];
    });
    return out;
  };
  const colors = part.colors && pick(part.colors, 3);
  const materials = part.materials && pick(part.materials, 2);
  return { ...part, positions: pick(part.positions, 3), normals: pick(part.normals, 3), uvs: pick(part.uvs, 2), joints: pick(part.joints, 4), weights: pick(part.weights, 4), colors, materials, indices: part.indices.map((i) => remap[i]) };
}

/**
 * Static meshes rigidly held by one joint. The grip places them in the rest (T) pose: the model's `axis` runs along
 * world `dir`, its `flat` axis along world `up`, scaled to `length` along the axis, held at `hold` (0 = the axis's low
 * end, 1 = its high end), offset `at` from the joint.
 */
export function rigidParts(doc, rig, grip) {
  const joint = rig.jointOf(grip.joint);
  const axes = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1], "-x": [-1, 0, 0], "-y": [0, -1, 0], "-z": [0, 0, -1] };
  const axis = axes[grip.axis];
  const flat = axes[grip.flat];
  const meshNodes = doc.getRoot().listNodes().filter((n) => n.getMesh() && !(grip.skip ?? []).includes(n.getName()));
  // Bounds along the model's own axes, in its scene space.
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const sources = [];
  for (const node of meshNodes) {
    const world = node.getWorldMatrix();
    for (const primitive of node.getMesh().listPrimitives()) {
      const positions = readAttribute(primitive, "POSITION", 3);
      const normals = primitive.getAttribute("NORMAL") ? readAttribute(primitive, "NORMAL", 3) : new Float32Array(positions.length);
      for (let v = 0; v < positions.length / 3; v++) {
        const p = transform(world, positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2], 1);
        positions.set(p, v * 3);
        normals.set(normalize(transform(world, normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2], 0)), v * 3);
        for (let c = 0; c < 3; c++) {
          lo[c] = Math.min(lo[c], p[c]);
          hi[c] = Math.max(hi[c], p[c]);
        }
      }
      const uvs = primitive.getAttribute("TEXCOORD_0") ? readAttribute(primitive, "TEXCOORD_0", 2) : new Float32Array((positions.length / 3) * 2);
      sources.push({ name: node.getName(), primitive, positions, normals, uvs });
    }
  }
  const centre = lo.map((v, c) => (v + hi[c]) / 2);
  const extent = Math.abs(dot(axis, hi.map((v, c) => v - lo[c])));
  const along = (grip.hold - 0.5) * extent;
  const pivot = centre.map((v, c) => v + axis[c] * along);
  const scale = grip.length / extent;
  const rotate = rotationBetween(axis, flat, grip.dir, grip.up);
  const origin = rig.position(grip.joint).map((v, c) => v + (grip.at?.[c] ?? 0));
  return sources.map(({ name, primitive, positions, normals, uvs }, p) => {
    const count = positions.length / 3;
    for (let v = 0; v < count; v++) {
      const local = [0, 1, 2].map((c) => (positions[v * 3 + c] - pivot[c]) * scale);
      positions.set(rotate(local).map((x, c) => x + origin[c]), v * 3);
      normals.set(normalize(rotate([normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]])), v * 3);
    }
    const joints = new Uint16Array(count * 4);
    const weights = new Float32Array(count * 4);
    for (let v = 0; v < count; v++) {
      joints[v * 4] = joint;
      weights[v * 4] = 1;
    }
    const surface = surfaceOf(primitive, { flat: true, team: grip.team, tint: grip.tint });
    return compact({ name: `${grip.name ?? name}#${p}`, positions, normals, uvs, joints, weights, indices: indicesOf(primitive), surface });
  });
}

/** Unskinned meshes parented under a joint (a creature's eyes on its face bone), each held rigidly by that joint. */
export function attachedParts(doc, rig, { meshes, surfaces = {} }) {
  const parts = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || node.getSkin() || !meshes.includes(node.getName())) continue;
    let bone = node.getParentNode();
    while (bone?.propertyType === "Node" && !rig.index.has(bone.getName())) bone = bone.getParentNode();
    if (bone?.propertyType !== "Node") throw new Error(`${node.getName()} hangs from no joint of the rig`);
    const joint = rig.jointOf(bone.getName());
    // From the document's rest pose onto the rig's.
    const place = multiply(multiply(rig.world[joint], invert(bone.getWorldMatrix())), node.getWorldMatrix());
    mesh.listPrimitives().forEach((primitive, p) => {
      const positions = readAttribute(primitive, "POSITION", 3);
      const normals = readAttribute(primitive, "NORMAL", 3);
      const uvs = primitive.getAttribute("TEXCOORD_0") ? readAttribute(primitive, "TEXCOORD_0", 2) : new Float32Array((positions.length / 3) * 2);
      const count = positions.length / 3;
      const joints = new Uint16Array(count * 4);
      const weights = new Float32Array(count * 4);
      for (let v = 0; v < count; v++) {
        positions.set(transform(place, positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2], 1), v * 3);
        normals.set(normalize(transform(place, normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2], 0)), v * 3);
        joints[v * 4] = joint;
        weights[v * 4] = 1;
      }
      const material = primitive.getMaterial()?.getName() ?? "";
      const surface = surfaceOf(primitive, { ...surfaces[material], ...surfaces[node.getName()] });
      parts.push(compact({ name: `${node.getName()}#${p}`, positions, normals, uvs, joints, weights, indices: indicesOf(primitive), surface }));
    });
  }
  const missing = meshes.filter((m) => !parts.some((p) => p.name.startsWith(`${m}#`)));
  if (missing.length) throw new Error(`No attached meshes ${missing.join(", ")}`);
  return parts;
}

/** Gives a rigid part the skin weights of the nearest vertex of `body`, so armour bends with the torso it covers. */
export function transferWeights(parts, body) {
  const source = body.flatMap((part) => Array.from({ length: part.positions.length / 3 }, (_, v) => ({ part, v })));
  for (const part of parts) {
    for (let v = 0; v < part.positions.length / 3; v++) {
      let best = null;
      let bestDistance = Infinity;
      for (const s of source) {
        const d = (s.part.positions[s.v * 3] - part.positions[v * 3]) ** 2 + (s.part.positions[s.v * 3 + 1] - part.positions[v * 3 + 1]) ** 2 + (s.part.positions[s.v * 3 + 2] - part.positions[v * 3 + 2]) ** 2;
        if (d < bestDistance) {
          bestDistance = d;
          best = s;
        }
      }
      part.joints.set(best.part.joints.subarray(best.v * 4, best.v * 4 + 4), v * 4);
      part.weights.set(best.part.weights.subarray(best.v * 4, best.v * 4 + 4), v * 4);
    }
  }
  return parts;
}

/** A crossbow built from boxes (no CC0 crossbow fits): stock along +Y, prod across X at the top, string, iron fittings. */
export function crossbowParts(rig, grip) {
  const wood = [0.3, 0.2, 0.12];
  const darkWood = [0.22, 0.14, 0.08];
  const iron = [0.32, 0.32, 0.34];
  const string = [0.62, 0.58, 0.48];
  const finishOf = (color) => (color === iron ? { roughness: 0.4, metallic: 1 } : color === string ? { roughness: 0.9, metallic: 0 } : { roughness: 0.65, metallic: 0 });
  const boxes = [
    // [centre, half extents, rotation about Z in radians, colour]
    [[0, 0.3, 0], [0.025, 0.3, 0.035], 0, wood],
    [[0, 0.03, -0.01], [0.022, 0.07, 0.05], 0, darkWood],
    [[0, 0.58, 0.005], [0.03, 0.025, 0.03], 0, iron],
    [[0.16, 0.565, 0.005], [0.17, 0.014, 0.018], -0.22, darkWood],
    [[-0.16, 0.565, 0.005], [0.17, 0.014, 0.018], 0.22, darkWood],
    [[0.16, 0.43, 0.02], [0.19, 0.003, 0.003], 0.72, string],
    [[-0.16, 0.43, 0.02], [0.19, 0.003, 0.003], -0.72, string],
    [[0, 0.3, 0.04], [0.006, 0.08, 0.006], 0, iron],
  ];
  const positions = [];
  const normals = [];
  const indices = [];
  const faceColors = [];
  const faceMaterials = [];
  const corners = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
  const faces = [[0, 3, 2, 1, [0, 0, -1]], [4, 5, 6, 7, [0, 0, 1]], [0, 1, 5, 4, [0, -1, 0]], [3, 7, 6, 2, [0, 1, 0]], [0, 4, 7, 3, [-1, 0, 0]], [1, 2, 6, 5, [1, 0, 0]]];
  for (const [c, h, angle, color] of boxes) {
    const rot = ([x, y, z]) => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle), z];
    for (const [a, b, d, e, n] of faces) {
      const base = positions.length / 3;
      for (const k of [a, b, d, e]) {
        const p = rot(corners[k].map((s, i) => s * h[i]));
        positions.push(p[0] + c[0], p[1] + c[1], p[2] + c[2]);
        normals.push(...rot(n));
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      faceColors.push(...color, ...color);
      const { roughness, metallic } = finishOf(color);
      faceMaterials.push(roughness, metallic, roughness, metallic);
    }
  }
  const doc = new Document();
  const buffer = doc.createBuffer();
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(positions)).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(normals)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(indices)).setBuffer(buffer));
  doc.createScene().addChild(doc.createNode("Crossbow").setMesh(doc.createMesh().addPrimitive(prim)));
  const [part] = rigidParts(doc, rig, { ...grip, name: "Crossbow" });
  part.surface = { kind: "flat", colors: new Float32Array(faceColors), materials: new Float32Array(faceMaterials) };
  return [part];
}

/**
 * Procedural pieces rigidly held by `joint`, modelled about `origin` (rig space) in units of `scale`: lathes, surfaces of
 * revolution about +Y given as rings `[y, radius x, radius z]` top to bottom (radius 0 closes a pole), and boxes
 * `[centre, half extents, turn about Z]`. Each shape has a flat sRGB colour and a finish; team shapes go in a part of
 * their own.
 */
export function shapeParts(rig, { name, joint, origin, scale = 1, shapes, segments = 20 }) {
  const bone = rig.jointOf(joint);
  const groups = new Map();
  for (const shape of shapes) {
    const team = shape.team === true;
    if (!groups.has(team)) groups.set(team, { positions: [], normals: [], indices: [], colors: [], materials: [] });
    const g = groups.get(team);
    const base = g.positions.length / 3;
    const point = (p) => g.positions.push(...p.map((v, c) => origin[c] + v * scale));
    let quads = [];
    if (shape.lathe) {
      const rings = shape.lathe;
      for (const [y, rx, rz] of rings) {
        for (let s = 0; s < segments; s++) {
          const a = (s / segments) * Math.PI * 2;
          point([Math.sin(a) * rx, y, Math.cos(a) * rz]);
        }
      }
      for (let r = 0; r + 1 < rings.length; r++) {
        for (let s = 0; s < segments; s++) {
          const n = (s + 1) % segments;
          quads.push([r * segments + s, (r + 1) * segments + s, (r + 1) * segments + n, r * segments + n]);
        }
      }
    } else {
      const [c, h, turn = 0] = shape.box;
      const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
      for (const k of [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]) {
        const [x, y, z] = k.map((s, i) => s * h[i]);
        point([c[0] + x * cos - y * sin, c[1] + x * sin + y * cos, c[2] + z]);
      }
      quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]];
    }
    const at = (v) => [0, 1, 2].map((c) => g.positions[(base + v) * 3 + c]);
    const centre = [0, 1, 2].map((c) => {
      let sum = 0;
      const count = g.positions.length / 3 - base;
      for (let v = 0; v < count; v++) sum += g.positions[(base + v) * 3 + c];
      return sum / count;
    });
    const smooth = new Float32Array(g.positions.length - base * 3);
    for (const quad of quads) {
      // Wound counter-clockwise seen from outside: the face normal points away from the shape's centre.
      const [p0, p1, p2, p3] = quad.map(at);
      let normal = cross(p2.map((v, c) => v - p0[c]), p3.map((v, c) => v - p1[c]));
      const mid = [0, 1, 2].map((c) => (p0[c] + p1[c] + p2[c] + p3[c]) / 4 - centre[c]);
      const ordered = dot(normal, mid) >= 0 ? quad : [...quad].reverse();
      if (ordered !== quad) normal = normal.map((v) => -v);
      const [a, b, d, e] = ordered.map((v) => base + v);
      g.indices.push(a, b, d, a, d, e);
      for (let k = 0; k < 2; k++) {
        g.colors.push(...shape.color);
        g.materials.push(shape.finish.roughness, shape.finish.metallic);
      }
      // A lathe shades smooth across its quads; a box keeps its edges hard.
      if (shape.lathe) for (const v of quad) for (let c = 0; c < 3; c++) smooth[v * 3 + c] += normal[c];
    }
    if (shape.lathe) {
      for (let v = 0; v < smooth.length / 3; v++) g.normals.push(...normalize([smooth[v * 3], smooth[v * 3 + 1], smooth[v * 3 + 2]]));
    } else {
      // Boxes get a vertex per face corner, so each face keeps its own normal.
      const corners = g.positions.splice(base * 3);
      const faces = g.indices.splice(g.indices.length - 36);
      for (let f = 0; f < 12; f++) {
        const tri = faces.slice(f * 3, f * 3 + 3).map((v) => corners.slice((v - base) * 3, (v - base) * 3 + 3));
        const normal = normalize(cross(tri[1].map((v, c) => v - tri[0][c]), tri[2].map((v, c) => v - tri[0][c])));
        for (const p of tri) {
          g.indices.push(g.positions.length / 3);
          g.positions.push(...p);
          g.normals.push(...normal);
        }
      }
    }
  }
  return [...groups].map(([team, g]) => {
    const count = g.positions.length / 3;
    const joints = new Uint16Array(count * 4);
    const weights = new Float32Array(count * 4);
    for (let v = 0; v < count; v++) {
      joints[v * 4] = bone;
      weights[v * 4] = 1;
    }
    const surface = { kind: "flat", colors: new Float32Array(g.colors), materials: new Float32Array(g.materials), team: team || undefined };
    return { name: `${name}${team ? "_team" : ""}#0`, positions: new Float32Array(g.positions), normals: new Float32Array(g.normals), uvs: new Float32Array(count * 2), joints, weights, indices: Uint32Array.from(g.indices), surface };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Simplification

/**
 * Simplifies a part to about `triangles`. It first keeps open borders, so seams between parts stay closed, then lets
 * them move, then prunes tiny loose pieces. Parts whose colour lives in their vertices may also collapse across UV
 * seams, which straps and buckles are full of.
 */
export function simplify(part, triangles) {
  if (part.indices.length / 3 <= triangles) return part;
  const passes = [[0.05, ["LockBorder"]], [0.15, []], [0.05, ["Prune"]]];
  if (part.colors) passes.push([0.1, ["Permissive"]], [0.05, ["Permissive", "Prune"]]);
  let best = part.indices;
  for (const [error, flags] of passes) {
    const [indices] = MeshoptSimplifier.simplify(part.indices, part.positions, 3, triangles * 3, error, flags);
    if (indices.length < best.length) best = indices;
    if (best.length / 3 <= triangles * 1.1) break;
  }
  return compact({ ...part, indices: Uint32Array.from(best) });
}

/**
 * Moves a textured part's colour into its vertices (sampled from a blurred copy of the texture), so it can be
 * simplified across its UV seams; it then takes a single white atlas texel.
 */
export async function bakeVertexColors(part) {
  const size = 256;
  const sample = async (image) => (image ? (await sharp(image).resize(size, size, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).data : null);
  const data = await sample(part.surface.image);
  const orm = await sample(part.surface.orm);
  const n = part.positions.length / 3;
  const colors = new Float32Array(n * 3);
  // Roughness and metalness ride along per vertex, so buckles stay metal after the texture is gone.
  const materials = new Float32Array(n * 2);
  for (let v = 0; v < n; v++) {
    const x = Math.min(size - 1, Math.max(0, Math.floor(part.uvs[v * 2] * size)));
    const y = Math.min(size - 1, Math.max(0, Math.floor(part.uvs[v * 2 + 1] * size)));
    const o = (y * size + x) * 4;
    const [rgb] = texel({ surface: { ...part.surface, team: undefined } }, data[o] / 255, data[o + 1] / 255, data[o + 2] / 255);
    colors.set(rgb, v * 3);
    materials.set(orm ? [(orm[o + 1] / 255) * part.surface.roughness, (orm[o + 2] / 255) * part.surface.metallic] : [part.surface.roughness, 0], v * 2);
  }
  return { ...part, colors, materials, surface: { kind: "flat", color: [1, 1, 1] } };
}

/** Merges vertices at the same position, so faceted props (split per face) can be simplified across their edges. */
export function weldPositions(part) {
  const keyOf = new Map();
  const remap = new Uint32Array(part.positions.length / 3);
  for (let v = 0; v < remap.length; v++) {
    const key = Array.from(part.positions.subarray(v * 3, v * 3 + 3), (x) => Math.round(x * 1e5)).join(",");
    if (!keyOf.has(key)) keyOf.set(key, v);
    remap[v] = keyOf.get(key);
  }
  const indices = [];
  for (let i = 0; i < part.indices.length; i += 3) {
    const [a, b, c] = [remap[part.indices[i]], remap[part.indices[i + 1]], remap[part.indices[i + 2]]];
    if (a !== b && b !== c && a !== c) indices.push(a, b, c);
  }
  return compact({ ...part, indices: Uint32Array.from(indices), flatNormals: true });
}

export const simplifierReady = MeshoptSimplifier.ready;

// ---------------------------------------------------------------------------------------------------------------
// Atlas

const decoded = new Map();

async function decode(image) {
  if (!decoded.has(image)) decoded.set(image, await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
  return decoded.get(image);
}

const reducedImages = new Map();

const luma = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b;

function hsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return [(h * 60 + 360) % 360, max === 0 ? 0 : d / max, max];
}

/** Whether a texel matches a team rule: a hue band of cloth, or every texel of the surface. */
function isTeam(rule, r, g, b) {
  if (!rule) return false;
  if (rule === true) return true;
  const [h, s, v] = hsv(r, g, b);
  const inHue = rule.hue[0] <= rule.hue[1] ? h >= rule.hue[0] && h <= rule.hue[1] : h >= rule.hue[0] || h <= rule.hue[1];
  return inHue && s >= (rule.minSat ?? 0) && s <= (rule.maxSat ?? 1) && v >= (rule.minValue ?? 0);
}

/**
 * Per-triangle colour, roughness and metalness of a flat part: its fixed colours or the material factor times the
 * texture at the triangle's UV centre, and the finish of its vertices, its surface or its material name.
 */
async function faceSurfacesOf(part) {
  const triangles = part.indices.length / 3;
  const materials = new Float32Array(triangles * 2);
  for (let t = 0; t < triangles; t++) {
    if (part.surface.materials) {
      materials.set(part.surface.materials.subarray(t * 2, t * 2 + 2), t * 2);
    } else if (part.materials) {
      for (let k = 0; k < 3; k++) for (let c = 0; c < 2; c++) materials[t * 2 + c] += part.materials[part.indices[t * 3 + k] * 2 + c] / 3;
    } else if (part.surface.material) {
      materials.set([part.surface.material.roughness, part.surface.material.metallic], t * 2);
    }
  }
  const colors = part.surface.colors ?? (await faceColorsOf(part));
  if (!part.surface.materials && !part.materials && !part.surface.material) {
    for (let t = 0; t < triangles; t++) {
      const { roughness, metallic } = flatMaterial(part.surface.name ?? "", Array.from(colors.subarray(t * 3, t * 3 + 3)));
      materials.set([roughness, metallic], t * 2);
    }
  }
  return { colors, materials };
}

/** Per-triangle colours for flat parts: the material factor, times the texture at the triangle's UV centre. */
async function faceColorsOf(part) {
  const triangles = part.indices.length / 3;
  const colors = new Float32Array(triangles * 3);
  const factor = part.surface.factor ?? [1, 1, 1];
  const image = part.surface.image ? await decode(part.surface.image) : null;
  for (let t = 0; t < triangles; t++) {
    if (part.surface.color) {
      colors.set(part.surface.color, t * 3);
      continue;
    }
    let rgb = factor.slice(0, 3);
    if (image) {
      let u = 0;
      let v = 0;
      for (let k = 0; k < 3; k++) {
        u += part.uvs[part.indices[t * 3 + k] * 2] / 3;
        v += part.uvs[part.indices[t * 3 + k] * 2 + 1] / 3;
      }
      const { data, info } = image;
      const x = Math.min(info.width - 1, Math.floor((((u % 1) + 1) % 1) * info.width));
      const y = Math.min(info.height - 1, Math.floor((((v % 1) + 1) % 1) * info.height));
      const o = (y * info.width + x) * info.channels;
      rgb = rgb.map((f, c) => f * (data[o + c] / 255) ** 2.2);
    }
    // Factors are linear; the atlas holds glTF base colour, which is sRGB.
    const tint = part.surface.tint ?? [1, 1, 1];
    colors.set(rgb.map((c, k) => Math.min(1, Math.min(1, c) ** (1 / 2.2) * tint[k])), t * 3);
  }
  return colors;
}

function shelfPack(boxes, size) {
  const sorted = [...boxes].sort((a, b) => b.h - a.h);
  let x = 0;
  let y = 0;
  let row = 0;
  for (const box of sorted) {
    if (box.w > size) return false;
    if (x + box.w > size) {
      x = 0;
      y += row;
      row = 0;
    }
    box.x = x;
    box.y = y;
    x += box.w;
    row = Math.max(row, box.h);
  }
  return y + row <= size;
}

/**
 * Packs every part's texture regions and flat colours into three atlases with one layout, and rewrites the parts' UVs
 * into it: colour (alpha marks team texels, whose colour becomes normalised brightness for the client to tint),
 * tangent-space normals, and a glTF metallic-roughness map (R occlusion, G roughness, B metalness) whose alpha holds
 * the tone class (TONE) for the client's per-unit variation.
 * Texture regions are crops of the used UV rectangle; flat triangles get palette cells (and their own vertices).
 */
export async function buildAtlas(parts) {
  // Flat parts become palette cells, one vertex triple per triangle.
  const palette = new Map();
  const flatParts = [];
  for (const [i, part] of parts.entries()) {
    if (part.surface.kind !== "flat") continue;
    const { colors, materials } = await faceSurfacesOf(part);
    const triangles = part.indices.length / 3;
    const cells = new Int32Array(triangles);
    for (let t = 0; t < triangles; t++) {
      const rgb = Array.from(colors.subarray(t * 3, t * 3 + 3), (c) => Math.round(c * 31) / 31);
      const team = part.surface.team === true || (part.surface.team && isTeam(part.surface.team, rgb[0], rgb[1], rgb[2]));
      const roughness = Math.round(materials[t * 2] * 10) / 10;
      const metallic = Math.round(materials[t * 2 + 1] * 2) / 2;
      const key = `${rgb.join(",")}|${team ? 1 : 0}|${roughness}|${metallic}`;
      if (!palette.has(key)) palette.set(key, { rgb, team, roughness, metallic, index: palette.size });
      cells[t] = palette.get(key).index;
    }
    parts[i] = splitByCell(part, cells);
    flatParts.push(parts[i]);
  }
  // Texture regions: each UV island (merged with islands it overlaps) is cropped from its source on its own, sized
  // by the island's world-space extent so texel density is even across sources of different resolutions.
  const surfaces = new Map();
  for (const part of parts) {
    if (part.surface.kind !== "texture") continue;
    const key = `${part.surface.key}|${JSON.stringify(part.surface.team ?? null)}|${part.surface.tint ?? ""}|${JSON.stringify(part.surface.dye ?? null)}`;
    if (!surfaces.has(key)) {
      const meta = await sharp(part.surface.image).metadata();
      const [pixels, normals, orm] = await Promise.all([reduced(part.surface.image), part.surface.normal && reduced(part.surface.normal), part.surface.orm && reduced(part.surface.orm)]);
      surfaces.set(key, { key, surface: part.surface, width: meta.width, height: meta.height, pixels, normals, orm, islands: [] });
    }
    surfaces.get(key).islands.push(...islandsOf(part));
  }
  const boxes = [];
  for (const source of surfaces.values()) {
    source.teamMean = teamMean(source);
    for (const region of mergeIslands(source.islands)) boxes.push({ ...region, source });
  }
  const cellsPerRow = 16;
  const paletteBox = { w: cellsPerRow * CELL, h: Math.ceil(Math.max(1, palette.size) / cellsPerRow) * CELL, palette: true };
  // Texels per metre, shrunk until everything fits; never more texels than the source has.
  let density = 2048;
  for (;;) {
    for (const r of boxes) {
      const metresPerUv = Math.sqrt(r.worldArea / Math.max(1e-9, r.uvArea));
      const weight = density * r.source.surface.density;
      r.w = Math.max(4, Math.round(Math.min((r.u1 - r.u0) * metresPerUv * weight, (r.u1 - r.u0) * r.source.width))) + GUTTER * 2;
      r.h = Math.max(4, Math.round(Math.min((r.v1 - r.v0) * metresPerUv * weight, (r.v1 - r.v0) * r.source.height))) + GUTTER * 2;
    }
    if (shelfPack([...boxes, paletteBox], ATLAS)) break;
    density *= 0.97;
    if (density < 1) throw new Error(`The atlas cannot fit ${boxes.length} regions even at one texel per metre`);
  }
  const atlas = { albedo: Buffer.alloc(ATLAS * ATLAS * 4), normal: Buffer.alloc(ATLAS * ATLAS * 4), surface: Buffer.alloc(ATLAS * ATLAS * 4) };
  for (const region of boxes) paintRegion(atlas, region, region.source);
  for (const { rgb, team, roughness, metallic, index } of palette.values()) {
    const x0 = paletteBox.x + (index % cellsPerRow) * CELL;
    const y0 = paletteBox.y + Math.floor(index / cellsPerRow) * CELL;
    const grey = Math.min(1, luma(...rgb) / 0.45) * TEAM_GREY;
    for (let y = y0; y < y0 + CELL; y++) {
      for (let x = x0; x < x0 + CELL; x++) {
        const o = (y * ATLAS + x) * 4;
        const out = team ? [grey, grey, grey] : rgb;
        out.forEach((c, k) => (atlas.albedo[o + k] = Math.round(c * 255)));
        atlas.albedo[o + 3] = team ? TEAM_ALPHA : 255;
        atlas.normal.writeUInt32BE(FLAT_NORMAL, o);
        atlas.surface.set([255, Math.round(roughness * 255), Math.round(metallic * 255), TONE.other], o);
      }
    }
  }
  // Rewrite UVs, each vertex into its island's region.
  for (const region of boxes) {
    const iw = region.w - GUTTER * 2;
    const ih = region.h - GUTTER * 2;
    for (const { part, vertices } of region.members) {
      for (const v of vertices) {
        const u = part.sourceUvs[v * 2];
        const t = part.sourceUvs[v * 2 + 1];
        part.uvs[v * 2] = (region.x + GUTTER + ((u - region.u0) / Math.max(1e-6, region.u1 - region.u0)) * iw) / ATLAS;
        part.uvs[v * 2 + 1] = (region.y + GUTTER + ((t - region.v0) / Math.max(1e-6, region.v1 - region.v0)) * ih) / ATLAS;
      }
    }
  }
  for (const part of flatParts) {
    part.cells.forEach((cell, v) => {
      const u = (paletteBox.x + (cell % cellsPerRow) * CELL + CELL / 2) / ATLAS;
      part.uvs.set([u, (paletteBox.y + Math.floor(cell / cellsPerRow) * CELL + CELL / 2) / ATLAS], v * 2);
    });
  }
  dilate(atlas);
  return {
    albedo: await sharp(atlas.albedo, { raw: { width: ATLAS, height: ATLAS, channels: 4 } }).webp({ quality: 90, alphaQuality: 100, smartSubsample: true }).toBuffer(),
    normal: await sharp(atlas.normal, { raw: { width: ATLAS, height: ATLAS, channels: 4 } }).removeAlpha().webp({ quality: 88 }).toBuffer(),
    surface: await sharp(atlas.surface, { raw: { width: ATLAS, height: ATLAS, channels: 4 } }).webp({ quality: 88, alphaQuality: 100 }).toBuffer(),
  };
}

/**
 * Spreads every region's edge texels over the empty atlas space in all three atlases, then fills what is left with
 * neutral values, so mipmaps never blend a region with zero alpha that the client would read as team cloth.
 */
function dilate(atlas, passes = 8) {
  const layers = [atlas.albedo, atlas.normal, atlas.surface];
  const filled = new Uint8Array(ATLAS * ATLAS);
  for (let i = 0; i < filled.length; i++) filled[i] = atlas.albedo[i * 4 + 3] === 0 ? 0 : 1;
  for (let pass = 0; pass < passes; pass++) {
    const next = filled.slice();
    for (let y = 0; y < ATLAS; y++) {
      for (let x = 0; x < ATLAS; x++) {
        const i = y * ATLAS + x;
        if (filled[i]) continue;
        const from = x > 0 && filled[i - 1] ? i - 1 : x < ATLAS - 1 && filled[i + 1] ? i + 1 : y > 0 && filled[i - ATLAS] ? i - ATLAS : y < ATLAS - 1 && filled[i + ATLAS] ? i + ATLAS : -1;
        if (from < 0) continue;
        for (const layer of layers) layer.copy(layer, i * 4, from * 4, from * 4 + 4);
        next[i] = 1;
      }
    }
    filled.set(next);
  }
  for (let i = 0; i < filled.length; i++) {
    if (filled[i]) continue;
    atlas.albedo.writeUInt32BE(0x808080ff, i * 4);
    atlas.normal.writeUInt32BE(FLAT_NORMAL, i * 4);
    atlas.surface.set([255, 204, 0, TONE.other], i * 4);
  }
}

/** Gives each (vertex, palette cell) pair its own vertex, so a vertex shared by two colours can take both cells. */
function splitByCell(part, cells) {
  const keyOf = new Map();
  const source = [];
  const indices = new Uint32Array(part.indices.length);
  part.indices.forEach((v, i) => {
    const key = part.flatNormals ? i : v * 65536 + cells[Math.floor(i / 3)];
    if (!keyOf.has(key)) {
      keyOf.set(key, source.length);
      source.push([v, cells[Math.floor(i / 3)]]);
    }
    indices[i] = keyOf.get(key);
  });
  const n = source.length;
  const out = { ...part, positions: new Float32Array(n * 3), normals: new Float32Array(n * 3), uvs: new Float32Array(n * 2), joints: new Uint16Array(n * 4), weights: new Float32Array(n * 4), colors: part.colors && new Float32Array(n * 3), indices, cells: new Int32Array(n) };
  source.forEach(([v, cell], i) => {
    if (part.colors) out.colors.set(part.colors.subarray(v * 3, v * 3 + 3), i * 3);
    out.positions.set(part.positions.subarray(v * 3, v * 3 + 3), i * 3);
    out.normals.set(part.normals.subarray(v * 3, v * 3 + 3), i * 3);
    out.joints.set(part.joints.subarray(v * 4, v * 4 + 4), i * 4);
    out.weights.set(part.weights.subarray(v * 4, v * 4 + 4), i * 4);
    out.cells[i] = cell;
  });
  // Welded props shade flat, one normal per face, like the faceted models they come from.
  if (part.flatNormals) {
    for (let i = 0; i < n; i += 3) {
      const p = (k) => out.positions.subarray((i + k) * 3, (i + k) * 3 + 3);
      const normal = normalize(cross([0, 1, 2].map((c) => p(1)[c] - p(0)[c]), [0, 1, 2].map((c) => p(2)[c] - p(0)[c])));
      for (let k = 0; k < 3; k++) out.normals.set(normal, (i + k) * 3);
    }
  }
  return out;
}

/** Decodes a source texture once, at most SOURCE_SIZE square: far above what any atlas region samples. */
async function reduced(image) {
  if (!reducedImages.has(image)) {
    const { data, info } = await sharp(image).resize(SOURCE_SIZE, SOURCE_SIZE, { fit: "fill", withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    reducedImages.set(image, { data, width: info.width, height: info.height });
  }
  return reducedImages.get(image);
}

/**
 * Copies a region's crop into the atlases (box-filtered): colour with tint and dye, team texels turned grey; normals
 * renormalised; occlusion, roughness and metalness scaled by the material's factors; and the surface's tone class.
 */
function paintRegion(atlas, region, source) {
  const tone = TONE[source.surface.tone ?? "other"];
  const iw = region.w - GUTTER * 2;
  const ih = region.h - GUTTER * 2;
  const du = (region.u1 - region.u0) / iw;
  const dv = (region.v1 - region.v0) / ih;
  for (let y = 0; y < region.h; y++) {
    for (let x = 0; x < region.w; x++) {
      // The gutter continues the source image past the island's bounds.
      const u = region.u0 + (x - GUTTER) * du;
      const v = region.v0 + (y - GUTTER) * dv;
      // The texels under this atlas texel, in a layer of any resolution.
      const box = ({ data, width, height }) => {
        const x0 = Math.max(0, Math.min(width - 1, Math.floor(u * width)));
        const y0 = Math.max(0, Math.min(height - 1, Math.floor(v * height)));
        const x1 = Math.max(x0 + 1, Math.min(width, Math.ceil((u + du) * width)));
        const y1 = Math.max(y0 + 1, Math.min(height, Math.ceil((v + dv) * height)));
        const sum = [0, 0, 0];
        for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) for (let k = 0; k < 3; k++) sum[k] += data[(sy * width + sx) * 4 + k];
        const n = (x1 - x0) * (y1 - y0) * 255;
        return sum.map((c) => c / n);
      };
      const [rgb, isTeamTexel] = texel(source, ...box(source.pixels));
      const o = ((region.y + y) * ATLAS + region.x + x) * 4;
      const out = isTeamTexel ? Array(3).fill(Math.min(1, (luma(...rgb) / source.teamMean) * TEAM_GREY)) : rgb;
      out.forEach((c, k) => (atlas.albedo[o + k] = Math.round(c * 255)));
      atlas.albedo[o + 3] = isTeamTexel ? TEAM_ALPHA : 255;
      if (source.normals) {
        const n = normalize(box(source.normals).map((c) => c * 2 - 1));
        atlas.normal.set([...n.map((c) => Math.round((c * 0.5 + 0.5) * 255)), 255], o);
      } else {
        atlas.normal.writeUInt32BE(FLAT_NORMAL, o);
      }
      const [occlusion, rough, metal] = source.orm ? box(source.orm) : [1, 1, 0];
      atlas.surface.set([Math.round(occlusion * 255), Math.round(Math.min(1, rough * source.surface.roughness) * 255), Math.round(Math.min(1, metal * source.surface.metallic) * 255), tone], o);
    }
  }
}

/** A source texel after the surface's dye and tint, and whether it is team cloth. */
function texel(source, r, g, b) {
  const { tint, team, dye } = source.surface;
  let rgb = [r, g, b];
  const isTeamTexel = isTeam(team, ...rgb);
  // A dye keeps a share of the texel's own colour and replaces the rest with its brightness in the dye colour.
  if (dye && !isTeamTexel) rgb = rgb.map((c, k) => Math.min(1, c * dye.keep + (1 - dye.keep) * luma(...rgb) * (dye.color[k] / luma(...dye.color))));
  if (tint) rgb = rgb.map((c, k) => Math.min(1, c * tint[k]));
  return [rgb, isTeamTexel];
}

/** Mean brightness of a surface's team texels inside its islands. */
function teamMean(source) {
  if (!source.surface.team) return 1;
  const { data, width, height } = source.pixels;
  let sum = 0;
  let count = 0;
  for (const island of source.islands) {
    for (let y = Math.floor(island.v0 * height); y < Math.ceil(island.v1 * height); y += 2) {
      for (let x = Math.floor(island.u0 * width); x < Math.ceil(island.u1 * width); x += 2) {
        const o = (Math.min(height - 1, y) * width + Math.min(width - 1, x)) * 4;
        const [rgb, isTeamTexel] = texel(source, data[o] / 255, data[o + 1] / 255, data[o + 2] / 255);
        if (!isTeamTexel) continue;
        sum += luma(...rgb);
        count++;
      }
    }
  }
  return count ? sum / count : 1;
}

/** A part's UV islands (triangles connected through shared vertices) with their UV bounds and areas. */
function islandsOf(part) {
  const n = part.positions.length / 3;
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  for (let i = 0; i < part.indices.length; i += 3) {
    const a = find(part.indices[i]);
    parent[find(part.indices[i + 1])] = a;
    parent[find(part.indices[i + 2])] = a;
  }
  part.sourceUvs = Float32Array.from(part.uvs);
  const byRoot = new Map();
  for (let i = 0; i < part.indices.length; i += 3) {
    const root = find(part.indices[i]);
    if (!byRoot.has(root)) byRoot.set(root, { u0: 1, v0: 1, u1: 0, v1: 0, uvArea: 0, worldArea: 0, members: [{ part, vertices: new Set() }] });
    const island = byRoot.get(root);
    const tri = [part.indices[i], part.indices[i + 1], part.indices[i + 2]];
    for (const v of tri) {
      island.members[0].vertices.add(v);
      const [u, t] = [part.uvs[v * 2], part.uvs[v * 2 + 1]];
      if (u < -0.001 || t < -0.001 || u > 1.001 || t > 1.001) throw new Error(`${part.name} wraps its UVs; give it a flat surface`);
      island.u0 = Math.min(island.u0, u);
      island.u1 = Math.max(island.u1, u);
      island.v0 = Math.min(island.v0, t);
      island.v1 = Math.max(island.v1, t);
    }
    const uv = (v) => [part.uvs[v * 2], part.uvs[v * 2 + 1], 0];
    const pos = (v) => Array.from(part.positions.subarray(v * 3, v * 3 + 3));
    const area = (p) => Math.hypot(...cross([0, 1, 2].map((c) => p[1][c] - p[0][c]), [0, 1, 2].map((c) => p[2][c] - p[0][c]))) / 2;
    island.uvArea += area(tri.map(uv));
    island.worldArea += area(tri.map(pos));
  }
  return [...byRoot.values()];
}

/** Merges overlapping islands when their joint crop wastes little, so neighbouring pieces share one region. */
function mergeIslands(islands) {
  const area = (r) => (r.u1 - r.u0) * (r.v1 - r.v0);
  const regions = islands.map((i) => ({ ...i, members: [...i.members] }));
  for (let merged = true; merged; ) {
    merged = false;
    for (let a = 0; a < regions.length && !merged; a++) {
      for (let b = a + 1; b < regions.length; b++) {
        const A = regions[a];
        const B = regions[b];
        if (A.u0 > B.u1 || B.u0 > A.u1 || A.v0 > B.v1 || B.v0 > A.v1) continue;
        const joint = { u0: Math.min(A.u0, B.u0), v0: Math.min(A.v0, B.v0), u1: Math.max(A.u1, B.u1), v1: Math.max(A.v1, B.v1) };
        if (area(joint) > 1.3 * (area(A) + area(B))) continue;
        regions[a] = { ...joint, uvArea: A.uvArea + B.uvArea, worldArea: A.worldArea + B.worldArea, members: [...A.members, ...B.members] };
        regions.splice(b, 1);
        merged = true;
        break;
      }
    }
  }
  return regions;
}

// ---------------------------------------------------------------------------------------------------------------
// Animation

/** A clip as plain key arrays per joint channel, independent of any document. */
function readClip(doc, name) {
  const animation = doc.getRoot().listAnimations().find((a) => a.getName() === name);
  if (!animation) throw new Error(`No clip ${name}`);
  const channels = [];
  for (const channel of animation.listChannels()) {
    const sampler = channel.getSampler();
    channels.push({ joint: channel.getTargetNode().getName(), path: channel.getTargetPath(), times: Array.from(sampler.getInput().getArray()), values: Array.from(sampler.getOutput().getArray()), interpolation: sampler.getInterpolation() });
  }
  return channels;
}

/**
 * Takes a clip of a same-named humanoid rig (the animation library) onto `rig`: joint rotations as authored, the pelvis
 * translation scaled by leg length, nothing else, so the rig keeps its own bone lengths. Fingers stay in their grip.
 */
export function retarget(doc, name, rig) {
  const source = new Rig(doc);
  const ratio = rig.position("pelvis")[1] / source.position("pelvis")[1];
  const rigRest = rig.rest[rig.jointOf("pelvis")].t;
  const sourceRest = source.rest[source.jointOf("pelvis")].t;
  return readClip(doc, name)
    .filter((c) => rig.index.has(c.joint) && !FINGER.test(c.joint) && (c.path === "rotation" || (c.path === "translation" && c.joint === "pelvis")))
    .map((c) => {
      if (c.path !== "translation") return c;
      const values = c.values.map((v, i) => rigRest[i % 3] + (v - sourceRest[i % 3]) * ratio);
      return { ...c, values };
    });
}

/** A clip of the rig's own document, every channel kept. */
export function ownClip(doc, name, rig) {
  return readClip(doc, name).filter((c) => rig.index.has(c.joint));
}

/** Plays clips back to back. */
export function concat(...clips) {
  const out = new Map();
  let offset = 0;
  for (const clip of clips) {
    const length = Math.max(...clip.map((c) => c.times[c.times.length - 1]));
    for (const c of clip) {
      const key = `${c.joint}/${c.path}`;
      const size = c.values.length / c.times.length;
      if (!out.has(key)) out.set(key, { ...c, times: [], values: [] });
      const target = out.get(key);
      c.times.forEach((t, i) => {
        const at = t + offset;
        if (target.times.length && at <= target.times[target.times.length - 1] + 1e-4) return;
        target.times.push(at);
        target.values.push(...c.values.slice(i * size, (i + 1) * size));
      });
    }
    offset += length;
  }
  return [...out.values()];
}

/** Holds a clip's last frame for two baked rows: the client's pose clip for corpses. */
export function lastPose(clip) {
  return clip.map((c) => {
    const size = c.values.length / c.times.length;
    const last = c.values.slice(c.values.length - size);
    return { ...c, times: [0, 1 / 30], values: [...last, ...last] };
  });
}

/** The fingers' rotations at a clip's first frame: a closed grip for every clip, since finger channels are dropped. */
export function fingerPose(doc, name) {
  const pose = new Map();
  for (const c of readClip(doc, name)) if (FINGER.test(c.joint) && c.path === "rotation") pose.set(c.joint, c.values.slice(0, 4));
  return pose;
}

// ---------------------------------------------------------------------------------------------------------------
// Output

/** Int8 normals padded to four bytes per vertex, as vertex attributes must align to four bytes. */
function normalsVec3(padded) {
  const out = new Int8Array((padded.length / 4) * 3);
  for (let v = 0; v < padded.length / 4; v++) out.set(padded.subarray(v * 4, v * 4 + 3), v * 3);
  return out;
}

/** Writes the composed character: rig nodes, one skinned primitive with the atlas, and the named clips. */
export async function writeCharacter(file, { id, rig, parts, atlas, clips, restOverrides = new Map() }) {
  const doc = new Document();
  doc.createExtension(EXTTextureWebP).setRequired(true);
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  const buffer = doc.createBuffer();
  const scene = doc.createScene(id);
  // Non-joint ancestors (armature transforms) first, then joints with their rest pose.
  let parent = null;
  let top = null;
  for (const ancestor of rig.ancestors) {
    const node = doc.createNode(ancestor.getName()).setTranslation(ancestor.getTranslation()).setRotation(ancestor.getRotation()).setScale(ancestor.getScale());
    if (parent) parent.addChild(node);
    else scene.addChild((top = node));
    parent = node;
  }
  const nodes = rig.joints.map((joint, i) => {
    const rest = rig.rest[i];
    return doc.createNode(joint.getName()).setTranslation(rest.t).setRotation(restOverrides.get(joint.getName()) ?? rest.r).setScale(rest.s);
  });
  rig.joints.forEach((joint, i) => {
    const p = rig.joints.indexOf(joint.getParentNode());
    if (p >= 0) nodes[p].addChild(nodes[i]);
    else if (parent) parent.addChild(nodes[i]);
    else scene.addChild(nodes[i]);
  });
  const ibm = new Float32Array(rig.joints.length * 16);
  rig.world.forEach((m, i) => ibm.set(invert(m), i * 16));
  const skin = doc.createSkin(id).setInverseBindMatrices(doc.createAccessor().setType("MAT4").setArray(ibm).setBuffer(buffer));
  nodes.forEach((n) => skin.addJoint(n));
  skin.setSkeleton(top ?? nodes[0]);

  // One primitive from every part, quantized: normals as bytes (KHR_mesh_quantization), UVs, joints and weights in the
  // integer forms core glTF allows. Positions stay float so the client's bounding box reads in model units.
  const total = parts.reduce((n, p) => n + p.positions.length / 3, 0);
  const positions = new Float32Array(total * 3);
  const normals = new Int8Array(total * 4);
  const uvs = new Uint16Array(total * 2);
  const joints = new Uint8Array(total * 4);
  const weights = new Uint8Array(total * 4);
  // Vertex colours (white where a part keeps its colour in the atlas) multiply the texture; glTF stores them linear.
  const colors = parts.some((p) => p.colors) ? new Uint8Array(total * 3).fill(255) : null;
  const indices = [];
  let base = 0;
  for (const part of parts) {
    positions.set(part.positions, base * 3);
    if (part.colors) colors.set(Array.from(part.colors, (c) => Math.round(Math.min(1, Math.max(0, c)) ** 2.2 * 255)), base * 3);
    for (let v = 0; v < part.positions.length / 3; v++) {
      const o = base + v;
      for (let c = 0; c < 3; c++) normals[o * 4 + c] = Math.round(part.normals[v * 3 + c] * 127);
      for (let c = 0; c < 2; c++) uvs[o * 2 + c] = Math.round(Math.min(1, Math.max(0, part.uvs[v * 2 + c])) * 65535);
      const w = Array.from(part.weights.subarray(v * 4, v * 4 + 4), (x) => Math.round(x * 255));
      w[w.indexOf(Math.max(...w))] += 255 - w.reduce((a, b) => a + b, 0);
      for (let k = 0; k < 4; k++) {
        weights[o * 4 + k] = w[k];
        joints[o * 4 + k] = w[k] > 0 ? part.joints[v * 4 + k] : 0;
      }
    }
    for (const i of part.indices) indices.push(i + base);
    base += part.positions.length / 3;
  }
  if (rig.joints.length > 255) throw new Error(`${id} has more joints than a byte holds`);
  const accessor = (type, array, normalized = false) => doc.createAccessor().setType(type).setArray(array).setNormalized(normalized).setBuffer(buffer);
  const texture = (name, image) => doc.createTexture(name).setImage(image).setMimeType("image/webp");
  // One map holds occlusion, roughness and metalness (glTF's ORM packing); its alpha is the client's tone class.
  const surface = texture("surface", atlas.surface);
  const material = doc
    .createMaterial(id)
    .setBaseColorTexture(texture("albedo", atlas.albedo))
    .setNormalTexture(texture("normal", atlas.normal))
    .setMetallicRoughnessTexture(surface)
    .setOcclusionTexture(surface)
    .setMetallicFactor(1)
    .setRoughnessFactor(1);
  const primitive = doc
    .createPrimitive()
    .setAttribute("POSITION", accessor("VEC3", positions))
    .setAttribute("NORMAL", accessor("VEC3", normalsVec3(normals), true))
    .setAttribute("TEXCOORD_0", accessor("VEC2", uvs, true))
    .setAttribute("JOINTS_0", accessor("VEC4", joints))
    .setAttribute("WEIGHTS_0", accessor("VEC4", weights, true))
    .setIndices(accessor("SCALAR", total < 65536 ? Uint16Array.from(indices) : Uint32Array.from(indices)))
    .setMaterial(material);
  if (colors) primitive.setAttribute("COLOR_0", accessor("VEC3", colors, true));
  scene.addChild(doc.createNode(id).setMesh(doc.createMesh(id).addPrimitive(primitive)).setSkin(skin));

  const byName = new Map(nodes.map((n) => [n.getName(), n]));
  for (const [name, channels] of Object.entries(clips)) {
    const animation = doc.createAnimation(name);
    for (const c of channels) {
      const type = c.path === "rotation" ? "VEC4" : "VEC3";
      const sampler = doc.createAnimationSampler().setInput(accessor("SCALAR", new Float32Array(c.times))).setOutput(accessor(type, new Float32Array(c.values))).setInterpolation(c.interpolation === "STEP" ? "STEP" : "LINEAR");
      animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(byName.get(c.joint)).setTargetPath(c.path).setSampler(sampler));
    }
  }
  await doc.transform(resample({ tolerance: 2e-4 }), prune());
  // Rotation keys as normalized shorts, which core glTF allows for rotation outputs.
  for (const animation of doc.getRoot().listAnimations()) {
    for (const channel of animation.listChannels()) {
      if (channel.getTargetPath() !== "rotation") continue;
      const output = channel.getSampler().getOutput();
      output.setArray(Int16Array.from(output.getArray(), (q) => Math.round(Math.max(-1, Math.min(1, q)) * 32767))).setNormalized(true);
    }
  }
  await io.write(file, doc);
  return { triangles: indices.length / 3, vertices: total };
}
