import type { EntityRecord } from "../net/protocol";

interface SightPattern {
  dx: Int16Array;
  dy: Int16Array;
  parent: Int32Array;
}

const patternCache = new Map<number, SightPattern>();

function stepBack(value: number, steps: number): number {
  const magnitude = Math.floor((Math.abs(value) * (steps - 1) * 2 + steps) / (2 * steps));
  return Math.sign(value) * magnitude;
}

/** The tile one step back toward the viewer, rounded half away from zero; the server's SightPattern.ParentOf. */
export function sightParent(dx: number, dy: number): [number, number] {
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  return [stepBack(dx, steps), stepBack(dy, steps)];
}

/**
 * Tiles within a sight radius (dx² + dy² ≤ r²) in ring order, each with the index of its parent on the line back to
 * the viewer; the same tree as the server's SightPattern.
 */
function sightPattern(radius: number): SightPattern {
  const cached = patternCache.get(radius);
  if (cached) return cached;
  const dx: number[] = [];
  const dy: number[] = [];
  const index = new Map<string, number>();
  for (let ring = 0; ring <= radius; ring++) {
    for (let y = -ring; y <= ring; y++) {
      for (let x = -ring; x <= ring; x++) {
        if (Math.max(Math.abs(x), Math.abs(y)) !== ring || x * x + y * y > radius * radius) continue;
        index.set(`${x},${y}`, dx.length);
        dx.push(x);
        dy.push(y);
      }
    }
  }
  const parent = dx.map((x, i) => {
    if (i === 0) return -1;
    const [px, py] = sightParent(x, dy[i]!);
    return index.get(`${px},${py}`)!;
  });
  const pattern = { dx: Int16Array.from(dx), dy: Int16Array.from(dy), parent: Int32Array.from(parent) };
  patternCache.set(radius, pattern);
  return pattern;
}

/**
 * Client fog of war for the viewer's team, stamped from the team's own entities in each snapshot. Trees block line of
 * sight exactly as in the server's VisionSystem; `blocksSight` reads the live tile map, so a felled tree stops blocking
 * at once.
 */
export class FogGrid {
  readonly visible: Uint8Array;
  readonly explored: Uint8Array;
  version = 0;
  private seen = new Uint8Array(1);

  constructor(
    readonly width: number,
    readonly height: number,
    private readonly blocksSight: (x: number, y: number) => boolean = () => false,
  ) {
    this.visible = new Uint8Array(width * height);
    this.explored = new Uint8Array(width * height);
  }

  update(entities: Iterable<EntityRecord>, isAlly: (owner: number) => boolean, sightOf: (entity: EntityRecord) => number): void {
    this.visible.fill(0);
    for (const entity of entities) {
      if (!isAlly(entity.owner)) continue;
      const sight = sightOf(entity);
      if (sight > 0) this.stamp(Math.floor(entity.x), Math.floor(entity.y), sight);
    }
    this.version++;
  }

  isVisible(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.visible[y * this.width + x] !== 0;
  }

  isExplored(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.explored[y * this.width + x] !== 0;
  }

  isRectVisible(x: number, y: number, size: number): boolean {
    for (let ty = y; ty < y + size; ty++) {
      for (let tx = x; tx < x + size; tx++) {
        if (this.isVisible(tx, ty)) return true;
      }
    }
    return false;
  }

  isRectExplored(x: number, y: number, size: number): boolean {
    for (let ty = y; ty < y + size; ty++) {
      for (let tx = x; tx < x + size; tx++) {
        if (!this.isExplored(tx, ty)) return false;
      }
    }
    return true;
  }

  private stamp(centerX: number, centerY: number, sight: number): void {
    const pattern = sightPattern(sight);
    const count = pattern.dx.length;
    if (this.seen.length < count) this.seen = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      const parent = pattern.parent[i]!;
      const seen =
        parent < 0 ||
        (this.seen[parent] === 1 && (parent === 0 || !this.blocksSight(centerX + pattern.dx[parent]!, centerY + pattern.dy[parent]!)));
      this.seen[i] = seen ? 1 : 0;
      const x = centerX + pattern.dx[i]!;
      const y = centerY + pattern.dy[i]!;
      if (!seen || !this.inBounds(x, y)) continue;
      const index = y * this.width + x;
      this.visible[index] = 1;
      this.explored[index] = 1;
    }
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }
}
