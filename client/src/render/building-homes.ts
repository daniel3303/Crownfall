import type { GeometryBuilder, Rgb } from "./building-geometry";
import {
  DARK_TIMBER,
  DRESSED,
  archDoor,
  awning,
  block,
  buttress,
  chimney,
  crowSteps,
  door,
  dormer,
  gableRoof,
  halfTimbered,
  hipRoof,
  joists,
  onFace,
  pennant,
  plinth,
  quoins,
  random,
  roofPennant,
  shield,
  turret,
  uncut,
  wallBanner,
  window,
} from "./building-parts";
import { barrel, cart, crate, fence, hayBale, haystack, lumber, sack, scarecrow, stoneBlocks, well, woodpile } from "./building-props";

// Homes and stores: thatch and timber at level 1, tile and stone at 2, slate, dressed stone and heraldry at 3.

/** Level 1: a thatched, timber-framed cottage with its gable toward the camera and a stone chimney up the side. */
function cottage(b: GeometryBuilder): void {
  const w = 1.25;
  const d = 1.45;
  const eave = 0.95;
  const ridge = 1.95;
  b.at(0.05, 0, -0.12, 0, () => {
    plinth(b, w, d, 0.12);
    halfTimbered(b, w, d, 0.12, eave);
    onFace(b, "front", w, d, -0.24, () => door(b, 0.3, 0.6, 0.12));
    onFace(b, "front", w, d, 0.3, () => window(b, 0.48, 0.24, 0.24));
    onFace(b, "right", w, d, 0.1, () => window(b, 0.48, 0.24, 0.24));
    b.at(0, 0, 0, Math.PI / 2, () => gableRoof(b, d, w, eave, ridge, "thatch", { overhang: 0.2, endOverhang: 0.14, thickness: 0.14, framed: true }));
    b.box([-w / 2 - 0.2, 0, -0.42], [-w / 2 + 0.02, 0.75, -0.14], "stone");
    chimney(b, -w / 2 - 0.09, -0.28, 0.75, 2.1);
    roofPennant(b, 0, d / 2 + 0.08, ridge - 0.08);
  });
  uncut(b, () => {
    woodpile(b, 0.88, 0.05, 0.16, 3);
    barrel(b, -0.55, 0.78);
    sack(b, -0.75, 0.68, 0.5);
  });
}

function plankCottage(b: GeometryBuilder): void {
  const w = 1.3;
  const d = 1.4;
  b.at(0, 0, -0.05, 0, () => {
    plinth(b, w, d, 0.1);
    block(b, w, d, 0.1, 1.0, "planks", { tint: [1.2, 1.05, 0.88] });
    for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) b.box([x - 0.06, 0, z - 0.06], [x + 0.06, 1.0, z + 0.06], "timber", { tint: DARK_TIMBER });
    onFace(b, "front", w, d, 0.15, () => door(b, 0.3, 0.6, 0.1));
    onFace(b, "front", w, d, -0.35, () => window(b, 0.45, 0.22, 0.22));
    onFace(b, "right", w, d, 0.2, () => window(b, 0.45, 0.22, 0.22));
    hipRoof(b, w, d, 1.0, 1.8, "thatch", { overhang: 0.18, thickness: 0.12 });
    chimney(b, -w / 2 - 0.08, -0.25, 0, 2.05);
    roofPennant(b, 0, 0.15, 1.75);
  });
  uncut(b, () => {
    lumber(b, 0.25, 0.85, 0.55);
    barrel(b, -0.55, 0.85);
  });
}

