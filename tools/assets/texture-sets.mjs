// Shared by the ground and building texture builds: fetches CC0 photo-scanned texture sets and packs them for the
// client as an sRGB albedo plus a "surface" image holding the OpenGL normal's X and Y in red and green, roughness in blue.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

// Poly Haven's terms ask API and download clients to identify themselves.
const USER_AGENT = "crownfall-asset-build/1.0";

async function download(url, file) {
  if (existsSync(file)) return;
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  writeFileSync(file, Buffer.from(await response.arrayBuffer()));
}

/** Local paths of the colour, OpenGL normal and roughness maps of one Poly Haven or ambientCG set, cached under `cache`. */
export async function fetchSet(cache, { source, id }) {
  const dir = join(cache, id);
  mkdirSync(dir, { recursive: true });
  if (source === "polyhaven") {
    const maps = { color: "diff", normal: "nor_gl", roughness: "rough" };
    const files = {};
    for (const [key, suffix] of Object.entries(maps)) {
      files[key] = join(dir, `${id}_${suffix}_1k.jpg`);
      await download(`https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/${id}/${id}_${suffix}_1k.jpg`, files[key]);
    }
    return files;
  }
  const zip = join(dir, `${id}_1K-JPG.zip`);
  await download(`https://ambientcg.com/get?file=${id}_1K-JPG.zip`, zip);
  if (!readdirSync(dir).some((f) => f.endsWith("_Color.jpg"))) execFileSync("unzip", ["-oq", zip, "-d", dir]);
  return {
    color: join(dir, `${id}_1K-JPG_Color.jpg`),
    normal: join(dir, `${id}_1K-JPG_NormalGL.jpg`),
    roughness: join(dir, `${id}_1K-JPG_Roughness.jpg`),
  };
}

/** Writes `<name>_albedo.webp` and `<name>_surface.webp` into `out` and returns both paths. */
export async function packSet(files, out, name, { albedoSize, surfaceSize, brightness = 1, saturation = 1, tint }) {
  const albedo = join(out, `${name}_albedo.webp`);
  let colour = sharp(files.color).resize(albedoSize, albedoSize).modulate({ brightness, saturation });
  // A tint keeps the scan's luminance and replaces its chroma, for weathered greys that should read as a warmer material.
  if (tint) colour = colour.tint(tint);
  await colour.webp({ quality: 85 }).toFile(albedo);

  const normal = await sharp(files.normal).resize(surfaceSize, surfaceSize).removeAlpha().raw().toBuffer();
  const roughness = await sharp(files.roughness).resize(surfaceSize, surfaceSize).extractChannel(0).raw().toBuffer();
  const surface = Buffer.alloc(surfaceSize * surfaceSize * 3);
  for (let i = 0; i < surfaceSize * surfaceSize; i++) {
    surface[i * 3] = normal[i * 3];
    surface[i * 3 + 1] = normal[i * 3 + 1];
    surface[i * 3 + 2] = roughness[i];
  }
  // The lossless codec: chroma subsampling in lossy WebP would smear the normal's channels into each other.
  const surfaceFile = join(out, `${name}_surface.webp`);
  await sharp(surface, { raw: { width: surfaceSize, height: surfaceSize, channels: 3 } }).webp({ nearLossless: true, quality: 60, effort: 6 }).toFile(surfaceFile);
  return [albedo, surfaceFile];
}
