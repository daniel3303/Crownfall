/**
 * Babylon-free mesh data for the procedural buildings, so every recipe can be checked in unit tests without WebGL.
 * Model space: y up, the footprint centred on the origin, the front facing +Z.
 */

/** Photo-scanned surfaces from tools/assets/materials.mjs, in its order. */
const BASE_MATERIALS = ["stone", "ashlar", "plaster", "timber", "planks", "thatch", "tiles", "slate", "door", "furrows", "rock"] as const;
/** Dressed sandstone (trim at every level, whole walls at level 3) and level 3 slates, from tools/assets/buildings.mjs, in its order. */
export const LEVEL_MATERIALS = ["dressed", "slates"] as const;
/** Every photo-scanned surface, in texture-array order. */
export const MATERIALS = [...BASE_MATERIALS, ...LEVEL_MATERIALS] as const;
/** Untextured surfaces after the scanned ones: cloth takes the team colour, the others their tint alone. */
export const FLAT_SURFACES = ["cloth", "iron", "dark", "paint"] as const;

export type ScannedSurface = (typeof MATERIALS)[number];
export type Surface = ScannedSurface | (typeof FLAT_SURFACES)[number];
export type Vec3 = [number, number, number];
export type Rgb = [number, number, number];

/** World units one texture repeat spans: stones and planks at their real size beside one-tile-wide villagers. */
const REPEAT: Record<ScannedSurface, number> = {
  stone: 1.3,
  ashlar: 1.5,
  plaster: 1.6,
  timber: 0.9,
  planks: 1.1,
  thatch: 1.3,
  tiles: 1.1,
  slate: 0.9,
  door: 0.8,
  furrows: 3,
  rock: 1.4,
  dressed: 0.95,
  slates: 1.0,
};

export const WHITE: Rgb = [1, 1, 1];

export function layerOf(surface: Surface): number {
  const scanned = MATERIALS.indexOf(surface as ScannedSurface);
  return scanned >= 0 ? scanned : MATERIALS.length + FLAT_SURFACES.indexOf(surface as (typeof FLAT_SURFACES)[number]);
}

function repeatOf(surface: Surface): number {
  return REPEAT[surface as ScannedSurface] ?? 1;
}

export interface MeshData {
  positions: number[];
  normals: number[];
  /** Per vertex: texture u, v, layer and a baked shade multiplier, negated where the surface is painted in the team colour. */
  surface: number[];
  /** Per vertex linear RGB multiplier of the albedo. */
  tint: number[];
  indices: number[];
}

export interface Paint {
  tint?: Rgb;
  /** Baked darkening, for undersides and recesses the sky barely reaches. */
  shade?: number;
  /** Painted in the owner's colour over the tint, like cloth: shutters, doors, shields. */
  team?: boolean;
}

/** The fourth surface component: the baked shade, negative on team-painted faces. */
function shadeOf(paint: Paint): number {
  const shade = paint.shade ?? 1;
  return paint.team ? -shade : shade;
}

interface Frame {
  x: number;
  y: number;
  z: number;
  cos: number;
  sin: number;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Newell's normal of a planar polygon, robust to repeated points; null when the polygon has no area. */
function polygonNormal(points: Vec3[]): Vec3 | null {
  const n: Vec3 = [0, 0, 0];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return Math.hypot(...n) < 1e-9 ? null : normalize(n);
}

export function normalize(a: Vec3): Vec3 {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
}

/** Accumulates faces in a movable, turnable frame; parts above `clipY` are cut flat, as on a wall still going up. */
export class GeometryBuilder {
  readonly data: MeshData = { positions: [], normals: [], surface: [], tint: [], indices: [] };
  clipY = Infinity;
  /** Roofs are drawn as bare rafters: the last stage of construction. */
  framing = false;
  /** The building has fallen: nothing escapes the cut, not even props. */
  ruined = false;
  private frame: Frame = { x: 0, y: 0, z: 0, cos: 1, sin: 0 };

