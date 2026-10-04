import { GeometryBuilder, type Paint, type Rgb, type Surface, type Vec3 } from "./building-geometry";

/** Linear tints laid over the scans: limewash plaster, tarred timber, dressed stone, painted trim. */
export const PLASTER: Rgb = [1.05, 0.95, 0.8];
export const DARK_TIMBER: Rgb = [0.62, 0.5, 0.4];
export const OAK: Rgb = [0.9, 0.72, 0.52];
export const CHARRED: Rgb = [0.18, 0.15, 0.13];
export const IRON: Rgb = [0.3, 0.3, 0.32];
export const GLASS: Rgb = [0.05, 0.05, 0.06];
export const BURLAP: Rgb = [0.42, 0.33, 0.2];
export const WHEAT: Rgb = [0.52, 0.4, 0.12];
export const GOLD: Rgb = [0.85, 0.62, 0.15];
/** A faint warming of the dressed sandstone, for quoins, surrounds and the grandest walls. */
export const DRESSED: Rgb = [1.06, 1.03, 0.98];
const WHITE_PAINT: Rgb = [0.85, 0.83, 0.78];

export type Face = "front" | "back" | "left" | "right";
/** The faces the battlefield camera can see: it looks north, so backs are never drawn in detail. */
const SEEN: readonly Face[] = ["front", "left", "right"];

/** The yaw that turns local +X toward the map-plane direction (dx, dz). */
export function yawOf(dx: number, dz: number): number {
  return Math.atan2(-dz, dx);
}

