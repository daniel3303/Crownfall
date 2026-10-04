// Builds client/public/assets/buildings from CC0 Poly Haven scans: dressed sandstone (trim, and level 3 walls) and
// blue-grey slates (level 3 roofs), one albedo and one surface image each, at the sizes materials.mjs uses.
import { mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchSet, packSet } from "./texture-sets.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cache = join(here, ".cache", "materials");
const out = join(here, "../../client/public/assets/buildings");
// The client packs these into the same texture arrays as materials.mjs, so the sizes must match its.
const ALBEDO_SIZE = 512;
const SURFACE_SIZE = 256;

// Order matches LEVEL_MATERIALS in client/src/render/building-geometry.ts, appended after the materials.mjs surfaces.
const MATERIALS = [
  { name: "dressed", id: "large_sandstone_blocks_01", brightness: 1.05, saturation: 0.75 },
  { name: "slates", id: "grey_roof_tiles_02", brightness: 1, saturation: 0.9 },
];

mkdirSync(out, { recursive: true });
let total = 0;
for (const spec of MATERIALS) {
  const files = await fetchSet(cache, { source: "polyhaven", id: spec.id });
  for (const file of await packSet(files, out, spec.name, { albedoSize: ALBEDO_SIZE, surfaceSize: SURFACE_SIZE, ...spec })) {
    const size = statSync(file).size;
    total += size;
    console.log(`${(size / 1024).toFixed(0).padStart(6)} KB  buildings/${file.split("/").pop()}`);
  }
}
console.log(`${(total / 1024).toFixed(0).padStart(6)} KB  total`);
