import { GeometryBuilder, type MeshData } from "./building-geometry";
import { farm, house, storehouse } from "./building-homes";
import { barracks, generic, tower, townCenter } from "./building-military";
import { rubble, scaffold } from "./building-parts";
import { WALL_FOOTING, gate, wallArm, wallPost, wallTower } from "./building-walls";

/** How a building looks right now: finished, at one of the construction steps, or fallen. */
export type Stage = { kind: "finished" } | { kind: "construction"; step: number } | { kind: "ruin" };

export const FINISHED: Stage = { kind: "finished" };
export const RUIN: Stage = { kind: "ruin" };
/** Construction shows this many looks: three heights of rising walls, then the roof framing. */
export const CONSTRUCTION_STEPS = 4;
const RISE = [0.1, 0.38, 0.68];
/** Ruins keep the bottom of their walls. */
const RUIN_HEIGHT = 0.3;

export function constructionStep(progress: number): number {
  return Math.max(0, Math.min(CONSTRUCTION_STEPS - 1, Math.floor((progress / 100) * CONSTRUCTION_STEPS)));
}

interface Recipe {
  /** The highest level with its own look; content may define more and they reuse it. */
  levels: number;
  variants?: number;
  /** Per look: the stated top for health bars and picking, 0.2 under the highest pennant tip. */
  height: readonly number[];
  /** Per look: the roofline that construction, ruins and scaffolds rise to; `height` when absent. */
  body?: readonly number[];
  draw: (b: GeometryBuilder, level: number, variant: number) => void;
}

/** Every building has three looks, one per level; heights rise with the level so health bars and picking follow. */
const RECIPES: Record<string, Recipe> = {
  house: { levels: 3, variants: 2, height: [2.15, 2.95, 3.53], body: [1.95, 2.7, 3.25], draw: house },
  storehouse: { levels: 3, height: [1.55, 2.24, 2.45], body: [1.55, 2.05, 2.45], draw: (b, level) => storehouse(b, level) },
  farm: { levels: 3, height: [0.6, 0.65, 0.9], draw: (b, level) => farm(b, level) },
  barracks: { levels: 3, height: [2.24, 2.68, 3.67], body: [2.0, 2.48, 3.2], draw: (b, level) => barracks(b, level) },
  tower: { levels: 3, height: [3.78, 4.24, 4.96], body: [3.55, 4.0, 4.6], draw: (b, level) => tower(b, level) },
  townCenter: { levels: 3, height: [3.5, 4.66, 5.33], body: [3.5, 4.45, 5.0], draw: (b, level) => townCenter(b, level) },
};

const GENERIC: Recipe = { levels: 1, height: [1.8], draw: generic };

function recipeOf(id: string): Recipe {
  return RECIPES[id] ?? WALL_RECIPES[id] ?? GENERIC;
}

/** The roofline a look's construction, ruin and scaffolding rise to. */
function bodyOf(recipe: Recipe, look: number): number {
  return (recipe.body ?? recipe.height)[look - 1]!;
}

/** The look levels a building has, so callers clamp a higher content level to the last one drawn. */
export function lookLevel(id: string, level: number): number {
  return Math.max(1, Math.min(recipeOf(id).levels, Math.floor(level)));
}

/** How many level looks a building's recipe draws; content levels beyond it reuse the last. */
export function lookCount(id: string): number {
  return recipeOf(id).levels;
}

export function variantsOf(id: string): number {
  return recipeOf(id).variants ?? 1;
}

export function buildingHeight(id: string, level: number): number {
  return recipeOf(id).height[lookLevel(id, level) - 1]!;
}

/** Mesh data for one building look, in model space with the front toward +Z. */
export function buildingData(id: string, size: number, level: number, variant: number, stage: Stage): MeshData {
  const recipe = recipeOf(id);
  const look = lookLevel(id, level);
  const b = new GeometryBuilder();
  const height = bodyOf(recipe, look);
  if (stage.kind === "construction") {
    const step = Math.min(stage.step, CONSTRUCTION_STEPS - 1);
    if (step < RISE.length) b.clipY = height * RISE[step]!;
    else b.framing = true;
    recipe.draw(b, look, variant);
    if (size > 1 && id !== "farm") scaffold(b, size * 0.78, size * 0.7, Math.min(height, (b.clipY === Infinity ? height : b.clipY) + 0.3));
    return b.data;
  }
  if (stage.kind === "ruin") {
    b.clipY = Math.max(0.3, height * RUIN_HEIGHT);
    b.ruined = true;
    recipe.draw(b, look, variant);
    rubble(b, size * 0.85, size * 0.85, size * 31 + look);
    return b.data;
  }
  recipe.draw(b, look, variant);
  return b.data;
}

/** Scaffolding alone, raised round a standing building while it is upgraded. */
export function upgradeScaffoldData(id: string, size: number, level: number): MeshData {
  const b = new GeometryBuilder();
  scaffold(b, size * 0.78, size * 0.7, Math.max(0.9, bodyOf(recipeOf(id), lookLevel(id, level)) * 0.8), isWallKind(id) ? WALL_FOOTING : 0);
  return b.data;
}

// ----- Walls: each tile draws a post (or a gate, or a tower) plus an arm toward every connected neighbour. -----

export const WALL_KINDS = ["wall", "gate", "wallTower"] as const;
export type WallPiece = "post" | "arm" | "diagonal";

const WALL_RECIPES: Record<string, Recipe> = {
  wall: { levels: 3, height: [1.4, 1.45, 1.75], draw: (b, level) => wallPost(b, level) },
  gate: { levels: 3, height: [1.79, 1.95, 2.43], body: [1.65, 1.95, 2.35], draw: (b, level) => gate(b, level) },
  wallTower: { levels: 3, height: [2.78, 2.88, 3.7], body: [2.6, 2.75, 3.45], draw: (b, level) => wallTower(b, level) },
};

/** One wall piece: the post or an arm of a wall tile, at a level and stage. Gates and towers draw only their post. */
export function wallPieceData(id: string, piece: WallPiece, level: number, stage: Stage): MeshData {
  const look = lookLevel(id, level);
  const b = new GeometryBuilder();
  const height = bodyOf(recipeOf(id), look);
  if (stage.kind === "construction") {
    const step = Math.min(stage.step, CONSTRUCTION_STEPS - 1);
    if (step < RISE.length) b.clipY = height * RISE[step]!;
    else b.framing = true;
  } else if (stage.kind === "ruin") {
    b.clipY = Math.max(0.25, height * RUIN_HEIGHT);
    b.ruined = true;
  }
  if (piece === "post") recipeOf(id).draw(b, look, 0);
  else wallArm(b, lookLevel("wall", level), piece === "arm" ? 0.5 : Math.SQRT1_2);
  if (stage.kind === "ruin" && piece === "post") rubble(b, 0.8, 0.8, look * 13 + id.length);
  return b.data;
}

export function isWallKind(id: string): boolean {
  return (WALL_KINDS as readonly string[]).includes(id);
}

