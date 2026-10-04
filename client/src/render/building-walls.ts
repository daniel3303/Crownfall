import type { GeometryBuilder, Paint, Rgb, Surface } from "./building-geometry";
import {
  DARK_TIMBER,
  DRESSED,
  IRON,
  coneRoof,
  hipRoof,
  machicolatedCircle,
  merlonCircle,
  merlons,
  onFace,
  pennant,
  shield,
  slit,
  wallBanner,
} from "./building-parts";
import { LAKE_DEPTH } from "./terrain-field";

// Wall tiles: a post, gate or tower at the tile centre plus an arm along +X toward each joined neighbour.
// Posts are at least as wide as arms, so corners never notch.

/** Footings reach the deepest lake bed, so a wall in shallows rises out of the water even where the rim drops away. */
export const WALL_FOOTING = LAKE_DEPTH;

interface StoneCourse {
  half: number;
  height: number;
  surface: Surface;
  paint: Paint;
}

/** Rubble stone at level 2; taller dressed stone with a battered foot at level 3. */
function course(level: number): StoneCourse {
  return level >= 3 ? { half: 0.21, height: 1.5, surface: "dressed", paint: { tint: DRESSED } } : { half: 0.17, height: 1.22, surface: "stone", paint: {} };
}

/** Fresh-cut logs, lighter than the tarred timber of buildings. */
const LOG: Rgb = [1.15, 1.0, 0.82];

function palisadeLog(b: GeometryBuilder, x: number, z: number, height: number, radius = 0.075): void {
  b.cylinder(x, z, radius, WALL_FOOTING, height, 6, "timber", { tint: LOG, top: false });
  b.cone(x, z, radius, height, height + radius * 2.2, 6, "timber", { tint: [1.3, 1.15, 0.95] });
}

export function wallPost(b: GeometryBuilder, level: number): void {
  if (level < 2) {
    palisadeLog(b, 0, 0, 1.25, 0.1);
    b.cylinder(0, 0, 0.105, 0.85, 0.9, 6, "iron", { tint: IRON, top: false });
    return;
  }
  const c = course(level);
  const half = c.half + 0.05;
  const top = c.height + 0.1;
  if (level >= 3) b.box([-half - 0.05, WALL_FOOTING, -half - 0.05], [half + 0.05, 0.32, half + 0.05], c.surface, c.paint);
  b.box([-half, WALL_FOOTING, -half], [half, top, half], c.surface, c.paint);
  b.box([-half - 0.03, top, -half - 0.03], [half + 0.03, top + 0.07, half + 0.03], c.surface, { ...c.paint, bottom: true });
  b.box([-half + 0.04, top + 0.07, -half + 0.04], [half - 0.04, top + 0.13, half - 0.04], c.surface, c.paint);
}

/** Straight and diagonal arms share one battlement rhythm, so merlons stay even across every join. */
const MERLON_PITCH = 0.24;

/** A run of wall from the tile centre along +X, `length` long (half a tile, or half a diagonal). */
export function wallArm(b: GeometryBuilder, level: number, length: number): void {
  if (level < 2) {
    const count = Math.max(2, Math.round(length / 0.13));
    for (let i = 1; i <= count; i++) palisadeLog(b, (i / count) * length, 0, 1.08 + ((i * 37) % 7) * 0.025);
    for (const y of [0.32, 0.82]) for (const z of [-0.09, 0.09]) b.beam([0.05, y, z], [length, y, z], 0.05, "timber", { tint: DARK_TIMBER });
    return;
  }
  const c = course(level);
  if (level >= 3) b.box([0, WALL_FOOTING, -c.half - 0.05], [length, 0.32, c.half + 0.05], c.surface, c.paint);
  b.box([0, WALL_FOOTING, -c.half], [length, c.height, c.half], c.surface, { ...c.paint, top: true });
  b.box([0, c.height - 0.06, -c.half - 0.025], [length, c.height, c.half + 0.025], c.surface, { ...c.paint, bottom: true });
  merlons(b, 0.02, c.half - 0.04, length, c.half - 0.04, c.height, 0.08, c.surface, c.paint, MERLON_PITCH);
  merlons(b, 0.02, -c.half + 0.04, length, -c.half + 0.04, c.height, 0.08, c.surface, c.paint, MERLON_PITCH);
}

