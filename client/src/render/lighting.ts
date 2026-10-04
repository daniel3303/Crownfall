import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent";
import type { Scene } from "@babylonjs/core/scene";
import type { RtsCamera } from "./camera";

const SHADOW_MAP_SIZE = 2048;
/** From the front-left, so faces toward the camera are sunlit and shadows fall back-right where they show. */
const SUN_DIRECTION = new Vector3(0.6, -1, 0.5).normalize();
const SUN_DISTANCE = 60;
const SUN_OFFSET = SUN_DIRECTION.scale(SUN_DISTANCE);
/** Tallest caster (the town center): its shadow can reach the view from beyond the screen edge. */
const CASTER_HEIGHT = 7;
const SHADOW_MARGIN = 1;
const SCREEN_CORNERS: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];
/** Cube face size of the prefiltered sky: it only lights, it is never seen. */
const ENVIRONMENT_SIZE = 128;
const ENVIRONMENT_INTENSITY = 0.5;

/** Sun, sky, camera-following shadows and the post-process chain (MSAA, bloom, tone mapping, vignette). */
export class SceneLighting {
  private readonly sun: DirectionalLight;
  private readonly shadows: ShadowGenerator;
  private readonly lightView = new Matrix();
  private readonly corner = new Vector3();
  private readonly casters: Mesh[] = [];
  private readonly culledCasters: Mesh[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly camera: RtsCamera,
  ) {
    this.sun = new DirectionalLight("sun", SUN_DIRECTION.clone(), scene);
    this.sun.intensity = 1.1;
    this.sun.diffuse = new Color3(1, 0.94, 0.82);
    this.sun.autoUpdateExtends = false;
    this.sun.shadowOrthoScale = 0;
    this.sun.shadowMinZ = 1;
    this.sun.shadowMaxZ = SUN_DISTANCE * 2;
    // Created after the sun: Babylon only applied the sun's shadows while it was the first light.
    createSky(scene);
    createEnvironment(scene);
    this.shadows = createShadows(this.sun);
    createPipeline(scene, camera);
  }

  /** A culled caster only renders into the shadow map while its bounds are near the view; others always do. */
  addCaster(mesh: Mesh, culled = false): void {
    (culled ? this.culledCasters : this.casters).push(mesh);
    this.shadows.addShadowCaster(mesh, false);
  }

  /** Fits the shadow box to the ground the camera sees, as the sun sees it, so shadows cover the screen at any zoom or aspect. */
  update(): void {
    const target = this.camera.camera.target;
    this.sun.position.copyFrom(target).subtractInPlace(SUN_OFFSET);
    // The same view matrix Babylon's shadow generator builds for a directional light.
    Matrix.LookAtLHToRef(this.sun.position, target, Vector3.UpReadOnly, this.lightView);
    const canvas = this.scene.getEngine().getRenderingCanvas();
    const width = canvas?.clientWidth ?? 0;
    const height = canvas?.clientHeight ?? 0;
    let left = Infinity;
    let right = -Infinity;
    let bottom = Infinity;
    let top = -Infinity;
    const view = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    for (const [sx, sy] of SCREEN_CORNERS) {
      const ground = this.camera.groundAt(sx * width, sy * height);
      if (!ground) continue;
      view.x0 = Math.min(view.x0, ground.x);
      view.x1 = Math.max(view.x1, ground.x);
      view.y0 = Math.min(view.y0, ground.y);
      view.y1 = Math.max(view.y1, ground.y);
      for (const h of [0, CASTER_HEIGHT]) {
        Vector3.TransformCoordinatesFromFloatsToRef(ground.x, h, -ground.y, this.lightView, this.corner);
        left = Math.min(left, this.corner.x);
        right = Math.max(right, this.corner.x);
        bottom = Math.min(bottom, this.corner.y);
        top = Math.max(top, this.corner.y);
      }
    }
    if (left === Infinity) return;
    this.cullCasters(view);
    this.sun.orthoLeft = left - SHADOW_MARGIN;
    this.sun.orthoRight = right + SHADOW_MARGIN;
    this.sun.orthoBottom = bottom - SHADOW_MARGIN;
    this.sun.orthoTop = top + SHADOW_MARGIN;
  }

  /** Babylon draws every shadow caster each frame, so off-screen forest chunks are left out of the shadow map. */
  private cullCasters(view: { x0: number; x1: number; y0: number; y1: number }): void {
    const list = this.shadows.getShadowMap()?.renderList;
    if (!list) return;
    const reach = CASTER_HEIGHT + SHADOW_MARGIN;
    const near = this.culledCasters.filter((mesh) => {
      const { minimumWorld: min, maximumWorld: max } = mesh.getBoundingInfo().boundingBox;
      return max.x >= view.x0 - reach && min.x <= view.x1 + reach && -min.z >= view.y0 - reach && -max.z <= view.y1 + reach;
    });
    list.splice(0, list.length, ...this.casters, ...near);
  }
}

function createSky(scene: Scene): void {
  const sky = new HemisphericLight("sky", new Vector3(0.2, 1, -0.3), scene);
  sky.intensity = 0.75;
  sky.diffuse = new Color3(0.92, 0.96, 1);
  sky.groundColor = new Color3(0.42, 0.38, 0.34);
  sky.specular = Color3.Black();
}

/** A real sky's light for the PBR ground, buildings and trees: soft ambient fill and reflections in glossy surfaces. */
function createEnvironment(scene: Scene): void {
  scene.environmentTexture = new HDRCubeTexture("/assets/sky.hdr", scene, ENVIRONMENT_SIZE, false, true, false, true);
  scene.environmentIntensity = ENVIRONMENT_INTENSITY;
}

function createShadows(sun: DirectionalLight): ShadowGenerator {
  const shadows = new ShadowGenerator(SHADOW_MAP_SIZE, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadows.bias = 0.0015;
  shadows.normalBias = 0.02;
  shadows.darkness = 0.2;
  return shadows;
}

function createPipeline(scene: Scene, camera: RtsCamera): void {
  const pipeline = new DefaultRenderingPipeline("post", true, scene, [camera.camera]);
  // Two samples: alpha-tested foliage gains nothing from more, and four cost a fifth of the frame rate at Retina sizes.
  pipeline.samples = scene.getEngine().getCaps().maxMSAASamples > 1 ? 2 : 1;
  pipeline.fxaaEnabled = pipeline.samples === 1;
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.82;
  pipeline.bloomWeight = 0.25;
  pipeline.bloomKernel = 48;
  pipeline.bloomScale = 0.5;
  pipeline.imageProcessingEnabled = true;
  const processing = pipeline.imageProcessing;
  processing.toneMappingEnabled = true;
  processing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  processing.exposure = 1.25;
  processing.contrast = 1.18;
  processing.vignetteEnabled = true;
  processing.vignetteWeight = 1.6;
  processing.vignetteColor = new Color4(0.05, 0.04, 0.03, 0);
  processing.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
}
