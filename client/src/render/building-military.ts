import type { GeometryBuilder } from "./building-geometry";
import {
  DARK_TIMBER,
  DRESSED,
  archDoor,
  banner,
  block,
  buttress,
  chimney,
  coneRoof,
  door,
  dormer,
  gableRoof,
  halfTimbered,
  hipRoof,
  joists,
  machicolatedCircle,
  machicolatedTop,
  merlonCircle,
  merlonRing,
  merlons,
  onFace,
  pennant,
  plinth,
  quoins,
  roofPennant,
  shield,
  slit,
  turret,
  uncut,
  wallBanner,
  window,
} from "./building-parts";
import { barrel, crate, dummy, fence, lumber, sack, target, weaponRack, well } from "./building-props";

// Barracks, towers and the town center: timber at level 1, stone at 2, dressed stone, battlements and heraldry at 3.

function trainingYard(b: GeometryBuilder, level: number): void {
  weaponRack(b, -0.85, 0.75);
  dummy(b, 0.7, 0.75);
  dummy(b, 1.05, 1.1);
  target(b, -0.25, 1.15);
  if (level >= 2) {
    weaponRack(b, -0.85, 1.2);
    target(b, 0.25, 1.2);
  }
  if (level === 1) fence(b, [[-0.4, 1.42], [-1.42, 1.42], [-1.42, 0.2]], 0.3);
  if (level === 2) fence(b, [[-0.4, 1.42], [-1.42, 1.42], [-1.42, 0.2]], 0.32);
  if (level <= 2) fence(b, [[0.4, 1.42], [1.42, 1.42], [1.42, 0.2]], 0.32);
}

function barracksHall(b: GeometryBuilder, level: number): void {
  const w = 2.6;
  const d = 1.2;
  if (level === 1) {
    plinth(b, w, d);
    halfTimbered(b, w, d, 0.14, 1.1);
    onFace(b, "front", w, d, 0, () => door(b, 0.44, 0.72, 0.14, true));
    for (const along of [-0.8, 0.8]) onFace(b, "front", w, d, along, () => window(b, 0.55, 0.26, 0.28));
    hipRoof(b, w, d, 1.1, 2.0, "thatch", { overhang: 0.18, thickness: 0.13 });
    chimney(b, 0.85, -0.25, 1.2, 2.2);
    roofPennant(b, -(w / 2 - d / 2), 0, 1.95);
    return;
  }
  const ground = 0.88;
  plinth(b, w, d);
  block(b, w, d, 0, ground, "stone");
  quoins(b, w, d, 0.14, ground);
  onFace(b, "front", w, d, 0, () => door(b, 0.44, 0.66, 0.14, true));
  for (const along of [-0.42, 0.42]) onFace(b, "front", w, d, along, () => wallBanner(b, 0.32, 0.22, 0.5));
  for (const along of [-0.95, 0.95]) onFace(b, "front", w, d, along, () => window(b, 0.4, 0.24, 0.26, { stone: true, shutters: false }));
  onFace(b, "front", w, d, 0, () => joists(b, w, ground + 0.04, 0.1));
  b.at(0, 0, 0.05, 0, () => {
    halfTimbered(b, w + 0.04, d + 0.1, ground + 0.04, 1.58, 0.38);
    for (const along of [-0.75, 0, 0.75]) onFace(b, "front", w + 0.04, d + 0.1, along, () => window(b, ground + 0.22, 0.24, 0.26, { team: true }));
    gableRoof(b, w + 0.04, d + 0.1, 1.58, 2.48, "tiles", { overhang: 0.15, thickness: 0.06 });
    for (const x of [-0.7, 0.7]) dormer(b, x, d + 0.1, 1.58, 2.48, 0.34, "tiles");
    chimney(b, 0.95, -0.28, 1.6, 2.75);
    roofPennant(b, -(w / 2 + 0.16), 0, 2.38);
  });
}

