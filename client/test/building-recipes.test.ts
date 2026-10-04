import { describe, expect, it } from "vitest";
import { buildingLevels, content } from "../src/content/content";
import { FLAT_SURFACES, MATERIALS, layerOf, type MeshData } from "../src/render/building-geometry";
import {
  CONSTRUCTION_STEPS,
  FINISHED,
  RUIN,
  WALL_KINDS,
  buildingData,
  buildingHeight,
  constructionStep,
  isWallKind,
  lookCount,
  lookLevel,
  upgradeScaffoldData,
  variantsOf,
  wallPieceData,
  type Stage,
  type WallPiece,
} from "../src/render/building-recipes";
import { WALL_FOOTING } from "../src/render/building-walls";

const KINDS: [string, number][] = [
  ["townCenter", 4],
  ["house", 2],
  ["storehouse", 2],
  ["farm", 3],
  ["barracks", 3],
  ["tower", 2],
  ["unknownBuilding", 2],
];
const STAGES: Stage[] = [FINISHED, RUIN, ...Array.from({ length: CONSTRUCTION_STEPS }, (_, step): Stage => ({ kind: "construction", step }))];

function topOf(data: MeshData): number {
  let top = -Infinity;
  for (let i = 1; i < data.positions.length; i += 3) top = Math.max(top, data.positions[i]!);
  return top;
}

function bottomOf(data: MeshData): number {
  let bottom = Infinity;
  for (let i = 1; i < data.positions.length; i += 3) bottom = Math.min(bottom, data.positions[i]!);
  return bottom;
}

/** Every look of a kind: each level in each of its variants. */
function looksOf(id: string): [number, number][] {
  return [1, 2, 3].flatMap((level) => Array.from({ length: variantsOf(id) }, (_, variant): [number, number] => [level, variant]));
}

/**
 * Every index in range, every normal unit length, every layer a known surface, and every triangle wound the way
 * Babylon draws a front face: its edges' cross product pointing against the normal (seen in the scene, not assumed).
 */
function expectWellFormed(data: MeshData): void {
  const vertices = data.positions.length / 3;
  expect(vertices).toBeGreaterThan(0);
  expect(data.normals.length).toBe(data.positions.length);
  expect(data.surface.length).toBe(vertices * 4);
  expect(data.tint.length).toBe(vertices * 3);
  expect(data.indices.length % 3).toBe(0);
  for (const index of data.indices) expect(index).toBeLessThan(vertices);
  for (let i = 0; i < vertices; i++) {
    const n = Math.hypot(data.normals[i * 3]!, data.normals[i * 3 + 1]!, data.normals[i * 3 + 2]!);
    expect(n).toBeCloseTo(1, 3);
    expect(data.surface[i * 4 + 2]).toBeLessThan(MATERIALS.length + FLAT_SURFACES.length);
    expect(Number.isFinite(data.surface[i * 4]!)).toBe(true);
  }
  let facing = 0;
  let total = 0;
  for (let t = 0; t < data.indices.length; t += 3) {
    const [a, b, c] = [data.indices[t]!, data.indices[t + 1]!, data.indices[t + 2]!];
    const p = (i: number) => [data.positions[i * 3]!, data.positions[i * 3 + 1]!, data.positions[i * 3 + 2]!];
    const [pa, pb, pc] = [p(a), p(b), p(c)];
    const u = [pb[0]! - pa[0]!, pb[1]! - pa[1]!, pb[2]! - pa[2]!];
    const v = [pc[0]! - pa[0]!, pc[1]! - pa[1]!, pc[2]! - pa[2]!];
    const cross = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    if (Math.hypot(...cross) < 1e-9) continue;
    const normal = [data.normals[a * 3]!, data.normals[a * 3 + 1]!, data.normals[a * 3 + 2]!];
    total++;
    if (cross[0]! * normal[0]! + cross[1]! * normal[1]! + cross[2]! * normal[2]! < 0) facing++;
  }
  // Smooth shading bends normals at silhouettes, so allow a sliver of triangles that lean the other way.
  expect(facing / total).toBeGreaterThan(0.97);
}