/** Deterministic pseudo-random numbers, so a building's props sit the same way every time. */
export function random(seed: number): () => number {
  let state = (seed * 2654435761) >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

/** Draws with the origin on one face of a w × d block, local +Z pointing out of it and `along` measured across it. */
export function onFace(b: GeometryBuilder, face: Face, w: number, d: number, along: number, draw: () => void): void {
  if (face === "front") b.at(along, 0, d / 2, 0, draw);
  else if (face === "back") b.at(-along, 0, -d / 2, Math.PI, draw);
  else if (face === "right") b.at(w / 2, 0, -along, Math.PI / 2, draw);
  else b.at(-w / 2, 0, along, -Math.PI / 2, draw);
}

/** The width of a face of a w × d block. */
function faceWidth(face: Face, w: number, d: number): number {
  return face === "front" || face === "back" ? w : d;
}

/** Runs `draw` without the construction cut, for scaffolds and ground props that are not part of the rising walls. */
export function uncut(b: GeometryBuilder, draw: () => void): void {
  if (b.ruined) {
    draw();
    return;
  }
  const clip = b.clipY;
  b.clipY = Infinity;
  draw();
  b.clipY = clip;
}

export function plinth(b: GeometryBuilder, w: number, d: number, height = 0.14): void {
  b.box([-w / 2 - 0.05, 0, -d / 2 - 0.05], [w / 2 + 0.05, height, d / 2 + 0.05], "stone");
}

export function block(b: GeometryBuilder, w: number, d: number, y0: number, y1: number, surface: Surface, paint: Paint & { across?: boolean } = {}): void {
  b.box([-w / 2, y0, -d / 2], [w / 2, y1, d / 2], surface, { ...paint, top: false });
}

/** Posts, rails and corner braces standing proud of one wall face at local z = 0. */
function timberFrame(b: GeometryBuilder, width: number, y0: number, y1: number, spacing: number): void {
  const beam = 0.07;
  const proud = 0.025;
  const timber = { tint: DARK_TIMBER };
  const half = width / 2;
  b.box([-half, y0, -0.01], [half, y0 + beam, proud], "timber", { ...timber, across: true });
  b.box([-half, y1 - beam, -0.01], [half, y1, proud], "timber", { ...timber, across: true });
  if (y1 - y0 > 0.75) b.box([-half, (y0 + y1) / 2 - beam / 2, -0.01], [half, (y0 + y1) / 2 + beam / 2, proud * 0.8], "timber", { ...timber, across: true });
  const studs = Math.max(2, Math.round(width / spacing));
  for (let i = 0; i <= studs; i++) {
    const x = -half + (i / studs) * width;
    b.box([x - beam / 2, y0, -0.01], [x + beam / 2, y1, proud], "timber", timber);
  }
  const step = width / studs;
  b.beam([-half + beam, y0 + beam, proud / 2], [-half + step, y1 - beam, proud / 2], beam * 0.8, "timber", timber);
  b.beam([half - beam, y0 + beam, proud / 2], [half - step, y1 - beam, proud / 2], beam * 0.8, "timber", timber);
}

/** Plastered walls in a frame of dark timber; the frame is drawn only on faces the camera sees. */
export function halfTimbered(b: GeometryBuilder, w: number, d: number, y0: number, y1: number, spacing = 0.42): void {
  block(b, w, d, y0, y1, "plaster", { tint: PLASTER });
  for (const face of SEEN) onFace(b, face, w, d, 0, () => timberFrame(b, faceWidth(face, w, d), y0, y1, spacing));
}

/** Dressed corner stones up the two front corners of a w × d block, alternately long and short on each face. */
export function quoins(b: GeometryBuilder, w: number, d: number, y0: number, y1: number): void {
  const courses = Math.max(2, Math.round((y1 - y0) / 0.2));
  const step = (y1 - y0) / courses;
  for (const side of [-1, 1]) {
    for (let i = 0; i < courses; i++) {
      const front = i % 2 === 0 ? 0.22 : 0.13;
      const flank = i % 2 === 0 ? 0.13 : 0.22;
      const x0 = side > 0 ? w / 2 - front : -w / 2 - 0.015;
      const x1 = side > 0 ? w / 2 + 0.015 : -w / 2 + front;
      b.box([x0, y0 + i * step, d / 2 - flank], [x1, y0 + (i + 1) * step - 0.012, d / 2 + 0.015], "dressed", { tint: DRESSED });
    }
  }
}

/** Joist ends under an upper floor that overhangs the front face (local z = 0) by `depth`. */
export function joists(b: GeometryBuilder, width: number, y: number, depth: number): void {
  const count = Math.max(3, Math.round(width / 0.24));
  b.box([-width / 2, y - 0.03, -0.01], [width / 2, y, depth + 0.02], "timber", { tint: DARK_TIMBER, across: true, bottom: true });
  for (let i = 0; i <= count; i++) {
    const x = -width / 2 + 0.05 + (i / count) * (width - 0.1);
    b.box([x - 0.028, y - 0.09, -0.01], [x + 0.028, y - 0.03, depth + 0.035], "timber", { tint: DARK_TIMBER, bottom: true });
  }
}

interface RoofOptions {
  overhang?: number;
  /** Overhang past the gable ends; defaults to the eave overhang. */
  endOverhang?: number;
  thickness?: number;
  tint?: Rgb;
  /** Wall surface filling the triangular gable ends. */
  gable?: Surface;
  gableTint?: Rgb;
  /** Timber framing on the gable ends, for roofs turned to face the camera. */
  framed?: boolean;
}

/** Bare rafters and a ridge beam: the roof of a building still under construction. */
function rafters(b: GeometryBuilder, w: number, d: number, eave: number, ridge: number, ridgeHalf: number): void {
  const count = Math.max(3, Math.round(w / 0.35));
  for (let i = 0; i <= count; i++) {
    const x = -w / 2 + (i / count) * w;
    const top = Math.max(-ridgeHalf, Math.min(ridgeHalf, x));
    b.beam([x, eave, d / 2], [top, ridge, 0], 0.05, "timber");
    b.beam([x, eave, -d / 2], [top, ridge, 0], 0.05, "timber");
  }
  if (ridgeHalf > 0) b.beam([-ridgeHalf, ridge, 0], [ridgeHalf, ridge, 0], 0.06, "timber");
}

/** A king post and struts on a gable triangle, set just proud of the face at local x = side · w/2. */
function gableFraming(b: GeometryBuilder, side: number, w: number, d: number, eave: number, ridge: number): void {
  const x = side * (w / 2 + 0.015);
  const timber = { tint: DARK_TIMBER };
  b.beam([x, eave + 0.03, -d / 2 + 0.05], [x, eave + 0.03, d / 2 - 0.05], 0.06, "timber", timber);
  b.beam([x, eave, 0], [x, ridge - 0.06, 0], 0.06, "timber", timber);
  for (const z of [-1, 1]) b.beam([x, eave + 0.05, z * d * 0.22], [x, eave + (ridge - eave) * 0.62, 0], 0.05, "timber", timber);
}

/** A gable roof whose ridge runs along X over a w × d block with walls up to `eave`, with bargeboards and a ridge cap. */
export function gableRoof(b: GeometryBuilder, w: number, d: number, eave: number, ridge: number, surface: Surface, options: RoofOptions = {}): void {
  if (b.framing) {
    rafters(b, w, d, eave, ridge, w / 2);
    return;
  }
  if (ridge > b.localClip) return;
  const o = options.overhang ?? 0.14;
  const t = options.thickness ?? 0.07;
  const hw = w / 2 + (options.endOverhang ?? o);
  // A little past the wall line, so the proud timber framing stays under the eaves.
  const hd = d / 2 + 0.04;
  const drop = ((ridge - eave) / hd) * o;
  const low = eave - drop;
  const slope = Math.hypot(ridge - low, hd + o);
  const paint = { tint: options.tint };
  const gableSurface = options.gable ?? "plaster";
  for (const side of [1, -1]) {
    const edge = side * (hd + o);
    b.slab([[-hw, ridge, 0], [hw, ridge, 0], [hw, low, edge], [-hw, low, edge]], [[-hw * side, 0], [hw * side, 0], [hw * side, slope], [-hw * side, slope]], t, surface, paint);
    b.face(
      [[side * (w / 2), eave, -d / 2], [side * (w / 2), eave, d / 2], [side * (w / 2), ridge - t, 0]],
      [[(-d / 2) * side, -eave], [(d / 2) * side, -eave], [0, -(ridge - t)]],
      [side, 0, 0],
      gableSurface,
      { tint: options.gableTint ?? (gableSurface === "plaster" ? PLASTER : undefined) },
    );
    if (options.framed) gableFraming(b, side, w, d, eave, ridge - t);
    if (surface !== "thatch") for (const z of [1, -1]) b.beam([side * hw, low - 0.01, z * (hd + o)], [side * hw, ridge + 0.03, 0], 0.045, "timber", { tint: DARK_TIMBER });
  }
  const thatch = surface === "thatch";
  b.beam([-hw, ridge + 0.01, 0], [hw, ridge + 0.01, 0], thatch ? 0.14 : 0.08, thatch ? "thatch" : "timber", { tint: thatch ? options.tint : DARK_TIMBER });
}

/** A hipped roof over a w × d block, or a pyramid when the block is square, with capped ridge and hips. */
export function hipRoof(b: GeometryBuilder, w: number, d: number, eave: number, ridge: number, surface: Surface, options: RoofOptions = {}): void {
  const turned = d > w;
  const long = turned ? d : w;
  const short = turned ? w : d;
  if (b.framing) {
    b.at(0, 0, 0, turned ? Math.PI / 2 : 0, () => rafters(b, long, short, eave, ridge, (long - short) / 2));
    return;
  }
  if (ridge > b.localClip) return;
  const o = options.overhang ?? 0.14;
  const t = options.thickness ?? 0.07;
  const drop = ((ridge - eave) / (short / 2)) * o;
  const low = eave - drop;
  const hl = long / 2 + o;
  const hs = short / 2 + o;
  const r = Math.max(0, (long - short) / 2);
  const slope = Math.hypot(ridge - low, hs);
  const paint = { tint: options.tint };
  const cap = surface === "thatch" ? { surface: "thatch" as const, paint, size: 0.12 } : { surface: "timber" as const, paint: { tint: DARK_TIMBER }, size: 0.06 };
  b.at(0, 0, 0, turned ? Math.PI / 2 : 0, () => {
    for (const side of [1, -1]) {
      const z = side * hs;
      b.slab([[-r, ridge, 0], [r, ridge, 0], [hl, low, z], [-hl, low, z]], [[-r * side, 0], [r * side, 0], [hl * side, slope], [-hl * side, slope]], t, surface, paint);
      const x = side * hl;
      b.slab([[side * r, ridge, 0], [x, low, hs], [x, low, -hs]], [[0, 0], [hs * side, slope], [-hs * side, slope]], t, surface, paint);
      for (const end of [1, -1]) b.beam([side * r, ridge + 0.02, 0], [side * hl, low + 0.02, end * hs], cap.size * 0.8, cap.surface, cap.paint);
    }
    if (r > 0.01) b.beam([-r, ridge + 0.02, 0], [r, ridge + 0.02, 0], cap.size, cap.surface, cap.paint);
  });
}

/** A conical roof on a round tower, with an iron finial. */
export function coneRoof(b: GeometryBuilder, radius: number, eave: number, apex: number, surface: Surface): void {
  if (b.framing) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.beam([Math.cos(a) * radius, eave, Math.sin(a) * radius], [0, apex, 0], 0.05, "timber");
    }
    return;
  }
  if (apex > b.localClip) return;
  b.cone(0, 0, radius, eave, apex, 12, surface);
  b.cylinder(0, 0, 0.025, apex - 0.05, apex + 0.22, 4, "iron", { tint: IRON });
}