/** Level 2: a stone ground floor under a jettied, half-timbered upper floor with a dormer and team-painted shutters. */
function townhouse(b: GeometryBuilder, mirror: number): void {
  const w = 1.6;
  const d = 1.1;
  const ground = 0.92;
  const jetty = 0.12;
  const eave = 1.72;
  const ridge = 2.7;
  b.at(0, 0, -0.16, 0, () => {
    plinth(b, w, d, 0.1);
    block(b, w, d, 0, ground, "stone");
    quoins(b, w, d, 0.1, ground);
    onFace(b, "front", w, d, mirror * -0.38, () => door(b, 0.32, 0.6, 0.1, true));
    onFace(b, "front", w, d, mirror * 0.36, () => {
      window(b, 0.36, 0.34, 0.3, { stone: true, shutters: false });
      awning(b, 0.78, 0.5, 0.26);
    });
    onFace(b, "front", w, d, 0, () => joists(b, w, ground + 0.04, jetty));
    b.at(0, 0, jetty / 2, 0, () => {
      const du = d + jetty;
      const wu = w + 0.06;
      halfTimbered(b, wu, du, ground + 0.04, eave, 0.36);
      for (const along of [-0.42, 0.42]) onFace(b, "front", wu, du, along, () => window(b, ground + 0.3, 0.24, 0.3, { team: true }));
      onFace(b, "right", wu, du, 0, () => window(b, ground + 0.3, 0.24, 0.3, { team: true }));
      gableRoof(b, wu, du, eave, ridge, "tiles", { overhang: 0.15, thickness: 0.06 });
      dormer(b, mirror * -0.3, du, eave, ridge, 0.36, "tiles");
      chimney(b, mirror * 0.48, -0.22, eave, ridge + 0.32);
      roofPennant(b, mirror * -(wu / 2 + 0.1), 0, ridge - 0.12);
    });
  });
  uncut(b, () => {
    barrel(b, mirror * 0.82, 0.72);
    crate(b, mirror * 0.6, 0.78, 0.2, 0, 0.3);
  });
}

/** Level 2, second look: the same storeys turned gable-on to the street, the framed gable jettied over the shop. */
function gabledTownhouse(b: GeometryBuilder): void {
  const w = 1.3;
  const d = 1.45;
  const ground = 0.92;
  const jetty = 0.12;
  const eave = 1.72;
  const ridge = 2.7;
  b.at(0, 0, -0.18, 0, () => {
    plinth(b, w, d, 0.1);
    block(b, w, d, 0, ground, "stone");
    quoins(b, w, d, 0.1, ground);
    onFace(b, "front", w, d, 0.3, () => door(b, 0.3, 0.6, 0.1, true));
    onFace(b, "front", w, d, -0.25, () => {
      window(b, 0.36, 0.34, 0.3, { stone: true, shutters: false });
      awning(b, 0.78, 0.5, 0.26);
    });
    onFace(b, "front", w, d, 0, () => joists(b, w, ground + 0.04, jetty));
    b.at(0, 0, jetty / 2, 0, () => {
      const du = d + jetty;
      const wu = w + 0.04;
      halfTimbered(b, wu, du, ground + 0.04, eave, 0.32);
      for (const along of [-0.3, 0.3]) onFace(b, "front", wu, du, along, () => window(b, ground + 0.3, 0.22, 0.3, { team: true }));
      onFace(b, "right", wu, du, 0.2, () => window(b, ground + 0.3, 0.22, 0.3, { team: true }));
      b.at(0, 0, 0, Math.PI / 2, () => gableRoof(b, du, wu, eave, ridge, "tiles", { overhang: 0.14, endOverhang: 0.1, thickness: 0.06, framed: true }));
      onFace(b, "front", wu, du, 0, () => window(b, eave + 0.18, 0.18, 0.22, { shutters: false }));
      chimney(b, -0.3, -0.45, eave, ridge + 0.25);
      roofPennant(b, 0, du / 2 + 0.06, ridge - 0.06);
    });
  });
  uncut(b, () => {
    barrel(b, 0.82, 0.74);
    crate(b, -0.82, 0.78, 0.2, 0, 0.3);
  });
}

