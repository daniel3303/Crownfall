// Builds client/public/assets/terrain from CC0 photo-scanned ground textures, one albedo and one surface image per layer.
import { mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchSet, packSet } from "./texture-sets.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cache = join(here, ".cache", "terrain");
const out = join(here, "../../client/public/assets/terrain");
const ALBEDO_SIZE = 1024;
// Normals and roughness only shade the scan's relief, so half the albedo's resolution holds them.
const SURFACE_SIZE = 512;

// Order matches LAYERS in client/src/render/terrain-field.ts. Tint and brightness even out the scans' exposure.
const LAYERS = [
  { layer: "grass", source: "ambientcg", id: "Grass004", brightness: 1.05, saturation: 1.05 },
  { layer: "meadow", source: "polyhaven", id: "forrest_ground_01", brightness: 1, saturation: 1 },
  { layer: "dirt", source: "polyhaven", id: "brown_mud_dry", brightness: 1, saturation: 1 },
  { layer: "sand", source: "polyhaven", id: "sand_01", brightness: 1, saturation: 1 },
  { layer: "forest", source: "polyhaven", id: "forest_leaves_04", brightness: 0.9, saturation: 0.9 },
  { layer: "lakebed", source: "polyhaven", id: "ganges_river_pebbles", brightness: 0.9, saturation: 0.85 },
];

mkdirSync(out, { recursive: true });
let total = 0;
for (const spec of LAYERS) {
  const files = await fetchSet(cache, spec);
  for (const file of await packSet(files, out, spec.layer, { albedoSize: ALBEDO_SIZE, surfaceSize: SURFACE_SIZE, ...spec })) {
    const size = statSync(file).size;
    total += size;
    console.log(`${(size / 1024).toFixed(0).padStart(6)} KB  terrain/${file.split("/").pop()}`);
  }
}
console.log(`${(total / 1024).toFixed(0).padStart(6)} KB  total`);
