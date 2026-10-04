import type { GeometryBuilder, Rgb, Vec3 } from "./building-geometry";
import { BURLAP, DARK_TIMBER, IRON, OAK, WHEAT, random } from "./building-parts";

// Yard clutter round the buildings: stores, tools and livestock feed, all small and low.

const STAVES: Rgb = [0.8, 0.62, 0.45];
const LOGS: Rgb = [0.95, 0.76, 0.56];
const HAY: Rgb = [1.05, 0.95, 0.7];

export function barrel(b: GeometryBuilder, x: number, z: number, radius = 0.12, height = 0.32): void {
  b.cylinder(x, z, radius * 0.92, 0, height, 9, "timber", { tint: STAVES });
  b.cylinder(x, z, radius, height * 0.18, height * 0.26, 9, "iron", { tint: IRON, top: false });
  b.cylinder(x, z, radius, height * 0.74, height * 0.82, 9, "iron", { tint: IRON, top: false });
}

export function crate(b: GeometryBuilder, x: number, z: number, size = 0.24, y = 0, yaw = 0): void {
  b.at(x, y, z, yaw, () => {
    b.box([-size / 2, 0, -size / 2], [size / 2, size, size / 2], "planks");
    for (const s of [-1, 1]) {
      b.box([-size / 2 - 0.01, 0, s * size * 0.42 - 0.02], [size / 2 + 0.01, size, s * size * 0.42 + 0.02], "timber", { tint: DARK_TIMBER });
    }
  });
}

export function sack(b: GeometryBuilder, x: number, z: number, yaw = 0): void {
  b.at(x, 0, z, yaw, () => {
    b.cylinder(0, 0, 0.1, 0, 0.18, 7, "paint", { tint: BURLAP, topRadius: 0.06 });
  });
}

/** Round logs stacked in a pyramid, laid along X. */
export function lumber(b: GeometryBuilder, x: number, z: number, length = 0.6, rows = 2): void {
  const r = 0.045;
  for (let row = 0; row < rows; row++) {
    const count = rows + 1 - row;
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * r * 2;
      const y = r + row * r * 1.7;
      b.tube([x - length / 2, y, z + offset], [x + length / 2, y, z + offset], r, 6, "timber", { tint: LOGS });
    }
  }
}

export function stoneBlocks(b: GeometryBuilder, x: number, z: number, seed: number): void {
  const next = random(seed);
  for (let i = 0; i < 4; i++) {
    const s = 0.12 + next() * 0.08;
    const y = i === 3 ? 0.14 : 0;
    b.at(x + (i % 2) * 0.18 - 0.09 + (i === 3 ? 0.09 : 0), y, z + Math.floor(i / 2) * 0.16 - 0.08, next() * 0.6, () => b.box([-s / 2, 0, -s * 0.4], [s / 2, s * 0.75, s * 0.4], "dressed"));
  }
}

/** A round bale of hay lying on its side. */
export function hayBale(b: GeometryBuilder, x: number, z: number, yaw = 0, radius = 0.13): void {
  b.at(x, 0, z, yaw, () => b.tube([-0.12, radius, 0], [0.12, radius, 0], radius, 8, "thatch", { tint: HAY }));
}

/** A conical rick of loose hay. */
export function haystack(b: GeometryBuilder, x: number, z: number, radius = 0.22, height = 0.5): void {
  b.cylinder(x, z, radius, 0, height * 0.45, 9, "thatch", { tint: HAY, topRadius: radius * 1.05, top: false });
  b.cone(x, z, radius * 1.05, height * 0.45, height, 9, "thatch", { tint: HAY });
}

/** A two-wheeled handcart, optionally loaded with logs or sacks. */
export function cart(b: GeometryBuilder, x: number, z: number, yaw: number, load: "logs" | "sacks" | "none" = "none"): void {
  b.at(x, 0, z, yaw, () => {
    b.box([-0.24, 0.13, -0.14], [0.2, 0.17, 0.14], "planks", { across: true, bottom: true });
    for (const s of [-1, 1]) b.box([-0.24, 0.17, s * 0.14 - 0.015], [0.2, 0.26, s * 0.14 + 0.015], "planks", { across: true });
    for (const s of [-1, 1]) b.tube([0, 0.12, s * 0.16], [0, 0.12, s * 0.2], 0.12, 8, "timber", { tint: DARK_TIMBER });
    for (const s of [-1, 1]) b.beam([0.2, 0.15, s * 0.1], [0.5, 0.05, s * 0.1], 0.03, "timber", { tint: DARK_TIMBER });
    if (load === "logs") for (const dz of [-0.06, 0.06]) b.tube([-0.22, 0.22, dz], [0.18, 0.22, dz], 0.05, 6, "timber", { tint: LOGS });
    if (load === "sacks") for (const dx of [-0.12, 0.08]) b.cylinder(dx, 0, 0.08, 0.17, 0.3, 7, "paint", { tint: BURLAP, topRadius: 0.05 });
  });
}