/** Level 3: a three-storey manor with a gabled front wing, a corbelled corner turret, slate roofs and heraldry. */
function manor(b: GeometryBuilder, mirror: number): void {
  const w = 1.7;
  const d = 1.05;
  const ground = 0.98;
  const first = 1.66;
  const eave = 2.3;
  const ridge = 3.2;
  b.at(0, 0, -0.42, 0, () => {
    plinth(b, w, d, 0.12);
    block(b, w, d, 0, ground, "stone");
    quoins(b, w, d, 0.12, ground);
    onFace(b, "front", w, d, 0, () => joists(b, w, ground + 0.04, 0.1));
    b.at(0, 0, 0.05, 0, () => halfTimbered(b, w + 0.06, d + 0.1, ground + 0.04, first, 0.34));
    b.at(0, 0, 0.1, 0, () => {
      const du = d + 0.2;
      const wu = w + 0.1;
      onFace(b, "front", wu, du, 0, () => joists(b, wu, first + 0.04, 0.0));
      halfTimbered(b, wu, du, first + 0.04, eave, 0.3);
      for (const along of [-0.55, 0, 0.55]) onFace(b, "front", wu, du, along, () => window(b, first + 0.22, 0.2, 0.28, { team: true }));
      gableRoof(b, wu, du, eave, ridge, "slates", { overhang: 0.15, thickness: 0.06 });
      for (const x of [-0.45, 0.25]) dormer(b, mirror * x, du, eave, ridge, 0.32, "slates");
      for (const x of [-0.62, 0.62]) chimney(b, x, -0.3, eave, ridge + 0.4);
    });
    turret(b, mirror * -(w / 2 + 0.02), d / 2 + 0.2, 0.22, 1.1, 2.62, 3.3, "dressed", "slates");
  });
  // The front wing: its gable faces the camera, with the family arms over the door.
  b.at(mirror * 0.42, 0, 0.42, 0, () => {
    const ww = 0.74;
    const wd = 0.9;
    plinth(b, ww, wd, 0.12);
    block(b, ww, wd, 0, ground, "stone");
    quoins(b, ww, wd, 0.12, ground);
    onFace(b, "front", ww, wd, 0, () => archDoor(b, 0.34, 0.66));
    onFace(b, "front", ww, wd, 0, () => shield(b, 0.84, 0.13));
    halfTimbered(b, ww, wd, ground, 2.05, 0.3);
    onFace(b, "front", ww, wd, 0, () => window(b, 1.32, 0.3, 0.38, { team: true }));
    b.at(0, 0, 0, Math.PI / 2, () => gableRoof(b, wd, ww, 2.05, 2.85, "slates", { overhang: 0.12, endOverhang: 0.1, thickness: 0.06, framed: true }));
  });
  uncut(b, () => {
    barrel(b, mirror * -0.25, 0.82);
    crate(b, mirror * -0.48, 0.86, 0.2, 0, 0.4);
  });
}

export function house(b: GeometryBuilder, level: number, variant: number): void {
  const mirror = variant === 1 ? -1 : 1;
  if (level >= 3) manor(b, mirror);
  else if (level === 2) variant === 1 ? gabledTownhouse(b) : townhouse(b, mirror);
  else if (variant === 1) plankCottage(b);
  else cottage(b);
}

/** Level 1: an open-fronted shed of timber posts and boards, its stores in plain view. */
function shed(b: GeometryBuilder): void {
  const w = 1.6;
  const d = 1.0;
  const eave = 1.0;
  b.at(0, 0, -0.32, 0, () => {
    b.box([-w / 2, 0, -d / 2], [w / 2, 0.06, d / 2], "planks", { across: true });
    for (const x of [-w / 2, -0.27, 0.27, w / 2]) b.box([x - 0.05, 0, d / 2 - 0.1], [x + 0.05, eave, d / 2], "timber", { tint: DARK_TIMBER });
    b.box([-w / 2, 0.06, -d / 2], [w / 2, eave, -d / 2 + 0.05], "planks");
    for (const x of [-w / 2, w / 2 - 0.05]) b.box([x, 0.06, -d / 2], [x + 0.05, eave, d / 2 - 0.1], "planks");
    b.box([-w / 2, eave - 0.08, d / 2 - 0.1], [w / 2, eave, d / 2], "timber", { tint: DARK_TIMBER, across: true, bottom: true });
    gableRoof(b, w, d, eave, 1.55, "thatch", { overhang: 0.18, thickness: 0.12, gable: "planks" });
    uncut(b, () => {
      lumber(b, -0.38, -0.12, 0.6, 3);
      for (const [x, z] of [[0.15, -0.2], [0.35, -0.15], [0.25, 0.05]] as const) sack(b, x, z, x * 4);
      barrel(b, 0.6, -0.2);
      barrel(b, 0.6, 0.08, 0.11, 0.3);
    });
  });
  uncut(b, () => {
    cart(b, 0.45, 0.62, 0.2, "logs");
    stoneBlocks(b, -0.55, 0.62, 7);
    if (!b.ruined) pennant(b, -0.92, 0.85, 0, 1.25);
  });
}