/**
 * A dormer on the front slope of the gable roof `gableRoof(w, d, eave, ridge)` would draw, centred at x: a window
 * front with its own small gable roof. Dormers appear only once the main roof is on.
 */
export function dormer(b: GeometryBuilder, x: number, d: number, eave: number, ridge: number, width: number, roof: Surface, wall: Surface = "plaster"): void {
  if (b.framing || ridge > b.localClip) return;
  const hd = d / 2 + 0.04;
  const slopeAt = (z: number) => ridge - ((ridge - eave) * z) / hd;
  const front = hd * 0.7;
  const sill = slopeAt(front);
  const top = sill + width * 0.75;
  const peak = top + width * 0.42;
  const back = Math.max(0.02, ((ridge - peak) * hd) / (ridge - eave));
  b.box([x - width / 2, sill - 0.12, back], [x + width / 2, top, front], wall, { tint: wall === "plaster" ? PLASTER : undefined, top: false });
  b.at(x, 0, front, 0, () => window(b, sill + 0.04, width * 0.5, (top - sill) * 0.6));
  b.at(x, 0, (front + back) / 2, Math.PI / 2, () => gableRoof(b, front - back, width, top, peak, roof, { overhang: 0.05, endOverhang: 0.06, thickness: 0.04, gable: wall }));
}

