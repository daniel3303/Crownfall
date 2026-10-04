// Renders a head-and-shoulders portrait of every built character model (units/<id>.glb), which includes every model the
// units in content/game.json draw.
// Headless Chrome on software WebGL, so no GPU changes the pixels, draws three.js served from node_modules.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const UNITS = join(ROOT, "client/public/assets/units");
const OUT = join(ROOT, "client/public/assets/portraits");
const THREE = fileURLToPath(new URL("./node_modules/three/", import.meta.url));
const HOST = "http://portraits.local";
const SIZE = 256;
const SUPERSAMPLE = 2;
/** Team-coloured cloth takes an undyed-wool brown outside every player palette, so a portrait never claims a side. */
const TEAM = "#8f7a5f";

/**
 * Camera framing around the Head bone, in head heights. yaw/pitch are degrees from the model's front (+Z); a negative yaw
 * looks from the model's right, where the weapon hand is. drop lowers the frame centre below the head centre; span is the
 * frame height.
 */
const DEFAULT_FRAMING = { clip: "Idle", time: 0, yaw: -35, pitch: -2, drop: 0.36, span: 2.1 };
const FRAMING = {
  troll: { pitch: -12, drop: 0.3 },
  wolf: { yaw: -48, pitch: 10, drop: 0.2, span: 2.0 },
  dragon: { yaw: -28, pitch: 4, drop: 0.3, span: 2.5 },
  knight: { yaw: -30, drop: 0.25, span: 2.5 },
  // Her idle aims the bow across her face; mid-stride it hangs at her side.
  ranger: { clip: "Move", time: 0.1 },
};

const PAGE = `<!doctype html><html><body style="margin:0;background:transparent">
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const size = ${SIZE * SUPERSAMPLE};
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(size, size);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.NeutralToneMapping;
document.body.append(renderer.domElement);
const studio = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const team = new THREE.Color("${TEAM}");

/** Mirrors the client's UnitSurfacePlugin dye: texels with alpha 128 hold grey cloth that the owner's colour multiplies. */
function tint(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.teamColor = { value: team };
    shader.fragmentShader = "uniform vec3 teamColor;\\n" + shader.fragmentShader.replace("#include <map_fragment>", \`#include <map_fragment>
      float teamMask = clamp((1.0 - diffuseColor.a) * 2.0, 0.0, 1.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, teamColor * diffuseColor.rgb * 2.27, teamMask);
      diffuseColor.a = 1.0;\`);
  };
}

function direction(yaw, pitch) {
  const y = THREE.MathUtils.degToRad(yaw), p = THREE.MathUtils.degToRad(pitch);
  return new THREE.Vector3(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p));
}

window.portrait = async (url, f) => {
  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene;
  const clip = gltf.animations.find((a) => a.name === f.clip);
  if (!clip) throw new Error(url + " has no clip " + f.clip);
  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(clip).play();
  mixer.setTime(f.time * clip.duration);
  model.updateMatrixWorld(true);

  let head;
  model.traverse((o) => { if (o.isBone && o.name === "Head") head = o; });
  if (!head) throw new Error(url + " has no Head bone");
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  model.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    tint(mesh.material);
    const onHead = mesh.skeleton.bones.map((bone) => { for (let b = bone; b; b = b.parent) if (b === head) return true; return false; });
    const joints = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight;
    for (let i = 0; i < joints.count; i++) {
      let joint = 0, best = -1;
      for (let k = 0; k < 4; k++) if (weights.getComponent(i, k) > best) { best = weights.getComponent(i, k); joint = joints.getComponent(i, k); }
      if (!onHead[joint]) continue;
      mesh.getVertexPosition(i, v);
      box.expandByPoint(v.applyMatrix4(mesh.matrixWorld));
    }
  });
  const height = box.max.y - box.min.y;
  const centre = box.getCenter(new THREE.Vector3()).addScaledVector(THREE.Object3D.DEFAULT_UP, -f.drop * height);

  const camera = new THREE.PerspectiveCamera(22, 1, 0.01, 100);
  const distance = (f.span * height) / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.copy(centre).addScaledVector(direction(f.yaw, f.pitch), distance);
  camera.near = distance / 20;
  camera.far = distance * 20;
  camera.updateProjectionMatrix();
  camera.lookAt(centre);

  const scene = new THREE.Scene();
  scene.environment = studio;
  scene.environmentIntensity = 0.55;
  scene.add(model);
  const light = (color, intensity, yaw, pitch) => {
    const l = new THREE.DirectionalLight(color, intensity);
    l.position.copy(centre).addScaledVector(direction(f.yaw + yaw, f.pitch + pitch), 10);
    l.target.position.copy(centre);
    scene.add(l, l.target);
  };
  light(0xfff1dc, 2.0, 40, 30); // key, warm, high on the camera's left
  light(0xdce8ff, 0.7, -60, 5); // fill, cool, from the camera's right
  light(0xffffff, 2.2, 160, 35); // rim, behind, to lift the silhouette off any background
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL("image/png");
};
window.ready = true;
</script></body></html>`;

