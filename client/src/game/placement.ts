import type { BuildingDef } from "../content/content";
import { Tile } from "../net/protocol";
import type { ClientWorld } from "./world";

/** Longest wall line one drag lays, matching the server's cap. */
export const MAX_LINE_TILES = 40;

export interface LineCell {
  x: number;
  y: number;
  valid: boolean;
}

/** Top-left tile of a foundation centered under the cursor. */
export function placementOrigin(def: BuildingDef, x: number, y: number): { x: number; y: number } {
  return { x: Math.round(x - def.size / 2), y: Math.round(y - def.size / 2) };
}

/** Buildings laid by dragging a line of single tiles, such as walls. */
export function isLineBuilding(def: BuildingDef): boolean {
  return def.tags?.includes("line") ?? false;
}

/** Gates and wall towers, which may also be set into a tile of your own wall. */
export function fitsIntoWall(def: BuildingDef): boolean {
  return def.size === 1 && (def.tags?.includes("wall") ?? false) && !isLineBuilding(def);
}

function isOwnWall(world: ClientWorld, x: number, y: number): boolean {
  const blocker = world.blockerAt(x, y);
  return blocker !== undefined && blocker.info.category === "building" && isLineBuilding(blocker.info.def) && world.isMine(blocker.owner);
}

/** Client-side preview of the server's rule: explored dry ground, or shallows for walls, with no known building or node on it. */
export function canPlace(world: ClientWorld, def: BuildingDef, originX: number, originY: number): boolean {
  if (fitsIntoWall(def) && isOwnWall(world, originX, originY)) return true;
  const inShallows = def.tags?.includes("wall") ?? false;
  for (let y = originY; y < originY + def.size; y++) {
    for (let x = originX; x < originX + def.size; x++) {
      const tile = world.tile(x, y);
      if (tile !== Tile.Grass && tile !== Tile.Sand && !(inShallows && tile === Tile.Shallow)) return false;
      if (!world.fog.isExplored(x, y) || world.blockerAt(x, y)) return false;
    }
  }
  return true;
}

/** Bresenham tiles from start to end inclusive, capped at {@link MAX_LINE_TILES}; the server walks the same line. */
export function lineTiles(x1: number, y1: number, x2: number, y2: number): { x: number; y: number }[] {
  const tiles: { x: number; y: number }[] = [];
  const dx = Math.abs(x2 - x1);
  const dy = -Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let error = dx + dy;
  let x = x1;
  let y = y1;
  while (tiles.length < MAX_LINE_TILES) {
    tiles.push({ x, y });
    if (x === x2 && y === y2) break;
    const doubled = 2 * error;
    if (doubled >= dy) {
      error += dy;
      x += sx;
    }
    if (doubled <= dx) {
      error += dx;
      y += sy;
    }
  }
  return tiles;
}

/** A dragged line's cells, each valid where a foundation can go or your wall already stands (the line extends it). */
export function lineCells(world: ClientWorld, def: BuildingDef, start: { x: number; y: number }, end: { x: number; y: number }): LineCell[] {
  return lineTiles(start.x, start.y, end.x, end.y).map((t) => ({ ...t, valid: canPlace(world, def, t.x, t.y) || isOwnWall(world, t.x, t.y) }));
}
