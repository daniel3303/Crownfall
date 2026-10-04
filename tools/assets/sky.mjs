// Builds client/public/assets/sky.hdr: a CC0 Poly Haven sky panorama shrunk for image-based lighting. Diffuse light and
// rough reflections need only a blurry sky, so a 256x128 Radiance file serves at a tenth of the download.
import { existsSync, mkdirSync, statSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cache = join(here, ".cache", "sky");
const out = join(here, "../../client/public/assets/sky.hdr");
const ID = "kloofendal_48d_partly_cloudy_puresky";
const SHRINK = 4;
// Poly Haven's terms ask API and download clients to identify themselves.
const USER_AGENT = "crownfall-asset-build/1.0";

async function download(url, file) {
  if (existsSync(file)) return;
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  writeFileSync(file, Buffer.from(await response.arrayBuffer()));
}

/** Parses a run-length encoded Radiance file into linear RGB floats. */
function readRadiance(bytes) {
  let offset = 0;
  const line = () => {
    const end = bytes.indexOf(0x0a, offset);
    const text = bytes.subarray(offset, end).toString("latin1");
    offset = end + 1;
    return text;
  };
  while (line() !== "");
  const [, height, , width] = line().split(" ").map(Number);
  const pixels = new Float32Array(width * height * 3);
  const scan = new Uint8Array(width * 4);
  for (let y = 0; y < height; y++) {
    if (bytes[offset] !== 2 || bytes[offset + 1] !== 2) throw new Error("Only new-style run-length encoding is supported");
    offset += 4;
    for (let channel = 0; channel < 4; channel++) {
      for (let x = 0; x < width; ) {
        let count = bytes[offset++];
        if (count > 128) {
          count -= 128;
          scan.fill(bytes[offset++], channel * width + x, channel * width + x + count);
        } else {
          scan.set(bytes.subarray(offset, offset + count), channel * width + x);
          offset += count;
        }
        x += count;
      }
    }
    for (let x = 0; x < width; x++) {
      const e = scan[3 * width + x];
      const scale = e === 0 ? 0 : 2 ** (e - 136);
      for (let c = 0; c < 3; c++) pixels[(y * width + x) * 3 + c] = (scan[c * width + x] + 0.5) * scale;
    }
  }
  return { width, height, pixels };
}

/** Writes linear RGB floats as a Radiance file, every channel of every scanline as literal runs. */
function writeRadiance({ width, height, pixels }) {
  const chunks = [Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`, "latin1")];
  for (let y = 0; y < height; y++) {
    const rgbe = new Uint8Array(width * 4);
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixels.subarray((y * width + x) * 3, (y * width + x) * 3 + 3);
      const top = Math.max(r, g, b);
      if (top < 1e-32) continue;
      const exponent = Math.ceil(Math.log2(top) + 1e-9);
      const scale = 256 / 2 ** exponent;
      rgbe.set([Math.min(255, r * scale), Math.min(255, g * scale), Math.min(255, b * scale)].map(Math.floor), x * 4);
      rgbe[x * 4 + 3] = exponent + 128;
    }
    const line = [2, 2, width >> 8, width & 255];
    for (let channel = 0; channel < 4; channel++) {
      for (let x = 0; x < width; x += 128) {
        const count = Math.min(128, width - x);
        line.push(count);
        for (let i = 0; i < count; i++) line.push(rgbe[(x + i) * 4 + channel]);
      }
    }
    chunks.push(Buffer.from(line));
  }
  return Buffer.concat(chunks);
}

function shrink({ width, height, pixels }) {
  const w = width / SHRINK;
  const h = height / SHRINK;
  const small = new Float32Array(w * h * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) small[(Math.floor(y / SHRINK) * w + Math.floor(x / SHRINK)) * 3 + c] += pixels[(y * width + x) * 3 + c] / (SHRINK * SHRINK);
    }
  }
  return { width: w, height: h, pixels: small };
}

mkdirSync(cache, { recursive: true });
const source = join(cache, `${ID}_1k.hdr`);
await download(`https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/${ID}_1k.hdr`, source);
writeFileSync(out, writeRadiance(shrink(readRadiance(readFileSync(source)))));
console.log(`${(statSync(out).size / 1024).toFixed(0).padStart(6)} KB  sky.hdr`);