/** Level 3: a dressed-stone hall with buttresses and a battlemented tower over an arched gateway. */
function fortifiedHall(b: GeometryBuilder): void {
  const w = 2.6;
  const d = 1.25;
  const eave = 1.45;
  const pale = { tint: DRESSED };
  plinth(b, w, d);
  block(b, w, d, 0, eave, "dressed", pale);
  onFace(b, "front", w, d, 0.35, () => archDoor(b, 0.5, 0.92));
  onFace(b, "front", w, d, 0.35, () => shield(b, 1.08, 0.15));
  for (const along of [-0.2, 0.9]) onFace(b, "front", w, d, along, () => wallBanner(b, 0.5, 0.26, 0.7));
  for (const along of [-w / 2 + 0.02, -0.55, 1.25]) onFace(b, "front", w, d, along, () => buttress(b, eave, "dressed", pale));
  for (const along of [-0.8, 0.62]) onFace(b, "front", w, d, along, () => window(b, 0.95, 0.12, 0.34, { stone: true, shutters: false }));
  gableRoof(b, w, d, eave, 2.35, "slates", { overhang: 0.14, thickness: 0.06, gable: "dressed", gableTint: DRESSED });
  b.at(-0.95, 0, 0.0, 0, () => {
    const s = 0.86;
    block(b, s, s, 0, 2.9, "dressed", pale);
    quoins(b, s, s, 0.2, 2.9);
    b.box([-s / 2, 2.78, -s / 2], [s / 2, 2.9, s / 2], "dressed", pale);
    machicolatedTop(b, s, s, 2.9, "dressed", pale);
    for (const face of ["front", "left"] as const) onFace(b, face, s, s, 0, () => slit(b, 1.9, 0.38));
    if (2.9 <= b.localClip) banner(b, 0, 0, 3.02, 0.8, 0.3);
  });
}

export function barracks(b: GeometryBuilder, level: number): void {
  b.at(0, 0, -0.62, 0, () => (level >= 3 ? fortifiedHall(b) : barracksHall(b, level)));
  uncut(b, () => {
    trainingYard(b, level);
    if (level <= 2) for (const x of [-0.36, 0.36]) banner(b, x, 0.25, 0, level === 1 ? 1.15 : 1.35);
    if (level >= 2) {
      barrel(b, -1.25, 0.4);
      crate(b, -1.2, 0.95, 0.22, 0, 0.4);
    }
    if (level >= 3) for (const x of [-1.3, 1.3]) pennant(b, x, 1.3, 0, 1.2, 0.36);
  });
}

function timberTower(b: GeometryBuilder): void {
  for (const x of [-0.42, 0.42]) {
    for (const z of [-0.42, 0.42]) {
      b.box([x - 0.12, 0, z - 0.12], [x + 0.12, 0.14, z + 0.12], "stone");
      b.cylinder(x, z, 0.07, 0.14, 2.75, 6, "timber");
    }
  }
  for (const [x0, z0, x1, z1] of [[-0.42, 0.42, 0.42, 0.42], [-0.42, -0.42, 0.42, -0.42], [0.42, -0.42, 0.42, 0.42], [-0.42, -0.42, -0.42, 0.42]] as const) {
    b.beam([x0, 0.3, z0], [x1, 2.2, z1], 0.05, "timber", { tint: DARK_TIMBER });
    b.beam([x1, 0.3, z1], [x0, 2.2, z0], 0.05, "timber", { tint: DARK_TIMBER });
  }
  // A ladder up the front to the platform.
  for (const x of [-0.12, 0.12]) b.beam([x, 0, 0.62], [x, 2.25, 0.46], 0.035, "timber", { tint: [0.9, 0.75, 0.55] });
  for (let y = 0.25; y < 2.2; y += 0.25) b.beam([-0.12, y, 0.62 - (y / 2.25) * 0.16], [0.12, y, 0.62 - (y / 2.25) * 0.16], 0.025, "timber", { tint: [0.9, 0.75, 0.55] });
  b.box([-0.58, 2.25, -0.58], [0.58, 2.33, 0.58], "planks", { bottom: true });
  for (const face of ["front", "back", "left", "right"] as const) onFace(b, face, 1.12, 1.12, 0, () => b.box([-0.56, 2.33, -0.05], [0.56, 2.62, 0], "planks", { across: true }));
  hipRoof(b, 1.12, 1.12, 3.0, 3.55, "thatch", { overhang: 0.14, thickness: 0.1 });
  roofPennant(b, 0, 0, 3.55, 0.4);
}