/** Battlements along a straight run from (x0, z0) to (x1, z1) on a wall top at `y`. */
export function merlons(b: GeometryBuilder, x0: number, z0: number, x1: number, z1: number, y: number, depth: number, surface: Surface = "stone", paint: Paint = {}, pitch = 0.3): void {
  const length = Math.hypot(x1 - x0, z1 - z0);
  const count = Math.max(1, Math.round(length / pitch));
  const width = (length / count) * 0.55;
  b.at(x0, 0, z0, yawOf(x1 - x0, z1 - z0), () => {
    for (let i = 0; i < count; i++) {
      const start = (i + 0.225) * (length / count);
      b.box([start, y, -depth / 2], [start + width, y + 0.17, depth / 2], surface, paint);
    }
  });
}

/** Battlements round the edge of a w × d roof at height `y`. */
export function merlonRing(b: GeometryBuilder, w: number, d: number, y: number, surface: Surface = "stone", paint: Paint = {}): void {
  const hw = w / 2 - 0.05;
  const hd = d / 2 - 0.05;
  merlons(b, -hw, hd, hw, hd, y, 0.1, surface, paint);
  merlons(b, hw, -hd, -hw, -hd, y, 0.1, surface, paint);
  merlons(b, hw, hd, hw, -hd, y, 0.1, surface, paint);
  merlons(b, -hw, -hd, -hw, hd, y, 0.1, surface, paint);
}

/** Battlements round a round tower's top. */
export function merlonCircle(b: GeometryBuilder, radius: number, y: number, count = 8, surface: Surface = "stone", paint: Paint = {}): void {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    b.at(Math.cos(a) * radius, 0, Math.sin(a) * radius, -a, () => b.box([-0.05, y, -radius * 0.17], [0.05, y + 0.17, radius * 0.17], surface, paint));
  }
}

/** A crenellated parapet corbelled out round a square w × d top: corbels below `y`, a wall walk rim, then merlons. */
export function machicolatedTop(b: GeometryBuilder, w: number, d: number, y: number, surface: Surface, paint: Paint = {}): void {
  const out = 0.08;
  for (const face of SEEN) {
    const width = faceWidth(face, w, d);
    const count = Math.max(3, Math.round(width / 0.2));
    onFace(b, face, w, d, 0, () => {
      for (let i = 0; i <= count; i++) {
        const x = -width / 2 + (i / count) * width;
        b.box([x - 0.035, y - 0.16, -0.01], [x + 0.035, y, out], surface, paint);
      }
    });
  }
  b.box([-w / 2 - out, y, -d / 2 - out], [w / 2 + out, y + 0.12, d / 2 + out], surface, { ...paint, bottom: true });
  merlonRing(b, w + out * 2, d + out * 2, y + 0.12, surface, paint);
}

