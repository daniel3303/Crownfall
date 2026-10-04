import { isWaterTile, Tile } from "../net/protocol";

/** Ground surfaces blended by the terrain shader, in splat channel order. */
export const LAYERS = ["grass", "meadow", "dirt", "sand", "forest", "lakebed"] as const;
export type LayerName = (typeof LAYERS)[number];

export const WATER_LEVEL = -0.12;
export const LAKE_DEPTH = -0.55;
/** How far below the surface a lake's shallow rim lies, so units wade in it up to the shin rather than sink. */
export const WADE_DEPTH = 0.14;
/** Wetness at which the ground meets the water surface; a blurred tile edge sits at 0.5, so shores stay on the edge. */
const SHORE = 0.47;
/** Terrain vertices per tile edge; the shoreline is smooth at this density once the water mask is blurred. */
export const HEIGHT_RES = 3;
/** Blend-weight texels per tile edge. */
export const SPLAT_RES = 4;

export interface TileGrid {
  width: number;
  height: number;
  tile(x: number, y: number): number;
  /** Ground worn bare round buildings, painted as dirt. */
  trodden?(x: number, y: number): boolean;
}

/** Deterministic per-cell noise so the ground looks the same on every client. */
export function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Smooth value noise in 0..1. */
export function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = hash2(x0, y0) + (hash2(x0 + 1, y0) - hash2(x0, y0)) * sx;
  const bottom = hash2(x0, y0 + 1) + (hash2(x0 + 1, y0 + 1) - hash2(x0, y0 + 1)) * sx;
  return top + (bottom - top) * sy;
}

/** Three octaves of value noise in 0..1, for organic patches and shore wobble. */
export function fbm(x: number, y: number): number {
  return valueNoise(x, y) * 0.55 + valueNoise(x * 2.1 + 17.3, y * 2.1 - 4.1) * 0.3 + valueNoise(x * 4.3 - 9.7, y * 4.3 + 21.2) * 0.15;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** A window of a field sampled at `res` cells per tile: corner (x, y) of the window is field cell (x0 + x, y0 + y). */
export interface FieldWindow {
  x0: number;
  y0: number;
  w: number;
  h: number;
}

/**
 * A tile mask (1 where `match` holds) sampled at `res` cells per tile and box-blurred over about a tile, as values in
 * 0..1 for the cells of `window`. Tiles beyond the map clamp to the edge. Two blur passes reach 2*res cells, so a window
 * padded by that much inside the map matches the whole-map result exactly.
 */
export function blurredMask(grid: TileGrid, res: number, match: (tile: number) => boolean, window: FieldWindow = fullField(grid, res, 1)): Float32Array {
  const pad = 2 * res;
  const fieldW = grid.width * res + 1;
  const fieldH = grid.height * res + 1;
  const px0 = Math.max(0, window.x0 - pad);
  const py0 = Math.max(0, window.y0 - pad);
  const w = Math.min(fieldW, window.x0 + window.w + pad) - px0;
  const h = Math.min(fieldH, window.y0 + window.h + pad) - py0;
  const raw = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tx = Math.min(grid.width - 1, Math.max(0, Math.floor((px0 + x - 0.5) / res)));
      const ty = Math.min(grid.height - 1, Math.max(0, Math.floor((py0 + y - 0.5) / res)));
      raw[y * w + x] = match(grid.tile(tx, ty)) ? 1 : 0;
    }
  }
  const blurred = boxBlur(boxBlur(raw, w, h, res), w, h, res);
  const out = new Float32Array(window.w * window.h);
  for (let y = 0; y < window.h; y++) {
    for (let x = 0; x < window.w; x++) out[y * window.w + x] = blurred[(window.y0 - py0 + y) * w + (window.x0 - px0 + x)]!;
  }
  return out;
}

function fullField(grid: TileGrid, res: number, extra: number): FieldWindow {
  return { x0: 0, y0: 0, w: grid.width * res + extra, h: grid.height * res + extra };
}