function stoneTower(b: GeometryBuilder): void {
  const s = 1.25;
  plinth(b, s, s);
  block(b, s, s, 0, 2.7, "stone");
  quoins(b, s, s, 0.14, 2.7);
  for (const face of ["front", "right"] as const) onFace(b, face, s, s, 0, () => slit(b, 1.5, 0.4));
  onFace(b, "front", s, s, 0, () => door(b, 0.3, 0.55, 0.14, true));
  b.box([-0.74, 2.62, -0.74], [0.74, 3.15, 0.74], "planks", { across: true, bottom: true, top: false });
  for (const face of ["front", "left", "right"] as const) {
    for (const along of [-0.35, 0, 0.35]) onFace(b, face, 1.48, 1.48, along, () => b.box([-0.03, 2.82, -0.01], [0.03, 3.0, 0.005], "dark"));
    onFace(b, face, 1.48, 1.48, 0, () => {
      for (const along of [-0.7, 0.7]) b.box([along - 0.04, 2.6, -0.01], [along + 0.04, 3.15, 0.03], "timber", { tint: DARK_TIMBER });
    });
  }
  hipRoof(b, 1.48, 1.48, 3.15, 4.0, "slate", { overhang: 0.1, thickness: 0.06 });
  roofPennant(b, 0, 0, 3.98, 0.42);
}

/** Level 3: a tall round keep-tower in dressed stone, machicolated, with a slate cone inside the battlements. */
function roundTower(b: GeometryBuilder): void {
  const pale = { tint: DRESSED };
  plinth(b, 1.45, 1.45, 0.12);
  b.cylinder(0, 0, 0.74, 0, 0.35, 14, "dressed", { ...pale, topRadius: 0.68, top: false });
  b.cylinder(0, 0, 0.68, 0.35, 3.45, 14, "dressed", { ...pale, topRadius: 0.6, top: false });
  machicolatedCircle(b, 0.6, 3.45, "dressed", pale, 10);
  for (const yaw of [0, Math.PI / 2, -Math.PI / 2]) b.at(0, 0, 0, yaw, () => b.at(0, 0, 0.64, 0, () => slit(b, 1.9, 0.4)));
  b.at(0, 0, 0.71, 0, () => archDoor(b, 0.32, 0.6, 0.1));
  b.at(0, 0, 0.66, 0, () => wallBanner(b, 1.2, 0.3, 0.75));
  b.cylinder(0, 0, 0.55, 3.45, 3.62, 12, "dressed", pale);
  coneRoof(b, 0.58, 3.62, 4.55, "slates");
  roofPennant(b, 0, 0, 4.7, 0.42, 0.48);
}

export function tower(b: GeometryBuilder, level: number): void {
  if (level >= 3) roundTower(b);
  else if (level === 2) stoneTower(b);
  else timberTower(b);
}

/** Level 1: a thatched great hall beside a small stone keep. */
function hallAndKeep(b: GeometryBuilder): void {
  b.at(0.62, 0, -0.68, 0, () => {
    const s = 1.5;
    plinth(b, s, s);
    block(b, s, s, 0, 2.75, "stone");
    quoins(b, s, s, 0.14, 2.75);
    onFace(b, "front", s, s, 0.3, () => door(b, 0.34, 0.66, 0.14, true));
    for (const face of ["front", "right"] as const) onFace(b, face, s, s, -0.2, () => slit(b, 1.8, 0.4));
    b.box([-s / 2 - 0.05, 2.63, -s / 2 - 0.05], [s / 2 + 0.05, 2.75, s / 2 + 0.05], "stone", { bottom: true });
    merlonRing(b, s + 0.1, s + 0.1, 2.75);
    if (2.75 <= b.localClip) banner(b, 0, 0, 2.75, 0.85, 0.32);
  });
  b.at(-0.78, 0, 0.5, 0, () => {
    const w = 2.1;
    const d = 1.2;
    plinth(b, w, d);
    halfTimbered(b, w, d, 0.14, 1.2);
    onFace(b, "front", w, d, -0.3, () => door(b, 0.36, 0.66, 0.14));
    for (const along of [0.35, 0.75]) onFace(b, "front", w, d, along, () => window(b, 0.55, 0.22, 0.26));
    onFace(b, "front", w, d, -0.75, () => window(b, 0.55, 0.22, 0.26));
    hipRoof(b, w, d, 1.2, 2.3, "thatch", { overhang: 0.18, thickness: 0.13 });
    chimney(b, -0.6, -0.3, 1.0, 2.5);
    roofPennant(b, -(w / 2 - d / 2), 0, 2.25);
  });
  uncut(b, () => {
    barrel(b, 1.6, 0.4);
    crate(b, 1.75, 0.05, 0.24, 0, 0.3);
    lumber(b, 0.45, 1.65, 0.6);
    sack(b, 1.5, 1.55, 0.5);
    well(b, 1.45, 1.2);
  });
}