/** The same for a round top of `radius`. */
export function machicolatedCircle(b: GeometryBuilder, radius: number, y: number, surface: Surface, paint: Paint = {}, count = 10): void {
  for (let i = 0; i < count * 2; i++) {
    const a = (i / (count * 2)) * Math.PI * 2;
    b.at(Math.cos(a) * radius, 0, Math.sin(a) * radius, -a, () => b.box([-0.02, y - 0.15, -0.03], [0.08, y, 0.03], surface, paint));
  }
  b.cylinder(0, 0, radius + 0.08, y, y + 0.12, 14, surface, paint);
  merlonCircle(b, radius + 0.04, y + 0.12, count, surface, paint);
}

/** A round corner turret corbelled out from y0, with walls up to y1, a cone roof and a team pennant. */
export function turret(b: GeometryBuilder, x: number, z: number, radius: number, y0: number, y1: number, apex: number, wall: Surface, roof: Surface, paint: Paint = {}): void {
  b.at(x, 0, z, 0, () => {
    if (y0 > 0.05) b.cylinder(0, 0, radius * 0.35, y0 - radius * 1.1, y0, 8, wall, { ...paint, topRadius: radius, top: false });
    b.cylinder(0, 0, radius, y0, y1, 10, wall, { ...paint, top: false });
    b.at(0, 0, radius - 0.01, 0, () => slit(b, (y0 + y1) / 2 - 0.15, 0.3));
    coneRoof(b, radius + 0.07, y1, apex, roof);
    if (!b.framing && apex <= b.localClip) pennant(b, 0, 0, apex + 0.1, 0.3, 0.32);
  });
}

/** A stepped stone buttress against a wall face at local z = 0. */
export function buttress(b: GeometryBuilder, height: number, surface: Surface = "stone", paint: Paint = {}, width = 0.16, depth = 0.2): void {
  b.box([-width / 2, 0, -0.02], [width / 2, height * 0.5, depth], surface, paint);
  b.box([-width / 2, height * 0.5, -0.02], [width / 2, height * 0.82, depth * 0.55], surface, paint);
  b.box([-width / 2 - 0.01, height * 0.5, -0.02], [width / 2 + 0.01, height * 0.5 + 0.04, depth + 0.02], surface, paint);
}

/** Crow-stepped parapets up both sloped edges of a gable end `w` wide at local z = 0, from `eave` to `ridge`. */
export function crowSteps(b: GeometryBuilder, w: number, eave: number, ridge: number, steps: number, surface: Surface, paint: Paint = {}): void {
  const run = w / 2 / (steps + 0.5);
  const rise = (ridge - eave) / (steps + 0.5);
  for (const side of [-1, 1]) {
    for (let i = 0; i < steps; i++) {
      const outer = side * (w / 2 - i * run);
      const inner = side * (w / 2 - (i + 1) * run);
      b.box([Math.min(outer, inner) - (i === 0 && side < 0 ? 0.04 : 0), eave, -0.1], [Math.max(outer, inner) + (i === 0 && side > 0 ? 0.04 : 0), eave + (i + 1) * rise + 0.1, 0.05], surface, paint);
    }
  }
  b.box([-run / 2 - 0.02, eave, -0.1], [run / 2 + 0.02, ridge + 0.2, 0.05], surface, paint);
}

/** A window on a wall face at local z = 0: dark glazing in a timber frame, with a sill and open (optionally team-painted) shutters. */
export function window(b: GeometryBuilder, y: number, w: number, h: number, options: { shutters?: boolean; team?: boolean; stone?: boolean } = {}): void {
  b.box([-w / 2, y, -0.02], [w / 2, y + h, 0.012], "dark", { tint: GLASS });
  const f = 0.04;
  const frame: { surface: Surface; paint: Paint } = options.stone ? { surface: "dressed", paint: { tint: DRESSED } } : { surface: "timber", paint: { tint: DARK_TIMBER } };
  b.box([-w / 2 - f, y - f, -0.01], [w / 2 + f, y, 0.045], "stone");
  b.box([-w / 2 - f, y + h, -0.01], [w / 2 + f, y + h + f, 0.035], frame.surface, { ...frame.paint, across: true });
  b.box([-w / 2 - f, y, -0.01], [-w / 2, y + h, 0.03], frame.surface, frame.paint);
  b.box([w / 2, y, -0.01], [w / 2 + f, y + h, 0.03], frame.surface, frame.paint);
  b.box([-0.012, y, 0], [0.012, y + h, 0.02], "timber", { tint: DARK_TIMBER });
  if (options.shutters === false) return;
  const shutter = { across: true, team: options.team, tint: options.team ? undefined : OAK };
  b.box([-w / 2 - f - w / 2, y, 0.01], [-w / 2 - f, y + h, 0.035], "planks", shutter);
  b.box([w / 2 + f, y, 0.01], [w / 2 + f + w / 2, y + h, 0.035], "planks", shutter);
}