/** A stone well with a little shingled roof and a winch. */
export function well(b: GeometryBuilder, x: number, z: number): void {
  b.at(x, 0, z, 0, () => {
    b.cylinder(0, 0, 0.2, 0, 0.26, 10, "stone", { top: false });
    b.cylinder(0, 0, 0.15, 0.2, 0.25, 10, "paint", { tint: [0.02, 0.03, 0.04] });
    for (const s of [-1, 1]) b.beam([s * 0.18, 0.2, 0], [s * 0.18, 0.62, 0], 0.04, "timber", { tint: DARK_TIMBER });
    b.tube([-0.2, 0.48, 0], [0.2, 0.48, 0], 0.03, 5, "timber", { tint: OAK });
    for (const s of [-1, 1]) b.slab([[-0.26, 0.74, 0], [0.26, 0.74, 0], [0.26, 0.58, s * 0.2], [-0.26, 0.58, s * 0.2]], [[0, 0], [0.52, 0], [0.52, 0.25], [0, 0.25]], 0.025, "planks", {});
  });
}

/** A straw training dummy on a post. */
export function dummy(b: GeometryBuilder, x: number, z: number): void {
  b.beam([x, 0, z], [x, 0.62, z], 0.05, "timber", { tint: DARK_TIMBER });
  b.beam([x - 0.2, 0.46, z], [x + 0.2, 0.46, z], 0.04, "timber", { tint: DARK_TIMBER });
  b.cylinder(x, z, 0.09, 0.22, 0.5, 7, "paint", { tint: BURLAP });
  b.cylinder(x, z, 0.06, 0.52, 0.64, 6, "paint", { tint: BURLAP });
}

export function weaponRack(b: GeometryBuilder, x: number, z: number): void {
  b.beam([x - 0.25, 0, z], [x - 0.25, 0.5, z], 0.04, "timber", { tint: DARK_TIMBER });
  b.beam([x + 0.25, 0, z], [x + 0.25, 0.5, z], 0.04, "timber", { tint: DARK_TIMBER });
  b.beam([x - 0.28, 0.42, z], [x + 0.28, 0.42, z], 0.035, "timber", { tint: DARK_TIMBER });
  for (let i = 0; i < 5; i++) {
    const sx = x - 0.18 + i * 0.09;
    b.beam([sx, 0.02, z + 0.05], [sx + 0.02, 0.62, z - 0.02], 0.018, "timber");
    b.beam([sx + 0.02, 0.62, z - 0.02], [sx + 0.024, 0.7, z - 0.03], 0.03, "iron", { tint: IRON });
  }
}

/** A straw archery butt on a trestle, facing +Z, with painted rings. */
export function target(b: GeometryBuilder, x: number, z: number): void {
  b.at(x, 0, z, 0, () => {
    for (const s of [-1, 1]) b.beam([s * 0.14, 0, -0.12], [s * 0.1, 0.42, 0], 0.03, "timber", { tint: DARK_TIMBER });
    b.tube([0, 0.34, -0.04], [0, 0.34, 0.04], 0.2, 10, "thatch", { tint: HAY, caps: false });
    const rings: [number, Rgb][] = [[0.2, [0.85, 0.83, 0.78]], [0.14, [0.6, 0.06, 0.04]], [0.08, [0.85, 0.83, 0.78]], [0.035, [0.6, 0.06, 0.04]]];
    rings.forEach(([radius, tint], i) => {
      const points = Array.from({ length: 10 }, (_, k): Vec3 => [Math.cos((k / 10) * Math.PI * 2) * radius, 0.34 + Math.sin((k / 10) * Math.PI * 2) * radius, 0.041 + i * 0.002]);
      b.face(points, points.map((p) => [p[0], -p[1]]), [0, 0, 1], "paint", { tint });
    });
  });
}

/** A scarecrow in a team-coloured coat. */
export function scarecrow(b: GeometryBuilder, x: number, z: number): void {
  b.beam([x, 0, z], [x, 0.62, z], 0.035, "timber", { tint: DARK_TIMBER });
  b.beam([x - 0.2, 0.46, z], [x + 0.2, 0.46, z], 0.03, "timber", { tint: DARK_TIMBER });
  b.box([x - 0.08, 0.26, z - 0.05], [x + 0.08, 0.48, z + 0.05], "cloth");
  b.box([x - 0.19, 0.42, z - 0.035], [x + 0.19, 0.49, z + 0.035], "cloth");
  b.cylinder(x, z, 0.055, 0.49, 0.6, 6, "paint", { tint: BURLAP });
  b.cylinder(x, z, 0.1, 0.6, 0.62, 7, "thatch", { tint: WHEAT, top: true });
  b.cone(x, z, 0.06, 0.62, 0.7, 6, "thatch", { tint: WHEAT });
}

/** A split-rail fence through `points` (x, z), with posts at every point. */
export function fence(b: GeometryBuilder, points: [number, number][], height = 0.3): void {
  for (const [x, z] of points) b.beam([x, 0, z], [x, height + 0.04, z], 0.045, "timber", { tint: DARK_TIMBER });
  for (let i = 0; i + 1 < points.length; i++) {
    const [x0, z0] = points[i]!;
    const [x1, z1] = points[i + 1]!;
    for (const y of [height * 0.45, height * 0.9]) b.beam([x0, y, z0], [x1, y, z1], 0.03, "timber", { tint: OAK });
  }
}

/** Split firewood stacked against a wall, ends toward the camera. */
export function woodpile(b: GeometryBuilder, x: number, z: number, width = 0.4, rows = 3): void {
  const r = 0.04;
  for (let row = 0; row < rows; row++) {
    const count = Math.round(width / (r * 2));
    for (let i = 0; i < count; i++) {
      const lx = x - width / 2 + r + i * r * 2 + (row % 2) * r * 0.5;
      const y = r + row * r * 1.75;
      b.tube([lx, y, z - 0.12], [lx, y, z + 0.12], r, 5, "timber", { tint: LOGS });
    }
  }
}