  /** Draws with the origin moved to (x, y, z) and turned by `yaw` about the vertical axis. */
  at(x: number, y: number, z: number, yaw: number, draw: () => void): void {
    const outer = this.frame;
    const [wx, wy, wz] = this.toWorld([x, y, z]);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    this.frame = { x: wx, y: wy, z: wz, cos: outer.cos * c - outer.sin * s, sin: outer.sin * c + outer.cos * s };
    draw();
    this.frame = outer;
  }

  /** The local height of the cut, after the frame's own lift. */
  get localClip(): number {
    return this.clipY - this.frame.y;
  }

  get vertexCount(): number {
    return this.data.positions.length / 3;
  }

  /**
   * A flat convex polygon, fanned from its first point, with explicit texture coordinates in world units. The winding is taken from
   * the normal, so callers can list points in any rotational order.
   */
  face(points: Vec3[], uvs: [number, number][], normal: Vec3, surface: Surface, paint: Paint = {}): void {
    if (points.some((p) => p[1] > this.localClip + 1e-4)) return;
    const first = this.vertexCount;
    const n = this.toWorldDir(normalize(normal));
    const layer = layerOf(surface);
    const repeat = repeatOf(surface);
    const tint = paint.tint ?? WHITE;
    points.forEach((p, i) => {
      this.data.positions.push(...this.toWorld(p));
      this.data.normals.push(...n);
      this.data.surface.push(uvs[i]![0] / repeat, uvs[i]![1] / repeat, layer, shadeOf(paint));
      this.data.tint.push(...tint);
    });
    for (let i = 1; i + 1 < points.length; i++) this.triangle(first, first + i, first + i + 1, normal, points[0]!, points[i]!, points[i + 1]!);
  }

  /** A strip of quads with per-vertex normals, for round shapes: `rings` are rows of points, `normals` match them. */
  smooth(rings: Vec3[][], normals: Vec3[][], uvs: [number, number][][], surface: Surface, paint: Paint = {}): void {
    const first = this.vertexCount;
    const layer = layerOf(surface);
    const repeat = repeatOf(surface);
    const tint = paint.tint ?? WHITE;
    const width = rings[0]!.length;
    rings.forEach((ring, r) =>
      ring.forEach((p, i) => {
        this.data.positions.push(...this.toWorld(p));
        this.data.normals.push(...this.toWorldDir(normals[r]![i]!));
        this.data.surface.push(uvs[r]![i]![0] / repeat, uvs[r]![i]![1] / repeat, layer, shadeOf(paint));
        this.data.tint.push(...tint);
      }),
    );
    for (let r = 0; r + 1 < rings.length; r++) {
      for (let i = 0; i + 1 < width; i++) {
        const a = first + r * width + i;
        const b = a + 1;
        const c = a + width + 1;
        const d = a + width;
        const outward = normals[r]![i]!;
        this.triangle(a, b, c, outward, rings[r]![i]!, rings[r]![i + 1]!, rings[r + 1]![i + 1]!);
        this.triangle(a, c, d, outward, rings[r]![i]!, rings[r + 1]![i + 1]!, rings[r + 1]![i]!);
      }
    }
  }

  /** An indexed mesh with its own normals and texture coordinates, for organic shapes such as boulders. */
  indexed(points: Vec3[], normals: Vec3[], uvs: [number, number][], indices: number[], surface: Surface, paint: Paint = {}): void {
    if (points.some((p) => p[1] > this.localClip + 1e-4)) return;
    const first = this.vertexCount;
    const layer = layerOf(surface);
    const repeat = repeatOf(surface);
    const tint = paint.tint ?? WHITE;
    points.forEach((p, i) => {
      this.data.positions.push(...this.toWorld(p));
      this.data.normals.push(...this.toWorldDir(normals[i]!));
      this.data.surface.push(uvs[i]![0] / repeat, uvs[i]![1] / repeat, layer, shadeOf(paint));
      this.data.tint.push(...tint);
    });
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = [indices[i]!, indices[i + 1]!, indices[i + 2]!];
      const face = normalize(cross(sub(points[b]!, points[a]!), sub(points[c]!, points[a]!)));
      const outward = normals[a]!;
      // Take the winding from the vertex normals, which point out of the shape.
      this.triangle(first + a, first + b, first + c, dot(face, outward) >= 0 ? face : [-face[0], -face[1], -face[2]], points[a]!, points[b]!, points[c]!);
    }
  }