/** An arrow slit: a narrow dark cut with a stone surround. */
export function slit(b: GeometryBuilder, y: number, h: number): void {
  b.box([-0.025, y, -0.02], [0.025, y + h, 0.01], "dark", { tint: GLASS });
  b.box([-0.06, y - 0.03, -0.01], [0.06, y, 0.025], "dressed");
}

/** A plank door with iron hinges in a timber frame, on a wall face at local z = 0. */
export function door(b: GeometryBuilder, w: number, h: number, y = 0.12, team = false): void {
  b.box([-w / 2, y, -0.02], [w / 2, y + h, 0.025], "door", { team });
  b.box([-w / 2 - 0.05, y, -0.01], [-w / 2, y + h + 0.05, 0.05], "timber", { tint: DARK_TIMBER });
  b.box([w / 2, y, -0.01], [w / 2 + 0.05, y + h + 0.05, 0.05], "timber", { tint: DARK_TIMBER });
  b.box([-w / 2 - 0.05, y + h, -0.01], [w / 2 + 0.05, y + h + 0.07, 0.055], "timber", { tint: DARK_TIMBER, across: true });
  for (const hy of [y + h * 0.22, y + h * 0.75]) b.box([-w / 2, hy, 0.025], [w * 0.15, hy + 0.025, 0.035], "iron", { tint: IRON });
  b.box([-w / 2 - 0.08, 0, 0], [w / 2 + 0.08, y, 0.14], "stone");
}

/** A round-headed doorway in a dressed stone surround, on a wall face at local z = 0. */
export function archDoor(b: GeometryBuilder, w: number, h: number, y = 0.06): void {
  const r = w / 2;
  const spring = y + h - r;
  const ring = 0.09;
  const segments = 6;
  const dressed = { tint: DRESSED };
  b.box([-r, y, -0.03], [r, spring, 0.015], "door", { team: true });
  const arc = (radius: number, i: number, z: number): Vec3 => [Math.cos((i / segments) * Math.PI) * radius, spring + Math.sin((i / segments) * Math.PI) * radius, z];
  const head = Array.from({ length: segments + 1 }, (_, i) => arc(r, i, 0.015));
  b.face(head, head.map((p) => [p[0], -p[1]]), [0, 0, 1], "door", { team: true });
  for (let i = 0; i < segments; i++) {
    const quad = [arc(r, i, 0.04), arc(r, i + 1, 0.04), arc(r + ring, i + 1, 0.04), arc(r + ring, i, 0.04)];
    b.face(quad, quad.map((p) => [p[0], -p[1]]), [0, 0, 1], "dressed", dressed);
  }
  for (const side of [-1, 1]) b.box([side > 0 ? r : -r - ring, 0, -0.01], [side > 0 ? r + ring : -r, spring, 0.04], "dressed", dressed);
  b.box([-0.05, spring + r - 0.02, -0.01], [0.05, spring + r + ring + 0.03, 0.05], "dressed", dressed);
  for (const hy of [y + h * 0.2, y + h * 0.55]) b.box([-r, hy, 0.015], [r * 0.6, hy + 0.025, 0.025], "iron", { tint: IRON });
  b.box([-r - ring, 0, 0], [r + ring, y, 0.12], "dressed", dressed);
}

export function chimney(b: GeometryBuilder, x: number, z: number, y0: number, y1: number): void {
  b.box([x - 0.11, y0, z - 0.11], [x + 0.11, y1, z + 0.11], "stone");
  b.box([x - 0.14, y1, z - 0.14], [x + 0.14, y1 + 0.05, z + 0.14], "stone");
  b.box([x - 0.07, y1 + 0.05, z - 0.07], [x + 0.07, y1 + 0.06, z + 0.07], "dark", { tint: GLASS });
  for (const dx of [-0.05, 0.05]) b.cylinder(x + dx, z, 0.035, y1 + 0.05, y1 + 0.13, 5, "tiles", { tint: [1.1, 0.8, 0.65], top: false });
}

