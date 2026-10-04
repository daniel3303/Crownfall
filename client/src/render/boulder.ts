import type { Vec3 } from "./building-geometry";
import { normalize } from "./building-geometry";
import { random } from "./building-parts";

export interface Shape {
  points: Vec3[];
  normals: Vec3[];
  uvs: [number, number][];
  indices: number[];
}

const PHI = (1 + Math.sqrt(5)) / 2;
const ICOSAHEDRON: Vec3[] = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
].map((p) => normalize(p as Vec3));
const FACES = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

/** A unit icosphere, subdivided `levels` times. */
function icosphere(levels: number): { points: Vec3[]; indices: number[] } {
  const points = ICOSAHEDRON.map((p) => [...p] as Vec3);
  let faces = FACES.map((f) => [...f]);
  const midpoints = new Map<string, number>();
  const midpoint = (a: number, b: number): number => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const known = midpoints.get(key);
    if (known !== undefined) return known;
    const [pa, pb] = [points[a]!, points[b]!];
    points.push(normalize([(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2]));
    midpoints.set(key, points.length - 1);
    return points.length - 1;
  };
  for (let level = 0; level < levels; level++) {
    const next: number[][] = [];
    for (const [a, b, c] of faces as [number, number, number][]) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  return { points, indices: faces.flat() };
}

/**
 * A weathered boulder `radius` wide and `height` tall, sitting on the ground: an icosphere pushed out by a few random
 * lobes and cut by fracture planes, flattened underneath, with texture coordinates projected along each normal.
 */
export function boulderShape(radius: number, height: number, seed: number, detail = 2): Shape {
  const next = random(seed);
  const { points: sphere, indices } = icosphere(detail);
  const lobes = Array.from({ length: 6 }, () => ({ dir: normalize([next() - 0.5, next() - 0.5, next() - 0.5]), amount: (next() - 0.4) * 0.5 }));
  // Fracture planes shear the lumps into flat faces and sharp edges, the way split rock looks.
  const cuts = Array.from({ length: 7 }, () => ({ dir: normalize([next() - 0.5, next() * 0.8 - 0.1, next() - 0.5]), offset: 0.62 + next() * 0.25 }));
  const stretch = 0.8 + next() * 0.4;
  const points = sphere.map(([x, y, z]): Vec3 => {
    let r = 1;
    for (const { dir, amount } of lobes) r += amount * Math.max(0, x * dir[0] + y * dir[1] + z * dir[2]) ** 3;
    for (const { dir, offset } of cuts) {
      const along = x * dir[0] + y * dir[1] + z * dir[2];
      if (along * r > offset) r = offset / along;
    }
    const ground = y < -0.2 ? -0.2 + (y + 0.2) * 0.15 : y;
    return [x * r * radius * stretch, (ground + 0.23) * r * height * 0.82, z * r * radius];
  });
  const normals: Vec3[] = points.map(() => [0, 0, 0]);
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i]!, indices[i + 1]!, indices[i + 2]!];
    const [pa, pb, pc] = [points[a]!, points[b]!, points[c]!];
    const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    let n: Vec3 = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    // Icosphere faces wind consistently; orient each by the sphere direction so the sum points outward.
    const out = sphere[a]!;
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) n = [-n[0], -n[1], -n[2]];
    for (const index of [a, b, c]) {
      normals[index]![0] += n[0];
      normals[index]![1] += n[1];
      normals[index]![2] += n[2];
    }
  }
  const unit = normals.map((n) => normalize(n));
  const uvs = points.map((p, i): [number, number] => {
    const [nx, ny, nz] = unit[i]!.map(Math.abs) as Vec3;
    if (ny >= nx && ny >= nz) return [p[0], p[2]];
    return nx >= nz ? [p[2], -p[1]] : [p[0], -p[1]];
  });
  return { points, normals: unit, uvs, indices };
}