/** Level 2: a boarded barn on a stone footing, its gable and team-painted doors toward the camera, with a hoist. */
function barn(b: GeometryBuilder): void {
  const w = 1.3;
  const d = 1.45;
  const eave = 1.1;
  const ridge = 2.05;
  b.at(-0.1, 0, -0.18, 0, () => {
    plinth(b, w, d, 0.18);
    block(b, w, d, 0.18, eave, "planks");
    for (const x of [-w / 2, w / 2]) b.box([x - 0.05, 0.18, d / 2 - 0.05], [x + 0.05, eave, d / 2 + 0.03], "timber", { tint: DARK_TIMBER });
    b.box([-w / 2, eave - 0.07, d / 2 - 0.02], [w / 2, eave, d / 2 + 0.03], "timber", { tint: DARK_TIMBER, across: true });
    b.at(0, 0, 0, Math.PI / 2, () => gableRoof(b, d, w, eave, ridge, "tiles", { overhang: 0.14, thickness: 0.06, gable: "planks", framed: true }));
    onFace(b, "front", w, d, 0, () => {
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? -0.34 : 0;
        const x1 = side < 0 ? 0 : 0.34;
        b.box([x0 + 0.01, 0.18, -0.01], [x1 - 0.01, 0.95, 0.03], "planks", { team: true });
        b.beam([x0 + 0.04, 0.22, 0.04], [x1 - 0.04, 0.9, 0.04], 0.045, "timber", { tint: DARK_TIMBER });
      }
      b.box([-0.4, 0.95, -0.01], [0.4, 1.02, 0.05], "timber", { tint: DARK_TIMBER, across: true });
      b.box([-0.14, 1.28, -0.01], [0.14, 1.56, 0.03], "dark", { tint: [0.05, 0.04, 0.03] });
      if (ridge <= b.localClip && !b.framing) {
        b.beam([0, 1.72, -0.1], [0, 1.72, 0.42], 0.07, "timber", { tint: DARK_TIMBER });
        b.beam([0, 1.72, 0.38], [0, 0.98, 0.38], 0.012, "paint", { tint: [0.5, 0.42, 0.3] });
        sack(b, 0, 0.38, 0);
      }
    });
    roofPennant(b, 0, d / 2 + 0.16, ridge - 0.05, 0.4);
  });
  // A lean-to on the right for crates.
  b.at(0.82, 0, -0.1, 0, () => {
    for (const z of [-0.5, 0.5]) b.box([0.12, 0, z - 0.04], [0.2, 0.62, z + 0.04], "timber", { tint: DARK_TIMBER });
    b.slab([[-0.08, 0.88, -0.6], [-0.08, 0.88, 0.6], [0.24, 0.62, 0.6], [0.24, 0.62, -0.6]], [[0, 0], [1.2, 0], [1.2, 0.4], [0, 0.4]], 0.04, "planks", {});
  });
  uncut(b, () => {
    crate(b, 0.82, -0.2, 0.2);
    crate(b, 0.84, 0.08, 0.18, 0, 0.6);
    barrel(b, 0.75, 0.75);
    sack(b, -0.72, 0.78, 0.4);
    sack(b, -0.85, 0.62, 1.2);
    lumber(b, -0.25, 0.92, 0.55);
  });
}

