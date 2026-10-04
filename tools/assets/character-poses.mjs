// Composition helpers beyond one rig and its library clips: a rider joined to a mount's skeleton, poses aimed in world
// space (riding legs, a bow draw), clips limited to some joints, and smoothed normals for faceted creatures.
import { Document } from "@gltf-transform/core";
import { invert, multiply, Rig } from "./character-kit.mjs";

// ---------------------------------------------------------------------------------------------------------------
// Quaternions as [x, y, z, w]

export const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
export const qinv = (q) => [-q[0], -q[1], -q[2], q[3]];
const unit = (v) => {
  const l = Math.hypot(...v) || 1;
  return v.map((x) => x / l);
};

/** The shortest rotation taking direction `from` onto direction `to`. */
export function qFromTo(from, to) {
  const u = unit(from);
  const v = unit(to);
  const d = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  if (d < -0.999999) {
    const axis = unit(Math.abs(u[0]) < 0.9 ? [0, -u[2], u[1]] : [-u[2], 0, u[0]]);
    return [...axis, 0];
  }
  return unit([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0], 1 + d]);
}

/** A rotation about `axis` by `angle` radians. */
export function qAxis(axis, angle) {
  const a = unit(axis);
  const s = Math.sin(angle / 2);
  return [a[0] * s, a[1] * s, a[2] * s, Math.cos(angle / 2)];
}

/** The rotation of a column-major 4x4 matrix, its scale removed. */
export function qFromMatrix(m) {
  const sx = Math.hypot(m[0], m[1], m[2]);
  const sy = Math.hypot(m[4], m[5], m[6]);
  const sz = Math.hypot(m[8], m[9], m[10]);
  const M = (row, col) => m[col * 4 + row] / [sx, sy, sz][col];
  const trace = M(0, 0) + M(1, 1) + M(2, 2);
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return unit([(M(2, 1) - M(1, 2)) / s, (M(0, 2) - M(2, 0)) / s, (M(1, 0) - M(0, 1)) / s, s / 4]);
  }
  if (M(0, 0) > M(1, 1) && M(0, 0) > M(2, 2)) {
    const s = Math.sqrt(1 + M(0, 0) - M(1, 1) - M(2, 2)) * 2;
    return unit([s / 4, (M(0, 1) + M(1, 0)) / s, (M(0, 2) + M(2, 0)) / s, (M(2, 1) - M(1, 2)) / s]);
  }
  if (M(1, 1) > M(2, 2)) {
    const s = Math.sqrt(1 + M(1, 1) - M(0, 0) - M(2, 2)) * 2;
    return unit([(M(0, 1) + M(1, 0)) / s, s / 4, (M(1, 2) + M(2, 1)) / s, (M(0, 2) - M(2, 0)) / s]);
  }
  const s = Math.sqrt(1 + M(2, 2) - M(0, 0) - M(1, 1)) * 2;
  return unit([(M(0, 2) + M(2, 0)) / s, (M(1, 2) + M(2, 1)) / s, s / 4, (M(1, 0) - M(0, 1)) / s]);
}

// ---------------------------------------------------------------------------------------------------------------
// Poses

const sub = (a, b) => a.map((v, i) => v - b[i]);
const add = (a, b) => a.map((v, i) => v + b[i]);
const scaled = (a, k) => a.map((v) => v * k);
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function rotate(q, v) {
  const p = qmul(qmul(q, [...v, 0]), qinv(q));
  return [p[0], p[1], p[2]];
}

/**
 * A pose built in world space from the rig's rest pose: turn joints, point bones along directions, or reach a point
 * with a two-bone chain. Each step sees the joints posed before it; unposed joints keep their rest angle to their parent.
 */
export class Pose {
  constructor(rig) {
    this.rig = rig;
    this.world = new Map();
  }

  restRotation(name) {
    return qFromMatrix(this.rig.world[this.rig.jointOf(name)]);
  }

  parent(name) {
    const node = this.rig.joints[this.rig.jointOf(name)].getParentNode();
    return node && this.rig.index.has(node.getName()) ? node.getName() : null;
  }

  /** The joint's posed world rotation. */
  rotation(name) {
    if (this.world.has(name)) return this.world.get(name);
    const parent = this.parent(name);
    if (!parent) return this.restRotation(name);
    return qmul(this.change(parent), this.restRotation(name));
  }

