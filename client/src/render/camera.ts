import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import "@babylonjs/core/Culling/ray";
import type { Scene } from "@babylonjs/core/scene";

const MIN_RADIUS = 14;
const MAX_RADIUS = 52;
const BETA = 0.72;

/** Camera distance at the start of a match; sizes in pixels are tuned for it. */
export const DEFAULT_ZOOM = 30;

/** Top-down RTS camera: fixed angle looking north, panned and zoomed by our own input code. */
export class RtsCamera {
  readonly camera: ArcRotateCamera;
  private readonly projected = new Vector3();
  private readonly identity = Matrix.Identity();

  constructor(
    private readonly scene: Scene,
    private readonly mapWidth: number,
    private readonly mapHeight: number,
  ) {
    this.camera = new ArcRotateCamera("camera", -Math.PI / 2, BETA, DEFAULT_ZOOM, Vector3.Zero(), scene);
    this.camera.inputs.clear();
    this.camera.minZ = 1;
    this.camera.maxZ = 400;
    this.camera.fov = 0.75;
  }

  /** Map position the camera looks at. */
  get focus(): { x: number; y: number } {
    return { x: this.camera.target.x, y: -this.camera.target.z };
  }

  get zoom(): number {
    return this.camera.radius;
  }

  /** How much larger the world draws than at the default zoom. */
  get scale(): number {
    return DEFAULT_ZOOM / this.camera.radius;
  }

  lookAt(x: number, y: number): void {
    this.camera.target.x = Math.min(this.mapWidth, Math.max(0, x));
    this.camera.target.z = -Math.min(this.mapHeight + 6, Math.max(0, y));
  }

  pan(dx: number, dy: number): void {
    const focus = this.focus;
    this.lookAt(focus.x + dx, focus.y + dy);
  }

  zoomBy(factor: number): void {
    this.camera.radius = Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, this.camera.radius * factor));
  }

  /** Where a screen pixel (CSS px relative to the canvas) hits the ground plane, in map coordinates. */
  groundAt(px: number, py: number): { x: number; y: number } | null {
    // Babylon converts CSS px to render px itself, using the hardware scaling level.
    const ray = this.scene.createPickingRay(px, py, this.identity, this.camera);
    if (Math.abs(ray.direction.y) < 1e-5) return null;
    const t = -ray.origin.y / ray.direction.y;
    if (t < 0) return null;
    return { x: ray.origin.x + ray.direction.x * t, y: -(ray.origin.z + ray.direction.z * t) };
  }

  /** Screen position (CSS px) of a map point at a height, or null when behind the camera. */
  toScreen(x: number, y: number, h: number): { x: number; y: number } | null {
    const engine = this.scene.getEngine();
    const width = engine.getRenderWidth();
    const height = engine.getRenderHeight();
    Vector3.ProjectToRef(
      new Vector3(x, h, -y),
      this.identity,
      this.scene.getTransformMatrix(),
      this.camera.viewport.toGlobal(width, height),
      this.projected,
    );
    if (this.projected.z < 0 || this.projected.z > 1) return null;
    const level = engine.getHardwareScalingLevel();
    return { x: this.projected.x * level, y: this.projected.y * level };
  }
}
