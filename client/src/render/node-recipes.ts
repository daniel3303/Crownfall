import { GeometryBuilder, type MeshData, type Rgb } from "./building-geometry";
import { DARK_TIMBER, GOLD, IRON, random } from "./building-parts";
import { stoneBlocks } from "./building-props";
import { boulderShape } from "./boulder";

const GREY_ROCK: Rgb = [0.82, 0.82, 0.86];
const WARM_ROCK: Rgb = [1.05, 0.95, 0.82];

/** Looks per resource node kind, picked by entity so neighbouring mines differ. */
export const NODE_VARIANTS = 3;

function boulder(b: GeometryBuilder, x: number, z: number, radius: number, height: number, seed: number, tint: Rgb, surface: "rock" | "iron" | "paint" = "rock", y = 0, detail = 2): void {
  const shape = boulderShape(radius, height, seed, detail);
  b.at(x, y, z, (seed % 7) * 0.9, () => b.indexed(shape.points, shape.normals, shape.uvs, shape.indices, surface, { tint }));
}

const BERRY: Rgb = [0.42, 0.02, 0.06];

/** Ripe berries dotted over the outside of a bush crown, which the tree build supplies. */
function berries(b: GeometryBuilder, variant: number): void {
  const next = random(variant * 53 + 29);
  for (let i = 0; i < 40; i++) {
    const angle = next() * Math.PI * 2;
    const rise = 0.15 + next() * 0.75;
    const out = Math.sqrt(1 - rise * rise);
    const size = 0.03 + next() * 0.018;
    boulder(b, Math.cos(angle) * out * 0.42, Math.sin(angle) * out * 0.42, size, size * 2, 300 + i, BERRY, "paint", 0.12 + rise * 0.5, 1);
  }
}

const SHAFT: Rgb = [0.02, 0.018, 0.015];
const LAMP: Rgb = [2.2, 1.5, 0.45];

/** A small ore cart on rails, heaped with gold. */
function oreCart(b: GeometryBuilder, z: number, seed: number): void {
  b.at(0, 0, z, 0, () => {
    b.box([-0.15, 0.08, -0.17], [0.15, 0.25, 0.17], "planks", { across: true });
    for (const y of [0.12, 0.22]) b.box([-0.155, y - 0.012, -0.175], [0.155, y + 0.012, 0.175], "iron", { tint: IRON });
    for (const x of [-0.13, 0.13]) for (const wz of [-0.1, 0.1]) b.tube([x - 0.02, 0.06, wz], [x + 0.02, 0.06, wz], 0.055, 6, "iron", { tint: IRON });
    for (let i = 0; i < 5; i++) boulder(b, (i % 3) * 0.08 - 0.08, Math.floor(i / 3) * 0.1 - 0.05, 0.06, 0.07, seed + i, GOLD, "iron", 0.22, 1);
  });
}

/** Gold ore in a weathered outcrop: a timbered adit, rails and a loaded cart, veins glinting in the rock. */
function goldMine(b: GeometryBuilder, variant: number): void {
  const next = random(variant * 131 + 17);
  const jitter = () => (next() - 0.5) * 0.12;
  const rocks: [number, number, number, number][] = [
    [0.0 + jitter(), -0.42, 0.92, 1.3],
    [-0.68 + jitter(), -0.02, 0.48, 0.78],
    [0.68 + jitter(), -0.06, 0.46, 0.7],
    [0.5 + jitter(), -0.8, 0.38, 0.55],
  ];
  rocks.forEach(([x, z, r, h], i) => boulder(b, x, z, r, h, 11 + i * 12 + variant * 5, WARM_ROCK));
  // Veins: ore half sunk into each rock's front face, catching the light.
  rocks.forEach(([x, z, r, h], i) => {
    for (let k = 0; k < 4; k++) {
      const side = (next() - 0.5) * r * 1.1;
      const y = h * (0.15 + next() * 0.45);
      boulder(b, x + side, z + r * 0.7, 0.07 + next() * 0.04, 0.09, 101 + i * 7 + k + variant * 13, GOLD, "iron", y, 1);
    }
  });
  b.at(0, 0, 0.34, 0, () => {
    b.box([-0.22, 0, -0.6], [0.22, 0.58, 0.0], "paint", { tint: SHAFT });
    for (const x of [-0.27, 0.27]) b.box([x - 0.06, 0, -0.1], [x + 0.06, 0.66, 0.06], "timber", { tint: DARK_TIMBER });
    b.box([-0.4, 0.62, -0.12], [0.4, 0.74, 0.08], "timber", { tint: DARK_TIMBER, across: true, bottom: true });
    for (const x of [-1, 1]) b.beam([x * 0.25, 0.4, 0.03], [x * 0.1, 0.62, 0.03], 0.045, "timber", { tint: DARK_TIMBER });
    b.box([0.33, 0.44, 0.07], [0.39, 0.52, 0.13], "paint", { tint: LAMP });
    b.box([0.32, 0.52, 0.06], [0.4, 0.54, 0.14], "iron", { tint: IRON });
  });
  for (const x of [-0.1, 0.1]) b.box([x - 0.014, 0.03, 0.28], [x + 0.014, 0.055, 1.0], "iron", { tint: IRON });
  for (let z = 0.34; z < 1.0; z += 0.13) b.box([-0.17, 0, z - 0.03], [0.17, 0.035, z + 0.03], "timber", { tint: DARK_TIMBER, across: true });
  oreCart(b, 0.74, 7 + variant * 3);
  for (let i = 0; i < 7; i++) boulder(b, -0.52 + (i % 4) * 0.09 + jitter() * 0.3, 0.52 + Math.floor(i / 4) * 0.1, 0.07, 0.08, 61 + i + variant, GOLD, "iron", 0, 1);
}