/** Level 3: a stone guild warehouse with a crow-stepped gable, buttresses, arched team doors and a loading crane. */
function warehouse(b: GeometryBuilder): void {
  const w = 1.5;
  const d = 1.45;
  const eave = 1.45;
  const ridge = 2.35;
  const dressed = { tint: DRESSED };
  b.at(0, 0, -0.22, 0, () => {
    plinth(b, w, d, 0.14);
    block(b, w, d, 0, eave, "dressed", dressed);
    quoins(b, w, d, 0.14, eave);
    b.at(0, 0, 0, Math.PI / 2, () => gableRoof(b, d, w, eave, ridge, "slates", { overhang: 0.12, endOverhang: 0, thickness: 0.06, gable: "dressed", gableTint: dressed.tint }));
    onFace(b, "front", w, d, 0, () => {
      archDoor(b, 0.5, 0.9);
      shield(b, 1.12, 0.16);
      for (const x of [-w / 2 + 0.02, w / 2 - 0.02]) b.at(x, 0, 0, 0, () => buttress(b, eave, "dressed", dressed, 0.15, 0.2));
      for (const x of [-0.45, 0.45]) b.at(x, 0, 0, 0, () => wallBanner(b, 0.55, 0.2, 0.6));
      if (ridge <= b.localClip && !b.framing) {
        crowSteps(b, w, eave, ridge, 4, "dressed", dressed);
        b.box([-0.12, 1.62, -0.01], [0.12, 1.92, 0.03], "door", { team: true });
        b.beam([0.26, 1.4, 0.04], [0.26, 2.05, 0.04], 0.05, "timber", { tint: DARK_TIMBER });
        b.beam([0.26, 2.02, 0.04], [0.26, 2.02, 0.5], 0.05, "timber", { tint: DARK_TIMBER });
        b.beam([0.26, 1.62, 0.04], [0.26, 1.98, 0.42], 0.035, "timber", { tint: DARK_TIMBER });
        b.beam([0.26, 2.0, 0.46], [0.26, 1.05, 0.46], 0.012, "paint", { tint: [0.5, 0.42, 0.3] });
        crate(b, 0.26, 0.46, 0.16, 0.9, 0.3);
      }
    });
    for (const along of [-0.4, 0.3]) onFace(b, "right", w, d, along, () => buttress(b, eave, "dressed", dressed, 0.14, 0.18));
    onFace(b, "right", w, d, -0.05, () => window(b, 0.85, 0.18, 0.32, { stone: true, shutters: false }));
  });
  uncut(b, () => {
    cart(b, -0.72, 0.72, 2.6, "sacks");
    for (const [x, z, s] of [[0.72, 0.62, 0.22], [0.86, 0.36, 0.2]] as const) crate(b, x, z, s, 0, x);
    crate(b, 0.74, 0.6, 0.16, 0.22, 0.8);
    barrel(b, 0.5, 0.86);
    sack(b, -0.4, 0.88, 0.4);
  });
}

export function storehouse(b: GeometryBuilder, level: number): void {
  if (level >= 3) warehouse(b);
  else if (level === 2) barn(b);
  else shed(b);
}

/** Tints over the golden thatch scan: young green shoots, ripe wheat, cabbages and pumpkins. */
const SHOOTS: Rgb = [0.6, 1.9, 1.1];
const RIPE_WHEAT: Rgb = [1.45, 1.75, 1.6];
const GOLDEN_WHEAT: Rgb = [1.65, 2.0, 1.7];
const VEGETABLE: Rgb = [0.45, 1.5, 0.9];
const PUMPKIN: Rgb = [0.75, 0.32, 0.04];

