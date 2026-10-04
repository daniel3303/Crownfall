// Builds client/public/assets/materials from CC0 Poly Haven scans: the stone, plaster, timber and roofing the procedural
// buildings are covered in, and the boulders of mines and quarries, one albedo and one surface image per material.
import { mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchSet, packSet } from "./texture-sets.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cache = join(here, ".cache", "materials");
const out = join(here, "../../client/public/assets/materials");
// A building covers a few hundred pixels on screen: half the ground's albedo resolution, and a quarter for the relief.
const ALBEDO_SIZE = 512;
const SURFACE_SIZE = 256;

// Order matches MATERIALS in client/src/render/building-kit.ts. Tint and brightness even out the scans' exposure.
const MATERIALS = [
  { name: "stone", id: "castle_wall_slates", brightness: 1.05, saturation: 0.9 },
  { name: "ashlar", id: "medieval_blocks_05", brightness: 1, saturation: 0.85 },
  { name: "plaster", id: "plastered_wall", brightness: 1, saturation: 1 },
  { name: "timber", id: "rough_wood", brightness: 0.85, saturation: 1.1 },
  { name: "planks", id: "weathered_brown_planks", brightness: 0.95, saturation: 0.95 },
  { name: "thatch", id: "thatch_roof_angled", brightness: 1.3, saturation: 1, tint: "#b08850" },
  { name: "tiles", id: "roof_09", brightness: 1, saturation: 1 },
  { name: "slate", id: "roof_slates_02", brightness: 0.95, saturation: 0.8 },
  { name: "door", id: "medieval_wood", brightness: 0.9, saturation: 1 },
  { name: "furrows", id: "farm_furrows", brightness: 1, saturation: 1 },
  { name: "rock", id: "rock_boulder_dry", brightness: 1, saturation: 0.9 },
];

mkdirSync(out, { recursive: true });
let total = 0;
for (const spec of MATERIALS) {
  const files = await fetchSet(cache, { source: "polyhaven", id: spec.id });
  for (const file of await packSet(files, out, spec.name, { albedoSize: ALBEDO_SIZE, surfaceSize: SURFACE_SIZE, ...spec })) {
    const size = statSync(file).size;
    total += size;
    console.log(`${(size / 1024).toFixed(0).padStart(6)} KB  materials/${file.split("/").pop()}`);
  }
}
console.log(`${(total / 1024).toFixed(0).padStart(6)} KB  total`);
