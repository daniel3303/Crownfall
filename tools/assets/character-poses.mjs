// Composition helpers beyond one rig and its library clips: a rider joined to a mount's skeleton, poses aimed in world
// space (riding legs), grips aimed for a clip's pose, clips limited to some joints, and smoothed normals for faceted
// creatures.
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

/**
 * A held item's grip with its bind-pose directions chosen so that at `time` in `clip` the item points along world
 * `dir` with its flat side toward world `up`: an upright staff or bow in the pose the unit mostly holds.
 */
export function aimedGrip(rig, clip, grip, { time = 0, dir, up }) {
  const locals = new Map();
  for (const c of clip) {
    if (c.path !== "rotation") continue;
    let i = 0;
    while (i + 1 < c.times.length && c.times[i + 1] <= time) i++;
    locals.set(c.joint, c.values.slice(i * 4, i * 4 + 4));
  }
  const world = new Map();
  const rotation = (name) => {
    if (world.has(name)) return world.get(name);
    const i = rig.jointOf(name);
    const parentNode = rig.joints[i].getParentNode();
    const parent = parentNode && rig.index.has(parentNode.getName()) ? rotation(parentNode.getName()) : qFromMatrix(parentNode?.getWorldMatrix?.() ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    world.set(name, qmul(parent, locals.get(name) ?? rig.rest[i].r));
    return world.get(name);
  };
  // Undo how far the hand has turned from the bind pose by then.
  const back = qinv(qmul(rotation(grip.joint), qinv(qFromMatrix(rig.world[rig.jointOf(grip.joint)]))));
  return { ...grip, dir: rotate(back, dir), up: rotate(back, up) };
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
// Held items through a clip

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
/** Keys per second of a turned joint's channel. */
const TURN_RATE = 30;

/** A channel's value at `time`: linear between keys (rotations normalized), held past either end. */
function sample({ times, values }, time) {
  const size = values.length / times.length;
  let i = 0;
  while (i + 1 < times.length && times[i + 1] <= time) i++;
  const a = values.slice(i * size, i * size + size);
  if (i + 1 >= times.length || time <= times[i]) return a;
  const b = values.slice((i + 1) * size, (i + 2) * size);
  const f = (time - times[i]) / (times[i + 1] - times[i]);
  if (size !== 4) return a.map((v, k) => v + (b[k] - v) * f);
  const sign = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  return unit(a.map((v, k) => v + (sign * b[k] - v) * f));
}

/** A column-major matrix from a translation, a rotation and a scale. */
function trs([tx, ty, tz], [x, y, z, w], [sx, sy, sz]) {
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

/** Each joint's world matrix in `clip` at `time`; joints the clip leaves alone keep their rest transform. */
function posed(rig, clip, time) {
  const channels = new Map(clip.map((c) => [`${c.joint}/${c.path}`, c]));
  const world = new Map();
  const matrix = (name) => {
    if (world.has(name)) return world.get(name);
    const i = rig.jointOf(name);
    const parentNode = rig.joints[i].getParentNode();
    const parent = parentNode && rig.index.has(parentNode.getName()) ? matrix(parentNode.getName()) : (parentNode?.getWorldMatrix?.() ?? IDENTITY);
    const at = (path, rest) => (channels.has(`${name}/${path}`) ? sample(channels.get(`${name}/${path}`), time) : rest);
    world.set(name, multiply(parent, trs(at("translation", rig.rest[i].t), at("rotation", rig.rest[i].r), rig.rest[i].s)));
    return world.get(name);
  };
  return matrix;
}

/** The clip with `joint` re-keyed so its world rotation is `turn(worldMatrix)` in every frame; its parents move as before. */
function turned(rig, clip, joint, turn) {
  const length = clipLength(clip);
  const parent = rig.joints[rig.jointOf(joint)].getParentNode().getName();
  const frames = Math.max(1, Math.round(length * TURN_RATE));
  const times = [];
  const values = [];
  let last = null;
  for (let k = 0; k <= frames; k++) {
    const time = (k / frames) * length;
    const world = posed(rig, clip, time);
    let q = qmul(qinv(qFromMatrix(world(parent))), turn(world(joint)));
    // Neighbouring keys on the same hemisphere, so the blend between them takes the short way round.
    if (last && q[0] * last[0] + q[1] * last[1] + q[2] * last[2] + q[3] * last[3] < 0) q = q.map((v) => -v);
    times.push(time);
    values.push(...q);
    last = q;
  }
  return [...clip.filter((c) => !(c.joint === joint && c.path === "rotation")), { joint, path: "rotation", times, values, interpolation: "LINEAR" }];
}

/** The clip with `joint` keeping its world rotation from the first frame of `reference`: a staff held upright on the run. */
export function steadyJoint(rig, clip, joint, reference) {
  const held = qFromMatrix(posed(rig, reference, 0)(joint));
  return turned(rig, clip, joint, () => held);
}

/** Largest number of an item's points `groundedGrip` tests per frame. */
const GROUND_POINTS = 240;
/** An item's points this close to the grip turn with the fist, so no tipping lifts them; `groundedGrip` leaves them out. */
const IN_FIST = 0.1;

/**
 * The clip with the gripping joint turned, frame by frame, just enough that the held item (`points`, bind space) stays
 * above the ground: a staff that would dig in as its bearer falls tips toward level instead, its foot sliding along.
 */
export function groundedGrip(rig, clip, grip, points, clearance = 0.03) {
  const bind = qFromMatrix(rig.world[rig.jointOf(grip.joint)]);
  const pivot = rig.position(grip.joint);
  const step = Math.max(1, Math.ceil(points.length / 3 / GROUND_POINTS));
  const offsets = [];
  for (let v = 0; v < points.length / 3; v += step) {
    const offset = [0, 1, 2].map((c) => points[v * 3 + c] - pivot[c]);
    if (Math.hypot(...offset) > IN_FIST) offsets.push(offset);
  }
  // The rise the item was last drawn at, kept through frames where no tipping clears the ground.
  let last = null;
  return turned(rig, clip, grip.joint, (m) => {
    const hand = qFromMatrix(m);
    const turn = qmul(hand, qinv(bind));
    const lowest = (q) => m[13] + Math.min(...offsets.map((o) => rotate(q, o)[1]));
    const along = unit(rotate(turn, grip.dir));
    if (lowest(turn) >= clearance) {
      last = along[1];
      return hand;
    }
    const level = Math.hypot(along[0], along[2]) > 1e-6 ? unit([along[0], 0, along[2]]) : [0, 0, 1];
    // The item's direction with rise r (its y), keeping its heading.
    const toward = (rise) => qFromTo(along, [level[0] * Math.sqrt(1 - rise * rise), rise, level[2] * Math.sqrt(1 - rise * rise)]);
    const clear = (rise) => lowest(qmul(toward(rise), turn)) >= clearance;
    // The rise nearest the clip's own that clears the ground, refined between grid steps. When none does, the last one
    // drawn or the clip's own, whichever stays higher.
    const grid = Array.from({ length: 41 }, (_, k) => -1 + k / 20);
    const fits = grid.filter(clear);
    let rise;
    if (fits.length === 0) {
      const height = (r) => lowest(qmul(toward(r), turn));
      rise = last !== null && height(last) > height(along[1]) ? last : along[1];
    } else {
      rise = fits.reduce((best, r) => (Math.abs(r - along[1]) < Math.abs(best - along[1]) ? r : best));
      let out = Math.max(-1, Math.min(1, rise + (along[1] > rise ? 0.05 : -0.05)));
      if (!clear(out)) {
        for (let k = 0; k < 12; k++) {
          const mid = (rise + out) / 2;
          if (clear(mid)) rise = mid;
          else out = mid;
        }
      }
    }
    last = rise;
    return qmul(toward(rise), hand);
  });
}

/** The clip between `from` and `to` seconds, starting at 0. */
export function span(clip, from, to) {
  return clip.map((c) => {
    const times = [0];
    const values = [...sample(c, from)];
    const size = values.length;
    c.times.forEach((t, i) => {
      if (t <= from || t >= to) return;
      times.push(t - from);
      values.push(...c.values.slice(i * size, (i + 1) * size));
    });
    times.push(to - from);
    values.push(...sample(c, to));
    return { ...c, times, values };
  });
}

/**
 * The clip easing out of `pose` (each channel's last key) over its first `seconds`: every channel starts at the pose and
 * blends into its own motion, so the clip follows another back to back without a pop.
 */
export function easedFrom(clip, pose, seconds) {
  const start = new Map(pose.map((c) => [`${c.joint}/${c.path}`, c.values.slice(c.values.length - c.values.length / c.times.length)]));
  const length = clipLength(clip);
  return clip.map((c) => {
    const from = start.get(`${c.joint}/${c.path}`);
    if (!from) return c;
    const first = sample(c, 0);
    const rotation = from.length === 4;
    // The pose's offset from the clip's first frame, faded out with a smoothstep.
    const offset = rotation ? qmul(from, qinv(first)) : from.map((v, k) => v - first[k]);
    const shifted = (time, value) => {
      const fade = Math.max(0, 1 - time / seconds);
      const w = fade * fade * (3 - 2 * fade);
      if (!rotation) return value.map((v, k) => v + offset[k] * w);
      const sign = offset[3] < 0 ? -1 : 1;
      return qmul(unit(offset.map((v, k) => (k === 3 ? 1 - w + sign * v * w : sign * v * w))), value);
    };
    // Keys at the turn rate through the fade, so it is smooth whatever the clip's own keys.
    const times = [];
    for (let k = 0, n = Math.max(1, Math.round(seconds * TURN_RATE)); k <= n; k++) times.push((k / n) * Math.min(seconds, length));
    for (const t of c.times) if (t > seconds) times.push(t);
    const values = times.flatMap((t) => shifted(t, sample(c, t)));
    return { ...c, times, values };
  });
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