/**
 * A gate across the wall line along X; units pass along Z. Its piers reach the tile edges to meet the arms, and both
 * faces are dressed alike because the gate's yaw follows its wall, so either face may turn to the camera.
 */
export function gate(b: GeometryBuilder, level: number): void {
  if (level >= 3) gatehouse(b);
  else if (level === 2) stoneGate(b);
  else timberGate(b);
}

function timberGate(b: GeometryBuilder): void {
  for (const x of [-0.4, 0.4]) palisadeLog(b, x, 0, 1.55, 0.11);
  b.beam([-0.5, 1.35, 0], [0.5, 1.35, 0], 0.09, "timber", { tint: DARK_TIMBER });
  b.box([-0.32, WALL_FOOTING, -0.07], [0.32, 0.03, 0.07], "timber", { tint: DARK_TIMBER });
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -0.3 : 0.005;
    const x1 = side < 0 ? -0.005 : 0.3;
    b.box([x0, 0.03, -0.035], [x1, 1.2, 0.035], "door");
    for (const yaw of [0, Math.PI]) {
      b.at(0, 0, 0, yaw, () => {
        b.beam([x0 + 0.03, 0.25, 0.05], [x1 - 0.03, 1.0, 0.05], 0.045, "timber", { tint: DARK_TIMBER });
        for (const y of [0.25, 1.0]) b.box([x0, y - 0.03, 0.035], [x1, y + 0.03, 0.06], "timber", { tint: DARK_TIMBER, across: true });
      });
    }
  }
  if (1.35 <= b.localClip) pennant(b, -0.4, 0, 1.6, 0.35, 0.34);
}

function stoneGate(b: GeometryBuilder): void {
  for (const x of [-0.38, 0.38]) {
    b.box([x - 0.12, WALL_FOOTING, -0.26], [x + 0.12, 1.95, 0.26], "stone");
    merlons(b, x - 0.12, 0.2, x + 0.12, 0.2, 1.95, 0.08);
    merlons(b, x - 0.12, -0.2, x + 0.12, -0.2, 1.95, 0.08);
  }
  b.box([-0.26, WALL_FOOTING, -0.22], [0.26, 0.02, 0.22], "stone");
  b.box([-0.26, 1.35, -0.22], [0.26, 1.7, 0.22], "stone", { bottom: true });
  for (const z of [-0.12, 0.12]) b.box([-0.26, 0.02, z - 0.03], [0.26, 1.35, z + 0.03], "door", { team: true });
  for (const z of [-0.16, 0.16]) for (const y of [0.3, 0.95]) b.box([-0.26, y, z - 0.012], [0.26, y + 0.04, z + 0.012], "iron", { tint: IRON });
  for (const yaw of [0, Math.PI]) b.at(0, 0, 0, yaw, () => b.at(0, 0, 0.22, 0, () => wallBanner(b, 1.38, 0.22, 0.28)));
}

/** Level 3: round drum towers on both faces of each pier, flanking an arch with a raised portcullis. */
function gatehouse(b: GeometryBuilder): void {
  const pale = { tint: DRESSED };
  for (const x of [-0.37, 0.37]) {
    b.at(x, 0, 0, 0, () => {
      b.box([-0.13, WALL_FOOTING, -0.3], [0.13, 2.0, 0.3], "dressed", pale);
      for (const yaw of [0, Math.PI]) {
        b.at(0, 0, 0, yaw, () => {
          b.cylinder(0, 0.18, 0.17, WALL_FOOTING, 2.05, 10, "dressed", { ...pale, top: false });
          b.cylinder(0, 0.18, 0.2, 2.05, 2.17, 10, "dressed", pale);
          b.at(0, 0, 0.18, 0, () => merlonCircle(b, 0.17, 2.17, 6, "dressed", pale));
          b.at(0, 0, 0.35, 0, () => slit(b, 1.15, 0.3));
        });
      }
      if (2.17 <= b.localClip) pennant(b, 0, 0.18, 2.17, 0.42, 0.36);
    });
  }
  b.box([-0.25, WALL_FOOTING, -0.26], [0.25, 0.02, 0.26], "dressed", pale);
  b.box([-0.25, 1.4, -0.26], [0.25, 1.92, 0.26], "dressed", { ...pale, bottom: true });
  merlons(b, -0.24, 0.2, 0.24, 0.2, 1.92, 0.08, "dressed", pale);
  merlons(b, -0.24, -0.2, 0.24, -0.2, 1.92, 0.08, "dressed", pale);
  for (const z of [-0.1, 0.1]) b.box([-0.25, 0.02, z - 0.03], [0.25, 1.4, z + 0.03], "door", { team: true });
  for (const yaw of [0, Math.PI]) {
    b.at(0, 0, 0, yaw, () => {
      b.at(0, 0, 0.16, 0, () => {
        for (let i = 0; i <= 4; i++) b.box([-0.22 + i * 0.11 - 0.012, 0.95, 0], [-0.22 + i * 0.11 + 0.012, 1.4, 0.025], "iron", { tint: IRON });
        b.box([-0.25, 1.05, 0], [0.25, 1.08, 0.025], "iron", { tint: IRON });
      });
      b.at(0, 0, 0.26, 0, () => shield(b, 1.48, 0.16));
    });
  }
}

