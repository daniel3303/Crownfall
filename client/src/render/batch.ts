import type { Matrix } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Meshes/thinInstanceMesh";

const MATRIX_FLOATS = 16;

interface Attribute {
  name: string;
  stride: number;
  data: Float32Array;
}

/**
 * A mesh drawn with thin instances, refilled every frame with begin/push/end. Extra per-instance
 * attributes (team color, animation settings) are declared up front and written per slot. A culled batch
 * refits its bounds on every end() so the camera can skip it; others are always drawn.
 */
export class InstanceBatch {
  private capacity = 0;
  private matrices = new Float32Array(0);
  private readonly attributes: Attribute[];
  private readonly byName: Map<string, Attribute>;
  private count = 0;

  constructor(
    readonly mesh: Mesh,
    attributes: Record<string, number> = {},
    private readonly culled = false,
  ) {
    this.attributes = Object.entries(attributes).map(([name, stride]) => ({ name, stride, data: new Float32Array(0) }));
    this.byName = new Map(this.attributes.map((attribute) => [attribute.name, attribute]));
    mesh.isVisible = false;
    mesh.alwaysSelectAsActiveMesh = !culled;
    mesh.doNotSyncBoundingInfo = true;
    mesh.isPickable = false;
  }

  begin(): void {
    this.count = 0;
  }

  /** Adds an instance and returns its slot for write(). */
  push(matrix: Matrix): number {
    if (this.count === this.capacity) this.grow();
    matrix.copyToArray(this.matrices, this.count * MATRIX_FLOATS);
    return this.count++;
  }

  write(name: string, slot: number, a: number, b = 0, c = 0, d = 0): void {
    const attribute = this.byName.get(name);
    if (!attribute) return;
    const o = slot * attribute.stride;
    attribute.data[o] = a;
    if (attribute.stride > 1) attribute.data[o + 1] = b;
    if (attribute.stride > 2) attribute.data[o + 2] = c;
    if (attribute.stride > 3) attribute.data[o + 3] = d;
  }

  /** Shorthand for a colored instance. */
  pushColored(matrix: Matrix, r: number, g: number, b: number, a = 1): void {
    this.write("color", this.push(matrix), r, g, b, a);
  }

  end(): void {
    if (this.capacity > 0) {
      // The count goes first: Babylon uploads only thinInstanceCount instances.
      this.mesh.thinInstanceCount = this.count;
      this.mesh.thinInstanceBufferUpdated("matrix");
      for (const attribute of this.attributes) this.mesh.thinInstanceBufferUpdated(attribute.name);
      if (this.culled && this.count > 0) this.mesh.thinInstanceRefreshBoundingInfo(false);
    }
    this.mesh.isVisible = this.count > 0;
  }

  private grow(): void {
    this.capacity = Math.max(16, this.capacity * 2);
    const matrices = new Float32Array(this.capacity * MATRIX_FLOATS);
    matrices.set(this.matrices);
    this.matrices = matrices;
    this.mesh.thinInstanceSetBuffer("matrix", this.matrices, MATRIX_FLOATS, false);
    for (const attribute of this.attributes) {
      const data = new Float32Array(this.capacity * attribute.stride);
      data.set(attribute.data);
      attribute.data = data;
      this.mesh.thinInstanceSetBuffer(attribute.name, data, attribute.stride, false);
    }
  }
}