/** Level 2: the keep under a slate roof, a stone-and-timber hall and a round tower. */
function stoneHall(b: GeometryBuilder): void {
  b.at(0.55, 0, -0.6, 0, () => {
    const s = 1.7;
    plinth(b, s, s);
    block(b, s, s, 0, 3.45, "stone");
    quoins(b, s, s, 0.14, 3.45);
    onFace(b, "front", s, s, 0.3, () => archDoor(b, 0.4, 0.78));
    onFace(b, "front", s, s, -0.4, () => wallBanner(b, 1.25, 0.34, 0.95));
    for (const face of ["front", "right"] as const) onFace(b, face, s, s, 0.1, () => slit(b, 2.3, 0.42));
    hipRoof(b, s, s, 3.45, 4.45, "slate", { overhang: 0.14, thickness: 0.06 });
    roofPennant(b, 0, 0, 4.42, 0.4, 0.48);
  });
  b.at(-0.85, 0, 0.55, 0, () => {
    const w = 2.0;
    const d = 1.2;
    plinth(b, w, d);
    block(b, w, d, 0, 0.95, "stone");
    onFace(b, "front", w, d, 0, () => joists(b, w, 0.99, 0.08));
    halfTimbered(b, w + 0.04, d + 0.04, 0.99, 1.68, 0.36);
    onFace(b, "front", w, d, -0.3, () => door(b, 0.36, 0.66, 0.1, true));
    for (const along of [0.3, 0.72]) onFace(b, "front", w, d, along, () => window(b, 0.42, 0.22, 0.26, { stone: true, shutters: false }));
    for (const along of [-0.6, 0, 0.6]) onFace(b, "front", w + 0.04, d + 0.04, along, () => window(b, 1.18, 0.22, 0.26, { team: true }));
    gableRoof(b, w + 0.04, d + 0.04, 1.68, 2.55, "tiles", { overhang: 0.14, thickness: 0.06 });
    dormer(b, 0.3, d + 0.04, 1.68, 2.55, 0.34, "tiles");
    chimney(b, -0.6, -0.3, 1.5, 2.85);
  });
  b.at(1.45, 0, 1.3, 0, () => {
    b.cylinder(0, 0, 0.42, 0, 2.6, 12, "stone", { top: false });
    b.at(0, 0, 0.42, 0, () => slit(b, 1.4, 0.35));
    coneRoof(b, 0.52, 2.6, 3.45, "slate");
    roofPennant(b, 0, 0, 3.55, 0.38);
  });
  uncut(b, () => {
    barrel(b, 0.85, 1.6);
    crate(b, 0.6, 1.72, 0.22, 0, 0.3);
    lumber(b, -0.3, 1.68, 0.6);
  });
}

/** Level 3: curtain walls with round corner towers and a gatehouse round a tall keep with corner bartizans. */
function castle(b: GeometryBuilder): void {
  const half = 1.68;
  const wallHeight = 1.45;
  const runs: [number, number, number, number][] = [
    [-half, -half, half, -half],
    [half, -half, half, half],
    [-half, -half, -half, half],
    [-half, half, -0.45, half],
    [0.45, half, half, half],
  ];
  b.box([-half, 0, -half], [half, 0.04, half], "stone", { shade: 0.85 });
  for (const [x0, z0, x1, z1] of runs) {
    b.box([Math.min(x0, x1) - 0.15, 0, Math.min(z0, z1) - 0.15], [Math.max(x0, x1) + 0.15, wallHeight, Math.max(z0, z1) + 0.15], "stone");
    merlons(b, x0, z0, x1, z1, wallHeight, 0.3);
  }
  for (const x of [-half, half]) {
    for (const z of [-half, half]) {
      b.at(x, 0, z, 0, () => {
        b.cylinder(0, 0, 0.46, 0, 0.3, 12, "stone", { topRadius: 0.42, top: false });
        b.cylinder(0, 0, 0.42, 0.3, 2.3, 12, "stone", { top: false });
        b.cylinder(0, 0, 0.47, 2.18, 2.3, 12, "stone", { top: false });
        coneRoof(b, 0.52, 2.3, 3.2, "slates");
        if (z > 0) b.at(0, 0, 0.42, 0, () => slit(b, 1.2, 0.35));
        roofPennant(b, 0, 0, 3.3, 0.35, 0.36);
      });
    }
  }
  gatehouse(b, half);
  b.at(0, 0, -0.35, 0, () => keep(b));
  uncut(b, () => {
    well(b, -1.05, 0.95);
    barrel(b, 1.05, 1.1);
    crate(b, 1.2, 0.85, 0.22, 0, 0.5);
  });
}