const TYPES = { ".js": "text/javascript", ".glb": "model/gltf-binary" };

/** The file under `root` that `path` names, or null when it escapes the root or is not a file. */
function fileUnder(root, path) {
  const file = resolve(root, `.${path}`);
  return file.startsWith(resolve(root) + sep) && existsSync(file) && statSync(file).isFile() ? file : null;
}

/** Serves the page, three.js and the unit models from disk and aborts every other request, so nothing leaves the machine. */
async function serve(page) {
  await page.route("**", (route) => route.abort());
  await page.route(`${HOST}/**`, (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    if (path === "/") return route.fulfill({ body: PAGE, contentType: "text/html" });
    const file = path.startsWith("/three/") ? fileUnder(THREE, path.slice(6)) : path.startsWith("/units/") ? fileUnder(UNITS, path.slice(6)) : null;
    if (!file) return route.fulfill({ status: 404 });
    return route.fulfill({ body: readFileSync(file), contentType: TYPES[extname(file)] ?? "application/octet-stream" });
  });
}

export async function buildPortraits(only = []) {
  const game = JSON.parse(readFileSync(join(ROOT, "content/game.json"), "utf8"));
  // One portrait per character model; a unit borrowing another's model shows that one's portrait. Models built ahead of
  // the units that will draw them get theirs too.
  const built = readdirSync(UNITS).filter((file) => file.endsWith(".glb")).map((file) => file.slice(0, -4));
  const ids = [...new Set([...game.units.map((u) => u.model ?? u.id), ...built])].filter((id) => only.length === 0 || only.includes(id));
  mkdirSync(OUT, { recursive: true });
  // SwiftShader rather than the GPU keeps the render the same from machine to machine.
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    const page = await browser.newPage({ viewport: { width: SIZE * SUPERSAMPLE, height: SIZE * SUPERSAMPLE } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await serve(page);
    await page.goto(`${HOST}/`);
    await page.waitForFunction(() => window.ready === true, null, { timeout: 30_000 }).catch(() => {
      throw new Error(`The portrait page did not start: ${errors.join("; ")}`);
    });
    for (const id of ids) {
      if (!existsSync(join(UNITS, `${id}.glb`))) throw new Error(`No model units/${id}.glb for unit kind ${id}: run characters.mjs`);
      const framing = { ...DEFAULT_FRAMING, ...FRAMING[id] };
      const png = await page.evaluate(([url, f]) => window.portrait(url, f), [`${HOST}/units/${id}.glb`, framing]);
      const file = join(OUT, `${id}.webp`);
      await sharp(Buffer.from(png.split(",")[1], "base64"))
        .resize(SIZE, SIZE, { kernel: "lanczos3" })
        .webp({ quality: 82, alphaQuality: 90, effort: 6 })
        .toFile(file);
      console.log(`${String((statSync(file).size / 1024).toFixed(1)).padStart(6)} KB  portraits/${id}.webp`);
    }
  } finally {
    await browser.close();
  }
  if (only.length > 0) return;
  for (const file of readdirSync(OUT)) {
    if (file.endsWith(".webp") && !ids.includes(file.slice(0, -5))) unlinkSync(join(OUT, file));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await buildPortraits(process.argv.slice(2));