/** A crane of three poles over the quarry face, a block hanging from it. */
function derrick(b: GeometryBuilder, x: number, z: number): void {
  const apex: [number, number, number] = [x, 1.05, z];
  for (const [fx, fz] of [[-0.28, -0.12], [0.28, -0.12], [0, 0.3]] as const) b.beam([x + fx, 0, z + fz], apex, 0.04, "timber", { tint: DARK_TIMBER });
  b.beam([x, 1.03, z], [x, 0.42, z], 0.012, "paint", { tint: [0.5, 0.42, 0.3] });
  b.box([x - 0.09, 0.28, z - 0.07], [x + 0.09, 0.42, z + 0.07], "dressed");
}

/** A quarry: a stepped face of freshly cut rock in a ring of weathered outcrops, dressed blocks stacked for hauling and a crane. */
function stoneMine(b: GeometryBuilder, variant: number): void {
  const next = random(variant * 71 + 3);
  const jitter = () => (next() - 0.5) * 0.14;
  boulder(b, -0.45 + jitter(), -0.6, 0.6, 0.95, 51 + variant * 5, GREY_ROCK);
  boulder(b, 0.55 + jitter(), -0.62, 0.48, 0.8, 63 + variant * 5, GREY_ROCK);
  boulder(b, -0.82, 0.2 + jitter(), 0.34, 0.5, 77 + variant * 5, GREY_ROCK);
  // Quarried steps: crisp, pale faces where blocks were split off the rock.
  const cut = { tint: [1.05, 1.05, 1.08] as Rgb };
  b.box([-0.6, 0, -0.62], [0.55, 0.62, -0.08], "rock", cut);
  b.box([-0.5, 0, -0.08], [0.42, 0.36, 0.26], "rock", cut);
  b.box([-0.38, 0, 0.26], [0.18, 0.14, 0.5], "rock", cut);
  b.box([0.08, 0.36, -0.26], [0.42, 0.42, -0.08], "rock", { tint: [0.9, 0.9, 0.93] });
  stoneBlocks(b, 0.62, 0.45, 5 + variant);
  stoneBlocks(b, 0.4, 0.72, 9 + variant);
  derrick(b, 0.72, -0.05);
  for (let i = 0; i < 8; i++) boulder(b, -0.7 + next() * 1.1, 0.5 + next() * 0.4, 0.04 + next() * 0.04, 0.05, 201 + i + variant * 11, GREY_ROCK, "rock", 0, 1);
}

const RECIPES: Record<string, (b: GeometryBuilder, variant: number) => void> = { goldMine, stoneMine, berries };

export function hasNodeRecipe(id: string): boolean {
  return id in RECIPES;
}

export function nodeData(id: string, variant: number): MeshData {
  const b = new GeometryBuilder();
  RECIPES[id]!(b, variant);
  return b.data;
}

/** Small field stones scattered under the forest, scaled up per instance by the terrain. */
export const DECOR_ROCKS = 5;

export function decorRockData(variant: number): MeshData {
  const b = new GeometryBuilder();
  boulder(b, 0, 0, 0.13, 0.12, 401 + variant * 7, variant % 2 === 0 ? GREY_ROCK : WARM_ROCK);
  return b.data;
}