/** Separable box blur of radius r; two passes approximate a Gaussian. */
function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += src[y * w + Math.min(w - 1, Math.max(0, x + k))]!;
      tmp[y * w + x] = sum / (2 * r + 1);
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x]!;
      out[y * w + x] = sum / (2 * r + 1);
    }
  }
  return out;
}

/** Wetness an exposed land tile's core may reach: below the beach, so islets and spits stay dry. */
const DRY_CORE = SHORE - 0.16;
/** A land tile with at least this many water tiles around it would sink under the blur without a dry core. */
const EXPOSED_NEIGHBOURS = 5;

/** Land tiles mostly surrounded by water: islets and the tips of spits. */
function exposedLand(grid: TileGrid): Uint8Array {
  const exposed = new Uint8Array(grid.width * grid.height);
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (isWaterTile(grid.tile(x, y))) continue;
      let water = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < grid.width && ny < grid.height && isWaterTile(grid.tile(nx, ny))) water++;
        }
      }
      exposed[y * grid.width + x] = water >= EXPOSED_NEIGHBOURS ? 1 : 0;
    }
  }
  return exposed;
}

/**
 * How far into water field cell (x, y) is (0 on dry land, 1 deep), with a noisy shoreline instead of the tile staircase.
 * An exposed land tile keeps a round dry core, so the blur never sinks a one-tile island.
 */
function wetness(grid: TileGrid, exposed: Uint8Array, blurredWater: number, res: number, x: number, y: number): number {
  const wet = blurredWater + (fbm(x / res / 2.3, y / res / 2.3) - 0.5) * 0.32;
  const tx = Math.min(grid.width - 1, Math.floor(x / res));
  const ty = Math.min(grid.height - 1, Math.floor(y / res));
  if (!exposed[ty * grid.width + tx]) return wet;
  const fromCentre = Math.hypot(x / res - tx - 0.5, y / res - ty - 0.5);
  return Math.min(wet, DRY_CORE + (1 - DRY_CORE) * smoothstep(0.32, 0.5, fromCentre));
}

/** Ground heights at HEIGHT_RES vertices per tile: flat land at 0, a gentle beach, rounded lake beds. */
export function buildHeights(grid: TileGrid): Float32Array {
  const res = HEIGHT_RES;
  const w = grid.width * res + 1;
  const h = grid.height * res + 1;
  const water = blurredMask(grid, res, isWaterTile);
  const deep = blurredMask(grid, res, (t) => t === Tile.Water);
  const exposed = exposedLand(grid);
  const heights = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const wet = wetness(grid, exposed, water[y * w + x]!, res, x, y);
      // A short beach eases down to the waterline at wetness SHORE, so units on the last land tile stand nearly level;
      // then the bed eases down to full depth.
      const beach = WATER_LEVEL * smoothstep(SHORE - 0.15, SHORE, wet);
      const bed = beach + (LAKE_DEPTH - WATER_LEVEL) * smoothstep(SHORE, SHORE + 0.4, wet);
      // The shallow rim holds a wading depth; the bed only falls away to full depth where deep water surrounds it.
      const wade = WATER_LEVEL - WADE_DEPTH + (LAKE_DEPTH - WATER_LEVEL + WADE_DEPTH) * smoothstep(0.35, 0.75, deep[y * w + x]!);
      heights[y * w + x] = Math.max(bed, wade);
    }
  }
  return heights;
}

/** Blend weights for a block of splat texels, in the same packing as buildSplat. */
export interface SplatBlock {
  window: FieldWindow;
  first: Uint8Array;
  second: Uint8Array;
}

/**
 * Blend weights for every surface at SPLAT_RES texels per tile, packed as two RGBA images (layers 0-3, then 4-5).
 * Weights of a texel sum to 255. Forest floor follows the trees, sand rings the lakes, meadow and dirt come in noisy patches.
 */
export function buildSplat(grid: TileGrid): [Uint8Array, Uint8Array] {
  const block = splatBlock(grid, fullField(grid, SPLAT_RES, 0));
  return [block.first, block.second];
}

