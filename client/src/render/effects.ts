import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { InstanceBatch } from "./batch";

type Shape = "arrow" | "ring" | "disc" | "sphere" | "column";
type Rgb = [number, number, number];

interface Effect {
  shape: Shape;
  start: number;
  duration: number;
  /** Writes this frame's transform; returns the alpha, or a negative value to skip drawing. */
  frame(t: number, out: Transform): number;
  color: Rgb;
}

interface Transform {
  x: number;
  y: number;
  h: number;
  sx: number;
  sy: number;
  sz: number;
  yaw: number;
  pitch: number;
}

/** Short-lived visual feedback: projectiles, ability rings, meteor markers, level-up beams and order markers. */
export class Effects {
  private readonly batches: Record<Shape, InstanceBatch>;
  private effects: Effect[] = [];
  private readonly matrix = new Matrix();
  private readonly t: Transform = { x: 0, y: 0, h: 0, sx: 1, sy: 1, sz: 1, yaw: 0, pitch: 0 };
  private readonly scale = new Vector3();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();

  constructor(scene: Scene) {
    const material = new StandardMaterial("effects", scene);
    material.disableLighting = true;
    material.emissiveColor = Color3.White();
    material.backFaceCulling = false;
    const make = (mesh: Mesh) => {
      mesh.material = material;
      mesh.hasVertexAlpha = true;
      return new InstanceBatch(mesh, { color: 4 });
    };
    this.batches = {
      arrow: make(CreateBox("fx-arrow", { width: 0.55, height: 0.05, depth: 0.05 }, scene)),
      ring: make(CreateTorus("fx-ring", { diameter: 2, thickness: 0.12, tessellation: 40 }, scene)),
      disc: make(CreateCylinder("fx-disc", { diameter: 2, height: 0.02, tessellation: 40 }, scene)),
      sphere: make(CreateSphere("fx-sphere", { diameter: 2, segments: 10 }, scene)),
      column: make(CreateCylinder("fx-column", { diameter: 1, height: 1, tessellation: 20 }, scene)),
    };
  }

  projectile(x: number, y: number, tx: number, ty: number, durationMs: number, now: number, heavy: boolean): void {
    const yaw = Math.atan2(-(ty - y), tx - x);
    const arc = Math.min(1.6, Math.hypot(tx - x, ty - y) * 0.12);
    this.effects.push({
      shape: "arrow",
      start: now,
      duration: Math.max(80, durationMs),
      color: heavy ? [1, 0.75, 0.4] : [0.95, 0.92, 0.8],
      frame: (t, o) => {
        o.x = x + (tx - x) * t;
        o.y = y + (ty - y) * t;
        o.h = 0.8 + arc * 4 * t * (1 - t);
        o.yaw = yaw;
        o.pitch = arc * (1 - 2 * t) * 0.9;
        o.sx = heavy ? 1.4 : 1;
        o.sy = o.sz = heavy ? 2 : 1;
        return 1;
      },
    });
  }

  ring(x: number, y: number, radius: number, color: Rgb, durationMs: number, now: number, shrink = false): void {
    this.effects.push({
      shape: "ring",
      start: now,
      duration: durationMs,
      color,
      frame: (t, o) => {
        const r = shrink ? radius * (1 - t * 0.7) : radius * (0.15 + 0.85 * Math.sqrt(t));
        o.x = x;
        o.y = y;
        o.h = 0.12;
        o.sx = o.sz = r;
        o.sy = 1;
        return 1 - t * t;
      },
    });
  }

  marker(x: number, y: number, radius: number, durationMs: number, now: number): void {
    this.effects.push({
      shape: "disc",
      start: now,
      duration: durationMs,
      color: [1, 0.25, 0.1],
      frame: (t, o) => {
        o.x = x;
        o.y = y;
        o.h = 0.08;
        o.sx = o.sz = radius * (0.4 + 0.6 * t);
        o.sy = 1;
        return 0.25 + 0.25 * Math.abs(Math.sin(t * 18));
      },
    });
    this.ring(x, y, radius, [1, 0.35, 0.15], durationMs, now, false);
  }

  explosion(x: number, y: number, radius: number, color: Rgb, now: number): void {
    this.effects.push({
      shape: "sphere",
      start: now,
      duration: 450,
      color,
      frame: (t, o) => {
        o.x = x;
        o.y = y;
        o.h = 0;
        o.sx = o.sz = radius * (0.3 + 0.7 * t);
        o.sy = radius * 0.6 * (1 - t * 0.5);
        return 0.85 * (1 - t);
      },
    });
  }

  beam(x: number, y: number, color: Rgb, now: number): void {
    this.effects.push({
      shape: "column",
      start: now,
      duration: 1100,
      color,
      frame: (t, o) => {
        o.x = x;
        o.y = y;
        o.sy = 6 * Math.min(1, t * 3);
        o.h = o.sy / 2;
        o.sx = o.sz = 1.1 * (1 - t * 0.6);
        return 0.55 * (1 - t);
      },
    });
  }

  dust(x: number, y: number, size: number, now: number): void {
    this.explosion(x, y, size, [0.55, 0.5, 0.42], now);
  }

  update(now: number): void {
    for (const batch of Object.values(this.batches)) batch.begin();
    this.effects = this.effects.filter((effect) => now - effect.start < effect.duration);
    for (const effect of this.effects) {
      const t = Math.max(0, (now - effect.start) / effect.duration);
      const o = this.t;
      o.yaw = o.pitch = 0;
      const alpha = effect.frame(t, o);
      if (alpha < 0) continue;
      this.scale.set(o.sx, o.sy, o.sz);
      Quaternion.RotationYawPitchRollToRef(o.yaw, 0, o.pitch, this.rotation);
      this.position.set(o.x, o.h, -o.y);
      Matrix.ComposeToRef(this.scale, this.rotation, this.position, this.matrix);
      this.batches[effect.shape].pushColored(this.matrix, effect.color[0], effect.color[1], effect.color[2], alpha);
    }
    for (const batch of Object.values(this.batches)) batch.end();
  }
}