function gatehouse(b: GeometryBuilder, half: number): void {
  const pale = { tint: DRESSED };
  for (const x of [-0.5, 0.5]) {
    b.at(x, 0, half + 0.02, 0, () => {
      b.cylinder(0, 0, 0.27, 0, 2.15, 10, "dressed", { ...pale, top: false });
      b.cylinder(0, 0, 0.3, 2.05, 2.15, 10, "dressed", pale);
      merlonCircle(b, 0.26, 2.15, 6, "dressed", pale);
    });
  }
  b.box([-0.36, 1.25, half - 0.22], [0.36, 1.9, half + 0.2], "dressed", { ...pale, bottom: true });
  merlons(b, -0.3, half + 0.15, 0.3, half + 0.15, 1.9, 0.08, "dressed", pale);
  b.at(0, 0, half + 0.08, 0, () => {
    b.box([-0.26, 0.02, -0.04], [0.26, 1.25, 0.0], "dark", { tint: [0.03, 0.025, 0.02] });
    for (let i = 0; i <= 5; i++) b.box([-0.25 + i * 0.1 - 0.012, 0.25, 0.0], [-0.25 + i * 0.1 + 0.012, 1.25, 0.03], "iron", { tint: [0.2, 0.2, 0.22] });
    for (const y of [0.55, 0.95]) b.box([-0.26, y - 0.012, 0.0], [0.26, y + 0.012, 0.03], "iron", { tint: [0.2, 0.2, 0.22] });
  });
  b.at(0, 0, half + 0.2, 0, () => shield(b, 1.38, 0.2));
}

function keep(b: GeometryBuilder): void {
  const s = 1.7;
  const top = 4.1;
  const pale = { tint: DRESSED };
  block(b, s, s, 0, top, "dressed", pale);
  b.box([-s / 2, top - 0.12, -s / 2], [s / 2, top, s / 2], "dressed", pale);
  machicolatedTop(b, s, s, top, "dressed", pale);
  for (const face of ["right", "left"] as const) onFace(b, face, s, s, 0.35, () => slit(b, 2.6, 0.45));
  onFace(b, "front", s, s, 0, () => slit(b, 2.6, 0.45));
  onFace(b, "front", s, s, -0.35, () => wallBanner(b, 1.75, 0.42, 1.25));
  onFace(b, "front", s, s, 0.35, () => wallBanner(b, 1.75, 0.42, 1.25));
  onFace(b, "front", s, s, 0, () => archDoor(b, 0.42, 0.85));
  for (const x of [-1, 1]) for (const z of [-1, 1]) turret(b, x * (s / 2 + 0.06), z * (s / 2 + 0.06), 0.22, 3.25, 4.45, 5.1, "dressed", "slates", pale);
  if (top <= b.localClip) banner(b, 0, 0, top + 0.12, 1.1, 0.42);
}

export function townCenter(b: GeometryBuilder, level: number): void {
  if (level >= 3) castle(b);
  else if (level === 2) stoneHall(b);
  else hallAndKeep(b);
}

/** A plain plastered block for buildings without a recipe of their own. */
export function generic(b: GeometryBuilder): void {
  plinth(b, 1.4, 1.4);
  halfTimbered(b, 1.4, 1.4, 0.14, 1.1);
  onFace(b, "front", 1.4, 1.4, 0, () => door(b, 0.3, 0.6, 0.14));
  hipRoof(b, 1.4, 1.4, 1.1, 1.8, "slate");
}