/** One row of crops along X: a continuous ridge of straw-textured stalks whose height rises and falls along it. */
function cropRow(b: GeometryBuilder, half: number, z: number, height: number, tint: Rgb, next: () => number, base = 0.15, top = 0.07): void {
  const pieces = 8;
  const length = (2 * half) / pieces;
  let h0 = height * (0.85 + next() * 0.3);
  for (let i = 0; i < pieces; i++) {
    const x0 = -half + i * length;
    const x1 = x0 + length;
    const h1 = height * (0.85 + next() * 0.3);
    const shade = 0.9 + next() * 0.2;
    const paint = { tint: [tint[0] * shade, tint[1] * shade, tint[2] * shade] as Rgb };
    for (const side of [1, -1]) {
      b.face(
        [[x0, 0.03, z + side * base], [x1, 0.03, z + side * base], [x1, h1, z + side * top], [x0, h0, z + side * top]],
        [[x0, 0], [x1, 0], [x1, h1], [x0, h0]],
        [0, base - top, side * ((h0 + h1) / 2 - 0.03)],
        "thatch",
        paint,
      );
    }
    b.face([[x0, h0, z + top], [x1, h1, z + top], [x1, h1, z - top], [x0, h0, z - top]], [[x0, 0], [x1, 0], [x1, top * 2], [x0, top * 2]], [0, 1, 0], "thatch", paint);
    h0 = h1;
  }
}

function pumpkins(b: GeometryBuilder, half: number, z: number, next: () => number): void {
  for (let x = -half + 0.15; x < half - 0.1; x += 0.24 + next() * 0.1) {
    b.cylinder(x, z + (next() - 0.5) * 0.08, 0.05, 0.02, 0.09, 6, "paint", { tint: PUMPKIN, topRadius: 0.035 });
  }
}

/** A field of crop rows inside a fence (level 2) or a dry-stone wall (level 3); level 1 is half sown. */
export function farm(b: GeometryBuilder, level: number): void {
  const half = 1.4;
  b.box([-half, 0, -half], [half, 0.03, half], "furrows", { top: true });
  const rows = 7;
  const next = random(level * 977 + 5);
  for (let i = 0; i < rows; i++) {
    const z = -half + 0.22 + (i / (rows - 1)) * (2 * half - 0.44);
    if (level === 1 && i % 2 === 1) continue;
    const vegetables = level >= 3 && i >= rows - 2;
    const tint = level === 1 ? SHOOTS : vegetables ? VEGETABLE : level >= 3 ? GOLDEN_WHEAT : RIPE_WHEAT;
    if (level === 1) cropRow(b, half - 0.12, z, 0.1, tint, next, 0.09, 0.035);
    else cropRow(b, half - 0.12, z, vegetables ? 0.12 : level >= 3 ? 0.28 : 0.24, tint, next);
    if (vegetables) pumpkins(b, half - 0.15, z + 0.1, next);
  }
  uncut(b, () => farmEdge(b, level, half));
}

function farmEdge(b: GeometryBuilder, level: number, half: number): void {
  const e = half + 0.04;
  if (level === 1) {
    for (const x of [-e, e]) for (const z of [-e, e]) b.box([x - 0.04, 0, z - 0.04], [x + 0.04, 0.3, z + 0.04], "timber", { tint: DARK_TIMBER });
    scarecrow(b, 0.55, 0.12);
    return;
  }
  if (level === 2) {
    fence(b, [[-0.35, e], [-e, e], [-e, -e], [e, -e], [e, e], [0.35, e]], 0.32);
    scarecrow(b, -0.55, -0.1);
    hayBale(b, 0.95, 0.95, 0.3);
    hayBale(b, 1.12, 0.62, 1.2);
    return;
  }
  const runs: [number, number, number, number][] = [[-e, e, -0.38, e], [0.38, e, e, e], [-e, -e, e, -e], [-e, -e, -e, e], [e, -e, e, e]];
  for (const [x0, z0, x1, z1] of runs) b.box([Math.min(x0, x1) - 0.07, 0, Math.min(z0, z1) - 0.07], [Math.max(x0, x1) + 0.07, 0.22, Math.max(z0, z1) + 0.07], "stone");
  for (const x of [-0.38, 0.38]) b.box([x - 0.1, 0, e - 0.1], [x + 0.1, 0.42, e + 0.1], "dressed");
  pennant(b, 0.38, e, 0.42, 0.5, 0.36);
  well(b, -1.12, -1.1);
  haystack(b, 1.1, -1.1);
  scarecrow(b, -0.5, -0.2);
}