  /** How far the joint has turned from rest, in world space. */
  change(name) {
    return qmul(this.rotation(name), qinv(this.restRotation(name)));
  }

  /** The joint's posed world position. */
  position(name) {
    const parent = this.parent(name);
    if (!parent) return this.rig.position(name);
    return add(this.position(parent), rotate(this.change(parent), sub(this.rig.position(name), this.rig.position(parent))));
  }

  /** Turns the joint, and so everything below it, by `angle` radians about a world axis. */
  turn(name, axis, angle) {
    this.world.set(name, qmul(qAxis(axis, angle), this.rotation(name)));
    return this;
  }

  /** Points the bone from `name` to `child` along a world direction. */
  aim(name, child, direction) {
    const along = sub(this.position(child), this.position(name));
    this.world.set(name, qmul(qFromTo(along, direction), this.rotation(name)));
    return this;
  }

  /** Bends `upper` and `lower` so `end` lands on `target`, the middle joint bowing toward `hint` (two-bone IK). */
  reach(upper, lower, end, target, hint) {
    const start = this.position(upper);
    const a = Math.hypot(...sub(this.position(lower), start));
    const b = Math.hypot(...sub(this.position(end), this.position(lower)));
    const toTarget = sub(target, start);
    const d = Math.min(a + b - 1e-4, Math.max(Math.abs(a - b) + 1e-4, Math.hypot(...toTarget)));
    const u = unit(toTarget);
    const side = unit(sub(hint, scaled(u, dot3(hint, u))));
    const along = (a * a - b * b + d * d) / (2 * d);
    const middle = add(start, add(scaled(u, along), scaled(side, Math.sqrt(Math.max(0, a * a - along * along)))));
    this.aim(upper, lower, sub(middle, start));
    return this.aim(lower, end, sub(add(start, scaled(u, d)), middle));
  }