/** A team banner on a pole with a crossbar; the cloth is the one surface that always takes the team colour. */
export function banner(b: GeometryBuilder, x: number, z: number, ground: number, height: number, width = 0.26): void {
  const top = ground + height;
  b.cylinder(x, z, 0.022, ground, top, 5, "timber", { tint: DARK_TIMBER });
  b.cylinder(x, z, 0.035, top, top + 0.05, 5, "iron", { tint: GOLD });
  b.beam([x - width / 2 - 0.03, top - 0.06, z], [x + width / 2 + 0.03, top - 0.06, z], 0.025, "timber", { tint: DARK_TIMBER });
  const cloth = height * 0.42;
  b.box([x - width / 2, top - 0.07 - cloth, z - 0.008], [x + width / 2, top - 0.07, z + 0.008], "cloth");
  for (const side of [1, -1]) {
    b.face(
      [[x - width / 2, top - 0.07 - cloth, z + side * 0.008], [x + width / 2, top - 0.07 - cloth, z + side * 0.008], [x, top - 0.07 - cloth - width * 0.45, z + side * 0.008]],
      [[0, 0], [width, 0], [width / 2, width * 0.45]],
      [0, 0, side],
      "cloth",
    );
  }
}

/** A pole with a long swallow-tailed streamer in the team colour, flying from roofs and turrets. */
export function pennant(b: GeometryBuilder, x: number, z: number, ground: number, height: number, length = 0.42): void {
  const top = ground + height;
  b.cylinder(x, z, 0.016, ground, top, 4, "timber", { tint: DARK_TIMBER });
  b.cylinder(x, z, 0.028, top, top + 0.035, 4, "iron", { tint: GOLD });
  const h = length * 0.36;
  const y = top - 0.02;
  // The streamer flies along +X, rippling once, and forks at the tail.
  const p: Vec3[] = [
    [x, y, z], [x, y - h, z],
    [x + length * 0.5, y - h * 0.82 - 0.03, z + 0.025], [x + length * 0.5, y - h * 0.05 - 0.03, z + 0.025],
    [x + length, y - 0.06, z - 0.01], [x + length * 0.82, y - h * 0.42 - 0.06, z], [x + length, y - h * 0.78 - 0.06, z - 0.01],
  ];
  const panels: [number, number, number, number][] = [[0, 1, 2, 3], [3, 2, 5, 4], [2, 6, 5, 5]];
  for (const side of [1, -1]) {
    for (const [a, c, d, e] of panels) {
      const quad = (e === d ? [p[a]!, p[c]!, p[d]!] : [p[a]!, p[c]!, p[d]!, p[e]!]).map((q): Vec3 => [q[0], q[1], q[2] + side * 0.004]);
      b.face(quad, quad.map((q) => [q[0], -q[1]]), [0, 0, side], "cloth");
    }
  }
}

/** A team pennant on a roof, shown only once that roof is on. */
export function roofPennant(b: GeometryBuilder, x: number, z: number, y: number, height = 0.45, length = 0.42): void {
  if (b.framing || y > b.localClip) return;
  pennant(b, x, z, y, height, length);
}

/** A cloth hanging flat against a wall face at local z = 0. */
export function wallBanner(b: GeometryBuilder, y: number, w: number, h: number): void {
  b.box([-w / 2 - 0.03, y + h, 0], [w / 2 + 0.03, y + h + 0.03, 0.05], "timber", { tint: DARK_TIMBER, across: true });
  b.box([-w / 2, y, 0.01], [w / 2, y + h, 0.03], "cloth");
  b.face([[-w / 2, y, 0.03], [w / 2, y, 0.03], [0, y - w * 0.4, 0.03]], [[0, 0], [w, 0], [w / 2, w * 0.4]], [0, 0, 1], "cloth");
  b.box([-0.012, y + h * 0.2, 0.03], [0.012, y + h * 0.85, 0.034], "paint", { tint: GOLD });
  b.box([-w * 0.3, y + h * 0.62, 0.03], [w * 0.3, y + h * 0.62 + 0.024, 0.034], "paint", { tint: GOLD });
}

/** A heraldic shield on a wall face at local z = 0: the team field in a gilt rim, charged with a pale cross. */
export function shield(b: GeometryBuilder, y: number, size: number): void {
  const outline = (scale: number, z: number): Vec3[] => {
    const w = (size * scale) / 2;
    const h = size * 1.15 * scale;
    const base = y + (size * 1.15 - h) / 2;
    return [[-w, base + h, z], [w, base + h, z], [w, base + h * 0.42, z], [0, base, z], [-w, base + h * 0.42, z]];
  };
  const rim = outline(1.14, 0.02);
  const field = outline(1, 0.03);
  b.face(rim, rim.map((p) => [p[0], -p[1]]), [0, 0, 1], "iron", { tint: GOLD });
  b.face(field, field.map((p) => [p[0], -p[1]]), [0, 0, 1], "cloth");
  b.box([-size * 0.06, y + size * 0.18, 0.03], [size * 0.06, y + size * 1.05, 0.036], "paint", { tint: WHITE_PAINT });
  b.box([-size * 0.38, y + size * 0.68, 0.03], [size * 0.38, y + size * 0.8, 0.036], "paint", { tint: WHITE_PAINT });
}