describe("buildingData", () => {
  for (const [id, size] of KINDS) {
    for (const [level, variant] of looksOf(id)) {
      it(`draws ${id} level ${level} variant ${variant} at every stage`, () => {
        for (const stage of STAGES) expectWellFormed(buildingData(id, size, level, variant, stage));
      });
    }
    it(`raises upgrade scaffolding round every level of ${id}`, () => {
      for (const level of [1, 2, 3]) expectWellFormed(upgradeScaffoldData(id, size, level));
    });
  }

  it("stays inside the footprint apart from eaves", () => {
    for (const [id, size] of KINDS) {
      for (const [level, variant] of looksOf(id)) {
        const data = buildingData(id, size, level, variant, FINISHED);
        for (let i = 0; i < data.positions.length; i += 3) {
          expect(Math.abs(data.positions[i]!)).toBeLessThan(size / 2 + 0.3);
          expect(Math.abs(data.positions[i + 2]!)).toBeLessThan(size / 2 + 0.3);
        }
      }
    }
  });

  it("raises the walls through construction and roofs only the finished building", () => {
    const heights = Array.from({ length: CONSTRUCTION_STEPS - 1 }, (_, step) => topOf(buildingData("house", 2, 1, 0, { kind: "construction", step })));
    for (let i = 1; i < heights.length; i++) expect(heights[i]).toBeGreaterThan(heights[i - 1]!);
    expect(heights.at(-1)).toBeLessThan(topOf(buildingData("house", 2, 1, 0, FINISHED)));
  });

  it("leaves a ruin far lower than the building", () => {
    expect(topOf(buildingData("townCenter", 4, 1, 0, RUIN))).toBeLessThan(buildingHeight("townCenter", 1) * 0.5);
  });

  it("matches its stated height within the roof finials", () => {
    for (const [id, size] of KINDS) {
      for (const [level, variant] of looksOf(id)) {
        const top = topOf(buildingData(id, size, level, variant, FINISHED));
        expect(top).toBeGreaterThan(buildingHeight(id, level) * 0.75);
        expect(top).toBeLessThan(buildingHeight(id, level) * 1.25);
      }
    }
  });
});

describe("wall pieces", () => {
  for (const id of ["wall", "gate", "wallTower"]) {
    for (const level of [1, 2, 3]) {
      it(`draws ${id} level ${level} posts and arms at every stage`, () => {
        for (const stage of STAGES) {
          expectWellFormed(wallPieceData(id, "post", level, stage));
          if (id !== "gate") {
            expectWellFormed(wallPieceData(id, "arm", level, stage));
            expectWellFormed(wallPieceData(id, "diagonal", level, stage));
          }
        }
      });
    }
  }

  it("sinks every piece's footing into the lake shallows at every level and stage", () => {
    const pieces: WallPiece[] = ["post", "arm", "diagonal"];
    for (const id of WALL_KINDS) {
      for (const level of [1, 2, 3]) {
        for (const stage of STAGES) for (const piece of pieces) expect(bottomOf(wallPieceData(id, piece, level, stage))).toBeCloseTo(WALL_FOOTING, 3);
        expect(bottomOf(upgradeScaffoldData(id, 1, level))).toBeCloseTo(WALL_FOOTING, 1);
      }
    }
  });

  it("dresses both faces of a gate alike, since its wall decides which one the camera sees", () => {
    for (const level of [1, 2, 3]) {
      const zs = wallPieceData("gate", "post", level, FINISHED).positions.filter((_, i) => i % 3 === 2);
      expect(Math.max(...zs)).toBeCloseTo(-Math.min(...zs), 2);
    }
  });

  it("runs an arm from the tile centre to the tile edge", () => {
    const arm = wallPieceData("wall", "arm", 2, FINISHED);
    const xs = arm.positions.filter((_, i) => i % 3 === 0);
    expect(Math.min(...xs)).toBeCloseTo(0, 1);
    expect(Math.max(...xs)).toBeCloseTo(0.5, 1);
  });
});

describe("levels and steps", () => {
  it("clamps content levels to the looks the kit draws", () => {
    expect(lookLevel("house", 5)).toBe(3);
    expect(lookLevel("townCenter", 0)).toBe(1);
  });

  it("maps progress onto construction steps", () => {
    expect(constructionStep(0)).toBe(0);
    expect(constructionStep(30)).toBe(1);
    expect(constructionStep(99)).toBe(CONSTRUCTION_STEPS - 1);
    expect(constructionStep(100)).toBe(CONSTRUCTION_STEPS - 1);
  });
});

/** Vertices that take the owner's colour: cloth, or a team-painted face (negative shade). */
function teamVertices(data: MeshData): number {
  const cloth = layerOf("cloth");
  let count = 0;
  for (let i = 0; i < data.surface.length; i += 4) if (data.surface[i + 2] === cloth || data.surface[i + 3]! < 0) count++;
  return count;
}

describe("looks per level", () => {
  for (const def of content.buildings) {
    it(`draws one look per gameplay level of ${def.id}`, () => {
      expect(lookCount(def.id)).toBe(buildingLevels(def).length);
    });

    it(`gives ${def.id} three levels, each taller than the last`, () => {
      expect(lookCount(def.id)).toBe(3);
      for (let level = 2; level <= 3; level++) expect(buildingHeight(def.id, level)).toBeGreaterThan(buildingHeight(def.id, level - 1));
    });

    if (def.id === "wall") continue;
    it(`shows the team colour on ${def.id} at every level`, () => {
      for (let level = 1; level <= 3; level++) {
        const data = isWallKind(def.id) ? wallPieceData(def.id, "post", level, FINISHED) : buildingData(def.id, def.size, level, 0, FINISHED);
        expect(teamVertices(data)).toBeGreaterThan(0);
      }
    });
  }

  it("grows each building's team colour as it levels up", () => {
    for (const def of content.buildings.filter((d) => !isWallKind(d.id))) {
      const first = teamVertices(buildingData(def.id, def.size, 1, 0, FINISHED));
      const last = teamVertices(buildingData(def.id, def.size, 3, 0, FINISHED));
      expect(last).toBeGreaterThan(first);
    }
  });
});