  /** Local rotations of every posed joint, as a clip or a rest override wants them. */
  locals() {
    const out = new Map();
    for (const name of this.world.keys()) {
      const parent = this.parent(name);
      const parentNode = this.rig.joints[this.rig.jointOf(name)].getParentNode();
      const parentWorld = parent ? this.rotation(parent) : qFromMatrix(parentNode?.getWorldMatrix() ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      out.set(name, qmul(qinv(parentWorld), this.world.get(name)));
    }
    return out;
  }
}

/** A clip holding `pose` (joint → local rotation) for `length` seconds. */
export function poseClip(pose, length) {
  return [...pose].map(([joint, q]) => ({ joint, path: "rotation", times: [0, length], values: [...q, ...q], interpolation: "LINEAR" }));
}

/** The clip's channels for the joints `keep` accepts. */
export const onlyJoints = (clip, keep) => clip.filter((c) => keep(c.joint));

/** Every channel frozen at time `at` (one key), for a held pose. */
export function stillFrame(clip, at = 0) {
  return clip.map((c) => {
    const size = c.values.length / c.times.length;
    let i = 0;
    while (i + 1 < c.times.length && c.times[i + 1] <= at) i++;
    return { ...c, times: [0], values: c.values.slice(i * size, (i + 1) * size) };
  });
}

/** The clip's length in seconds. */
export const clipLength = (clip) => Math.max(0, ...clip.map((c) => c.times[c.times.length - 1]));

/** Plays channel sets together: single-key (held) channels stretch over the longest set. */
export function layer(...clips) {
  const length = Math.max(1 / 30, ...clips.map(clipLength));
  return clips.flat().map((c) => (c.times.length === 1 ? { ...c, times: [0, length], values: [...c.values, ...c.values] } : c));
}

// ---------------------------------------------------------------------------------------------------------------
// Mounts

/**
 * One skeleton for a rider on a mount: the rider's top joint hangs from the mount's `joint`, scaled by `scale` and
 * placed so the rider's pelvis sits at `seat` (mount space). Mount joints named like rider joints are renamed with
 * `prefix` in the mount document, so its meshes and clips keep binding to the right bones.
 */
export function mountRig(mountDoc, riderDoc, { joint, seat, scale, prefix = "Mount_" }) {
  const riderNames = new Set(new Rig(riderDoc).names);
  for (const node of mountDoc.getRoot().listNodes()) if (riderNames.has(node.getName())) node.setName(prefix + node.getName());
  const mount = new Rig(mountDoc);
  const rider = new Rig(riderDoc);
  const doc = new Document();
  const scene = doc.createScene("mounted");
  const clone = (n) => doc.createNode(n.getName()).setTranslation(n.getTranslation()).setRotation(n.getRotation()).setScale(n.getScale());
  let top = null;
  for (const ancestor of mount.ancestors) {
    const node = clone(ancestor);
    if (top) top.addChild(node);
    else scene.addChild(node);
    top = node;
  }
  const copies = new Map([...mount.joints, ...rider.joints].map((j) => [j, clone(j)]));
  for (const j of mount.joints) (copies.get(j.getParentNode()) ?? top).addChild(copies.get(j));
  const riderTop = rider.joints.find((j) => !rider.joints.includes(j.getParentNode()));
  for (const j of rider.joints) if (j !== riderTop) copies.get(j.getParentNode()).addChild(copies.get(j));
  // Pelvis on the seat: scale about the rider's origin, then move; the top joint keeps its own rest rotation.
  const pelvis = rider.position("pelvis");
  const place = [scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, seat[0] - pelvis[0] * scale, seat[1] - pelvis[1] * scale, seat[2] - pelvis[2] * scale, 1];
  const local = multiply(invert(mount.world[mount.jointOf(joint)]), multiply(place, rider.world[rider.jointOf(riderTop.getName())]));
  const det = local[0] * (local[5] * local[10] - local[6] * local[9]) - local[4] * (local[1] * local[10] - local[2] * local[9]) + local[8] * (local[1] * local[6] - local[2] * local[5]);
  const s = Math.cbrt(Math.abs(det));
  copies.get(mount.joints[mount.jointOf(joint)]).addChild(copies.get(riderTop).setTranslation([local[12], local[13], local[14]]).setRotation(qFromMatrix(local)).setScale([s, s, s]));
  const skin = doc.createSkin("mounted");
  for (const j of [...mount.joints, ...rider.joints]) skin.addJoint(copies.get(j));
  return { rig: new Rig(doc), riderTop: riderTop.getName(), riderJoints: new Set(rider.names), mountJoints: new Set(mount.names) };
}

// ---------------------------------------------------------------------------------------------------------------
// Geometry

/** Smooth normals across faces meeting at under `crease` degrees, for faceted (one vertex per face corner) creatures. */
export function smoothNormals(part, crease = 70) {
  const { positions, indices } = part;
  const faces = indices.length / 3;
  const faceNormals = new Float32Array(faces * 3);
  for (let f = 0; f < faces; f++) {
    const [a, b, c] = [0, 1, 2].map((k) => indices[f * 3 + k] * 3);
    const u = [0, 1, 2].map((k) => positions[b + k] - positions[a + k]);
    const w = [0, 1, 2].map((k) => positions[c + k] - positions[a + k]);
    // Unnormalized: larger faces weigh more.
    faceNormals.set([u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], f * 3);
  }
  const key = (v) => `${Math.round(positions[v * 3] * 1e4)},${Math.round(positions[v * 3 + 1] * 1e4)},${Math.round(positions[v * 3 + 2] * 1e4)}`;
  const facesAt = new Map();
  for (let f = 0; f < faces; f++) {
    for (let k = 0; k < 3; k++) {
      const at = key(indices[f * 3 + k]);
      if (!facesAt.has(at)) facesAt.set(at, []);
      facesAt.get(at).push(f);
    }
  }
  const limit = Math.cos((crease * Math.PI) / 180);
  const normal = (f) => unit([faceNormals[f * 3], faceNormals[f * 3 + 1], faceNormals[f * 3 + 2]]);
  const normals = new Float32Array(part.normals.length);
  for (let f = 0; f < faces; f++) {
    const own = normal(f);
    for (let k = 0; k < 3; k++) {
      const v = indices[f * 3 + k];
      const sum = [0, 0, 0];
      for (const g of facesAt.get(key(v))) {
        const n = normal(g);
        if (n[0] * own[0] + n[1] * own[1] + n[2] * own[2] < limit) continue;
        for (let c = 0; c < 3; c++) sum[c] += faceNormals[g * 3 + c];
      }
      normals.set(unit(sum), v * 3);
    }
  }
  return { ...part, normals };
}