  /** An axis-aligned box from corner to corner, textured by projection so neighbouring boxes continue the pattern. */
  box(min: Vec3, max: Vec3, surface: Surface, paint: Paint & { bottom?: boolean; top?: boolean; across?: boolean } = {}): void {
    const [x0, y0, z0] = min;
    const [x1, z1] = [max[0], max[2]];
    const y1 = Math.min(max[1], this.localClip);
    if (y1 <= y0 + 1e-4 || x1 <= x0 || z1 <= z0) return;
    // `across` turns the image a quarter on the sides: vertical wood grain then runs along a beam laid flat.
    const uvSide = (h: number, y: number): [number, number] => (paint.across ? [-y, h] : [h, -y]);
    this.face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [uvSide(x0, y0), uvSide(x1, y0), uvSide(x1, y1), uvSide(x0, y1)], [0, 0, 1], surface, paint);
    this.face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [uvSide(-x1, y0), uvSide(-x0, y0), uvSide(-x0, y1), uvSide(-x1, y1)], [0, 0, -1], surface, paint);
    this.face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [uvSide(-z1, y0), uvSide(-z0, y0), uvSide(-z0, y1), uvSide(-z1, y1)], [1, 0, 0], surface, paint);
    this.face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [uvSide(z0, y0), uvSide(z1, y0), uvSide(z1, y1), uvSide(z0, y1)], [-1, 0, 0], surface, paint);
    if (paint.top !== false) this.face([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [[x0, -z1], [x1, -z1], [x1, -z0], [x0, -z0]], [0, 1, 0], surface, paint);
    if (paint.bottom) this.face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], [0, -1, 0], surface, { ...paint, shade: (paint.shade ?? 1) * 0.6 });
  }

  /** A box between two points with a square cross-section, for posts, rafters and braces at any angle. */
  beam(from: Vec3, to: Vec3, size: number, surface: Surface, paint: Paint = {}): void {
    if (Math.max(from[1], to[1]) > this.localClip + 1e-4) return;
    const axis = sub(to, from);
    const length = Math.hypot(...axis);
    if (length < 1e-4) return;
    const d = normalize(axis);
    const helper: Vec3 = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const a = normalize(cross(d, helper));
    const b = cross(a, d);
    const h = size / 2;
    const corner = (p: Vec3, sa: number, sb: number): Vec3 => [p[0] + (a[0] * sa + b[0] * sb) * h, p[1] + (a[1] * sa + b[1] * sb) * h, p[2] + (a[2] * sa + b[2] * sb) * h];
    const signs: [number, number][] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    for (let i = 0; i < 4; i++) {
      const [sa0, sb0] = signs[i]!;
      const [sa1, sb1] = signs[(i + 1) % 4]!;
      const normal = normalize([a[0] * (sa0 + sa1) + b[0] * (sb0 + sb1), a[1] * (sa0 + sa1) + b[1] * (sb0 + sb1), a[2] * (sa0 + sa1) + b[2] * (sb0 + sb1)]);
      // Grain runs along the beam.
      this.face([corner(from, sa0, sb0), corner(from, sa1, sb1), corner(to, sa1, sb1), corner(to, sa0, sb0)], [[i * size, 0], [(i + 1) * size, 0], [(i + 1) * size, length], [i * size, length]], normal, surface, paint);
    }
    for (const [p, sign] of [[from, -1], [to, 1]] as const) {
      this.face(signs.map(([sa, sb]) => corner(p, sa, sb)), signs.map(([sa, sb]) => [sa * h, sb * h]), [d[0] * sign, d[1] * sign, d[2] * sign], surface, paint);
    }
  }

  /** A round log between two points, capped at both ends: lumber, wheels, hay bales and lying barrels. */
  tube(from: Vec3, to: Vec3, radius: number, segments: number, surface: Surface, paint: Paint & { caps?: boolean } = {}): void {
    if (Math.max(from[1], to[1]) + radius > this.localClip + 1e-4) return;
    const axis = sub(to, from);
    const length = Math.hypot(...axis);
    if (length < 1e-4) return;
    const d = normalize(axis);
    const a = normalize(cross(d, Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
    const c = cross(a, d);
    const around = (angle: number): Vec3 => [a[0] * Math.cos(angle) + c[0] * Math.sin(angle), a[1] * Math.cos(angle) + c[1] * Math.sin(angle), a[2] * Math.cos(angle) + c[2] * Math.sin(angle)];
    const rings: Vec3[][] = [[], []];
    const normals: Vec3[][] = [[], []];
    const uvs: [number, number][][] = [[], []];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const n = around(angle);
      rings[0]!.push([from[0] + n[0] * radius, from[1] + n[1] * radius, from[2] + n[2] * radius]);
      rings[1]!.push([to[0] + n[0] * radius, to[1] + n[1] * radius, to[2] + n[2] * radius]);
      normals[0]!.push(n);
      normals[1]!.push(n);
      uvs[0]!.push([angle * radius, 0]);
      uvs[1]!.push([angle * radius, length]);
    }
    this.smooth(rings, normals, uvs, surface, paint);
    if (paint.caps === false) return;
    const cap = Array.from({ length: segments }, (_, i): [number, number] => [Math.cos((i / segments) * Math.PI * 2) * radius, Math.sin((i / segments) * Math.PI * 2) * radius]);
    const end = { ...paint, shade: (paint.shade ?? 1) * 0.85 };
    this.face(rings[0]!.slice(0, segments), cap, [-d[0], -d[1], -d[2]], surface, end);
    this.face(rings[1]!.slice(0, segments), cap, d, surface, end);
  }

  /**
   * A roof plane with thickness: `top` is the outer polygon (3 or 4 points), `uvs` its texture coordinates,
   * and the underside and edges are drawn in `under`, darkened as eaves are.
   */
  slab(top: Vec3[], uvs: [number, number][], thickness: number, surface: Surface, paint: Paint = {}, under: Surface = surface === "thatch" ? "thatch" : "timber"): void {
    if (top.some((p) => p[1] > this.localClip + 1e-4)) return;
    const normal = polygonNormal(top);
    if (!normal) return;
    const up: Vec3 = normal[1] < 0 ? [-normal[0], -normal[1], -normal[2]] : normal;
    const bottom = top.map((p): Vec3 => [p[0] - up[0] * thickness, p[1] - up[1] * thickness, p[2] - up[2] * thickness]);
    this.face(top, uvs, up, surface, paint);
    this.face(bottom, uvs, [-up[0], -up[1], -up[2]], under, { shade: 0.55 });
    for (let i = 0; i < top.length; i++) {
      const j = (i + 1) % top.length;
      const edge = sub(top[j]!, top[i]!);
      if (Math.hypot(...edge) < 1e-5) continue;
      let outward = normalize(cross(edge, up));
      const centre = top.reduce((sum, p) => [sum[0] + p[0], sum[1] + p[1], sum[2] + p[2]] as Vec3, [0, 0, 0] as Vec3);
      const mid: Vec3 = [(top[i]![0] + top[j]![0]) / 2 - centre[0] / top.length, 0, (top[i]![2] + top[j]![2]) / 2 - centre[2] / top.length];
      if (dot(outward, mid) < 0) outward = [-outward[0], -outward[1], -outward[2]];
      const length = Math.hypot(...edge);
      this.face([top[i]!, top[j]!, bottom[j]!, bottom[i]!], [[0, 0], [length, 0], [length, thickness], [0, thickness]], outward, under, { shade: 0.8 });
    }
  }

  /** An upright cylinder, optionally tapering and capped; `segments` stays low because walls repeat it many times. */
  cylinder(x: number, z: number, radius: number, y0: number, y1: number, segments: number, surface: Surface, paint: Paint & { top?: boolean; topRadius?: number } = {}): void {
    const top = Math.min(y1, this.localClip);
    if (top <= y0 + 1e-4) return;
    const r1 = radius + ((paint.topRadius ?? radius) - radius) * ((top - y0) / (y1 - y0));
    const slope = (radius - r1) / (top - y0);
    const rings: Vec3[][] = [[], []];
    const normals: Vec3[][] = [[], []];
    const uvs: [number, number][][] = [[], []];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const n = normalize([c, slope, s]);
      rings[0]!.push([x + c * radius, y0, z + s * radius]);
      rings[1]!.push([x + c * r1, top, z + s * r1]);
      normals[0]!.push(n);
      normals[1]!.push(n);
      const u = -angle * radius;
      uvs[0]!.push([u, -y0]);
      uvs[1]!.push([u, -top]);
    }
    this.smooth(rings, normals, uvs, surface, paint);
    if (paint.top === false) return;
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const p0: Vec3 = [x + Math.cos(a0) * r1, top, z + Math.sin(a0) * r1];
      const p1: Vec3 = [x + Math.cos(a1) * r1, top, z + Math.sin(a1) * r1];
      this.face([[x, top, z], p0, p1], [[x, -z], [p0[0], -p0[2]], [p1[0], -p1[2]]], [0, 1, 0], surface, paint);
    }
  }

  /** A conical roof from `radius` at height y0 up to the apex, textured down the slope from the tip. */
  cone(x: number, z: number, radius: number, y0: number, apex: number, segments: number, surface: Surface, paint: Paint = {}): void {
    if (apex > this.localClip + 1e-4) return;
    const slant = Math.hypot(radius, apex - y0);
    const rings: Vec3[][] = [[], []];
    const normals: Vec3[][] = [[], []];
    const uvs: [number, number][][] = [[], []];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const n = normalize([c * (apex - y0), radius, s * (apex - y0)]);
      rings[0]!.push([x, apex, z]);
      rings[1]!.push([x + c * radius, y0, z + s * radius]);
      normals[0]!.push(n);
      normals[1]!.push(n);
      // Roofing courses run round the cone, so u follows the eave's circumference scaled to each course.
      uvs[0]!.push([-angle * radius * 0.5, 0]);
      uvs[1]!.push([-angle * radius, slant]);
    }
    this.smooth(rings, normals, uvs, surface, paint);
    this.cylinder(x, z, radius * 0.98, y0 - 0.05, y0, segments, "timber", { top: false, shade: 0.6 });
  }

  private triangle(a: number, b: number, c: number, normal: Vec3, pa: Vec3, pb: Vec3, pc: Vec3): void {
    // Babylon's default front face has the plain cross product of its edges pointing into the mesh.
    const facing = dot(cross(sub(pb, pa), sub(pc, pa)), normal);
    if (facing >= 0) this.data.indices.push(a, c, b);
    else this.data.indices.push(a, b, c);
  }

  private toWorld(p: Vec3): Vec3 {
    const f = this.frame;
    return [f.x + p[0] * f.cos + p[2] * f.sin, f.y + p[1], f.z - p[0] * f.sin + p[2] * f.cos];
  }

  private toWorldDir(n: Vec3): Vec3 {
    const f = this.frame;
    return [n[0] * f.cos + n[2] * f.sin, n[1], -n[0] * f.sin + n[2] * f.cos];
  }
}