export function wallTower(b: GeometryBuilder, level: number): void {
  if (level >= 3) dressedWallTower(b);
  else if (level === 2) stoneWallTower(b);
  else timberWallTower(b);
}

function timberWallTower(b: GeometryBuilder): void {
  for (const x of [-0.3, 0.3]) for (const z of [-0.3, 0.3]) b.cylinder(x, z, 0.065, WALL_FOOTING, 2.05, 6, "timber");
  for (const [x0, z0, x1, z1] of [[-0.3, 0.3, 0.3, 0.3], [-0.3, -0.3, 0.3, -0.3]] as const) {
    b.beam([x0, 0.3, z0], [x1, 1.6, z1], 0.045, "timber", { tint: DARK_TIMBER });
    b.beam([x1, 0.3, z1], [x0, 1.6, z0], 0.045, "timber", { tint: DARK_TIMBER });
  }
  b.box([-0.42, 1.6, -0.42], [0.42, 1.68, 0.42], "planks", { bottom: true });
  for (const face of ["front", "back", "left", "right"] as const) onFace(b, face, 0.84, 0.84, 0, () => b.box([-0.42, 1.68, -0.04], [0.42, 1.92, 0], "planks", { across: true }));
  hipRoof(b, 0.84, 0.84, 2.15, 2.65, "thatch", { overhang: 0.12, thickness: 0.09 });
  if (2.65 <= b.localClip && !b.framing) pennant(b, 0, 0, 2.62, 0.32, 0.32);
}

function stoneWallTower(b: GeometryBuilder): void {
  const radius = 0.47;
  const height = 2.3;
  b.cylinder(0, 0, radius + 0.04, WALL_FOOTING, 0.25, 12, "stone", { topRadius: radius, top: false });
  b.cylinder(0, 0, radius, 0.25, height, 12, "stone", { top: false });
  b.cylinder(0, 0, radius + 0.06, height, height + 0.2, 12, "stone");
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) b.at(0, 0, 0, yaw, () => b.at(0, 0, radius - 0.01, 0, () => slit(b, 1.3, 0.32)));
  merlonCircle(b, radius, height + 0.2, 8);
  if (height + 0.2 <= b.localClip) pennant(b, 0, 0, height + 0.2, 0.55, 0.38);
}

function dressedWallTower(b: GeometryBuilder): void {
  const pale = { tint: DRESSED };
  const radius = 0.5;
  const height = 2.55;
  b.cylinder(0, 0, radius + 0.08, WALL_FOOTING, 0.32, 12, "dressed", { ...pale, topRadius: radius, top: false });
  b.cylinder(0, 0, radius, 0.32, height, 12, "dressed", { ...pale, top: false });
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) b.at(0, 0, 0, yaw, () => b.at(0, 0, radius - 0.01, 0, () => slit(b, 1.5, 0.34)));
  machicolatedCircle(b, radius, height, "dressed", pale, 8);
  coneRoof(b, radius - 0.02, height + 0.12, 3.45, "slates");
  if (3.45 <= b.localClip && !b.framing) pennant(b, 0, 0, 3.55, 0.32, 0.36);
}