/** A striped canvas awning in the team colour over a doorway or stall, on a wall face at local z = 0. */
export function awning(b: GeometryBuilder, y: number, w: number, depth: number, stripes = 5): void {
  const drop = depth * 0.5;
  const normal: Vec3 = [0, depth, drop];
  for (let i = 0; i < stripes; i++) {
    const x0 = -w / 2 + (i / stripes) * w;
    const x1 = -w / 2 + ((i + 1) / stripes) * w;
    const surface: Surface = i % 2 === 0 ? "cloth" : "paint";
    const paint = i % 2 === 0 ? {} : { tint: WHITE_PAINT };
    const top: Vec3[] = [[x0, y, 0.01], [x1, y, 0.01], [x1, y - drop, depth], [x0, y - drop, depth]];
    b.face(top, [[x0, 0], [x1, 0], [x1, depth], [x0, depth]], normal, surface, paint);
    b.face([[x0, y - drop, depth], [x1, y - drop, depth], [x1, y - drop - 0.07, depth], [x0, y - drop - 0.07, depth]], [[x0, 0], [x1, 0], [x1, 0.07], [x0, 0.07]], [0, 0, 1], surface, paint);
  }
  for (const x of [-w / 2, w / 2]) b.beam([x, y + 0.02, 0], [x, y - drop, depth], 0.025, "iron", { tint: IRON });
}

/** Poles from `base`, ledgers and a walkboard along the front and sides of a w × d building up to `height`, ignoring the cut. */
export function scaffold(b: GeometryBuilder, w: number, d: number, height: number, base = 0): void {
  uncut(b, () => {
    const hw = w / 2 + 0.12;
    const hd = d / 2 + 0.12;
    const across = Math.max(1, Math.round(w / 1.0));
    const poles: [number, number][] = [[-hw, -hd], [hw, -hd]];
    for (let i = 0; i <= across; i++) poles.push([-hw + (i / across) * 2 * hw, hd]);
    for (const [x, z] of poles) b.beam([x, base, z], [x, height, z], 0.035, "timber", { tint: [0.95, 0.85, 0.7] });
    for (let y = 0.7; y < height - 0.1; y += 0.7) {
      b.beam([-hw, y, hd], [hw, y, hd], 0.03, "timber", { tint: [0.95, 0.85, 0.7] });
      for (const x of [hw, -hw]) b.beam([x, y, -hd], [x, y, hd], 0.03, "timber", { tint: [0.95, 0.85, 0.7] });
    }
    const board = Math.min(height - 0.15, 0.7);
    b.box([-hw, board + 0.02, hd - 0.1], [hw, board + 0.045, hd + 0.06], "planks", { across: true });
  });
}

/** Rubble where a building fell: broken stones and charred beams strewn over a w × d plot. */
export function rubble(b: GeometryBuilder, w: number, d: number, seed: number): void {
  const next = random(seed);
  uncut(b, () => {
    const stones = Math.round(w * d * 4);
    for (let i = 0; i < stones; i++) {
      const s = 0.08 + next() * 0.18;
      const x = (next() - 0.5) * w * 0.9;
      const z = (next() - 0.5) * d * 0.9;
      b.at(x, 0, z, next() * Math.PI, () => b.box([-s / 2, 0, -s / 2], [s / 2, s * (0.4 + next() * 0.5), s / 2], next() < 0.5 ? "stone" : "ashlar"));
    }
    const beams = Math.round(w * d * 0.8) + 1;
    for (let i = 0; i < beams; i++) {
      const x = (next() - 0.5) * w * 0.8;
      const z = (next() - 0.5) * d * 0.8;
      const a = next() * Math.PI;
      const half = 0.2 + next() * w * 0.2;
      const from: Vec3 = [x - Math.cos(a) * half, 0.04, z - Math.sin(a) * half];
      const to: Vec3 = [x + Math.cos(a) * half, 0.04 + next() * 0.35, z + Math.sin(a) * half];
      b.beam(from, to, 0.07, "timber", { tint: CHARRED });
    }
  });
}
