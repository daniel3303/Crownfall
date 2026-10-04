// Builds client/public/assets/env.glb from the CC0 KayKit Medieval Hexagon pack: the lake plants, each as a named node.
// Buildings, mines and rocks are procedural (client/src/render/building-*.ts); unit characters come from characters.mjs.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, mergeDocuments, prune, quantize, unpartition } from "@gltf-transform/functions";

const here = dirname(fileURLToPath(import.meta.url));
const cache = process.env.KAYKIT_DIR ?? join(here, ".cache");
const out = join(here, "../../client/public/assets");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

// Pinned commits keep rebuilds reproducible.
const PACKS = {
  hexagon: { repo: "KayKit-Medieval-Hexagon-Pack-1.0", commit: "84fa4e91af6a88989be7c99e0891cede11f2ca38" },
};

// Must match WATER_PLANTS in client/src/render/terrain.ts.
const WATER_PLANTS = ["waterlily_A", "waterlily_B", "waterplant_A", "waterplant_B", "waterplant_C"];

function packFile(path) {
  const [pack, ...rest] = path.split("/");
  const file = rest.join("/");
  const base = join(cache, PACKS[pack].repo, "addons");
  return join(base, "kaykit_medieval_hexagon_pack", "Assets/gltf", file);
}

function headOf(dir) {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "an unfinished fetch";
  }
}

function ensurePacks() {
  mkdirSync(cache, { recursive: true });
  for (const { repo, commit } of Object.values(PACKS)) {
    const dir = join(cache, repo);
    const git = (...args) => execFileSync("git", ["-C", dir, ...args], { stdio: "inherit" });
    if (existsSync(dir)) {
      const head = headOf(dir);
      if (head !== commit) throw new Error(`${dir} is at ${head}, not the pinned ${commit}; delete it to refetch`);
      continue;
    }
    mkdirSync(dir);
    git("init", "--quiet");
    git("fetch", "--depth", "1", `https://github.com/KayKit-Game-Assets/${repo}.git`, commit);
    git("checkout", "--quiet", "FETCH_HEAD");
  }
}

async function buildEnvironment() {
  const target = new Document();
  const scene = target.createScene("env");
  const hex = (folder, name) => packFile(`hexagon/${folder}/${name}.gltf`);
  const sources = WATER_PLANTS.map((n) => [n, hex("decoration/nature", n)]);
  for (const [name, path] of sources) {
    const source = await io.read(path);
    const map = mergeDocuments(target, source);
    const copied = map.get(source.getRoot().listScenes()[0]);
    const holder = target.createNode(name);
    for (const child of copied.listChildren()) holder.addChild(child);
    scene.addChild(holder);
    copied.dispose();
  }
  await target.transform(unpartition(), dedup(), quantize(), prune());
  const file = join(out, "env.glb");
  await io.write(file, target);
  return file;
}

ensurePacks();
const files = [await buildEnvironment()];
let total = 0;
for (const file of files) {
  const size = statSync(file).size;
  total += size;
  console.log(`${(size / 1024).toFixed(0).padStart(6)} KB  ${file.replace(out + "/", "")}`);
}
console.log(`${(total / 1024).toFixed(0).padStart(6)} KB  total`);