/** Recomputes the texels a changed tile can reach through the blur, so felling a tree costs a few hundred texels. */
export function splatAround(grid: TileGrid, tx: number, ty: number): SplatBlock {
  const reach = 2 * SPLAT_RES;
  const x0 = Math.max(0, tx * SPLAT_RES - reach);
  const y0 = Math.max(0, ty * SPLAT_RES - reach);
  const x1 = Math.min(grid.width * SPLAT_RES, (tx + 1) * SPLAT_RES + reach);
  const y1 = Math.min(grid.height * SPLAT_RES, (ty + 1) * SPLAT_RES + reach);
  return splatBlock(grid, { x0, y0, w: x1 - x0, h: y1 - y0 });
}

function splatBlock(grid: TileGrid, window: FieldWindow): SplatBlock {
  const res = SPLAT_RES;
  const water = blurredMask(grid, res, isWaterTile, window);
  const trees = blurredMask(grid, res, (t) => t === Tile.Tree, window);
  const exposed = exposedLand(grid);
  const yards = grid.trodden ? blurredMask({ width: grid.width, height: grid.height, tile: (x, y) => (grid.trodden!(x, y) ? 1 : 0) }, res, (t) => t === 1, window) : null;
  const first = new Uint8Array(window.w * window.h * 4);
  const second = new Uint8Array(window.w * window.h * 4);
  const weights = new Float32Array(LAYERS.length);
  for (let j = 0; j < window.h; j++) {
    for (let i = 0; i < window.w; i++) {
      const x = window.x0 + i;
      const y = window.y0 + j;
      const k = j * window.w + i;
      const wet = wetness(grid, exposed, water[k]!, res, x, y);
      const fx = x / res;
      const fy = y / res;
      const lakebed = smoothstep(0.42, 0.6, wet);
      const sand = smoothstep(0.12, 0.38, wet) * (1 - lakebed);
      const dry = 1 - sand - lakebed;
      const forest = smoothstep(0.25, 0.75, trees[k]! + (fbm(fx * 0.9 + 40, fy * 0.9) - 0.5) * 0.3) * dry;
      const open = dry - forest;
      // Yards fade out unevenly, as paths and wheel ruts do, rather than as a blurred square.
      const yard = yards ? smoothstep(0.2, 0.75, yards[k]! + (fbm(fx * 1.3 - 20, fy * 1.3 + 7) - 0.5) * 0.45) : 0;
      const meadow = smoothstep(0.48, 0.68, fbm(fx / 6, fy / 6)) * open * (1 - yard);
      const dirt = Math.max(smoothstep(0.72, 0.86, fbm(fx / 3.5 + 90, fy / 3.5 - 30)), yard * 0.9) * (open - meadow);
      weights[0] = open - meadow - dirt;
      weights[1] = meadow;
      weights[2] = dirt;
      weights[3] = sand;
      weights[4] = forest;
      weights[5] = lakebed;
      pack(weights, first, second, k * 4);
    }
  }
  return { window, first, second };
}

/** Quantizes six weights to bytes that sum to exactly 255, the remainder going to the largest. */
function pack(weights: Float32Array, first: Uint8Array, second: Uint8Array, o: number): void {
  let total = 0;
  let largest = 0;
  const bytes = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < weights.length; i++) total += Math.max(0, weights[i]!);
  for (let i = 0; i < weights.length; i++) {
    bytes[i] = Math.floor((Math.max(0, weights[i]!) / (total || 1)) * 255);
    if (weights[i]! > weights[largest]!) largest = i;
  }
  bytes[largest]! += 255 - bytes.reduce((a, b) => a + b, 0);
  first[o] = bytes[0]!;
  first[o + 1] = bytes[1]!;
  first[o + 2] = bytes[2]!;
  first[o + 3] = bytes[3]!;
  second[o] = bytes[4]!;
  second[o + 1] = bytes[5]!;
  second[o + 2] = 0;
  second[o + 3] = 255;
}
