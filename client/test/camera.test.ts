import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { RtsCamera } from "../src/render/camera";

/** A 1600x900 render target shown in an 800x450 CSS canvas: a 2x (Retina) screen. */
function retinaCamera(): RtsCamera {
  const engine = new NullEngine({ renderWidth: 1600, renderHeight: 900, textureSize: 256, deterministicLockstep: false, lockstepMaxSteps: 1 });
  // NullEngine ignores setHardwareScalingLevel, so stub what a 2x browser reports.
  engine.getHardwareScalingLevel = () => 0.5;
  engine.getRenderingCanvas = () => ({ clientWidth: 800, clientHeight: 450 }) as HTMLCanvasElement;
  const scene = new Scene(engine);
  const camera = new RtsCamera(scene, 100, 100);
  scene.activeCamera = camera.camera;
  camera.lookAt(40, 60);
  scene.render();
  return camera;
}

describe("RtsCamera on a high-DPI screen", () => {
  it("maps the centre of the screen to the point the camera looks at", () => {
    const ground = retinaCamera().groundAt(400, 225)!;
    expect(ground.x).toBeCloseTo(40, 3);
    expect(ground.y).toBeCloseTo(60, 3);
  });

  it("puts a clicked map point back under the cursor", () => {
    const camera = retinaCamera();
    const screen = camera.toScreen(47, 55, 0)!;
    expect(screen.x).toBeGreaterThan(0);
    expect(screen.x).toBeLessThan(800);
    const ground = camera.groundAt(screen.x, screen.y)!;
    expect(ground.x).toBeCloseTo(47, 3);
    expect(ground.y).toBeCloseTo(55, 3);
  });
});
