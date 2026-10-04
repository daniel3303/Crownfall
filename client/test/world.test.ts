import { describe, expect, it } from "vitest";
import { buildingDef, buildingStats, kinds } from "../src/content/content";
import { contextCommand } from "../src/game/commands";
import { canPlace, lineCells, lineTiles, MAX_LINE_TILES, placementOrigin } from "../src/game/placement";
import { ClientWorld, recordSight } from "../src/game/world";
import { Flags, NEUTRAL_OWNER, Tile, type EntityRecord, type WelcomeMessage } from "../src/net/protocol";
import { actionHint, cursorFor } from "../src/play/cursor-style";

const kindOf = (id: string) => kinds.findIndex((k) => k.def.id === id);
const SIZE = 40;

function welcome(): WelcomeMessage {
  const tiles = new Uint8Array(SIZE * SIZE);
  tiles[20 * SIZE + 30] = Tile.Tree;
  return {
    t: "welcome",
    matchId: "m",
    you: 0,
    config: { teams: 2, playersPerTeam: 1, sharing: "separate", difficulty: "normal", mapSize: "small" },
    tickRate: 10,
    tick: 0,
    players: [
      { index: 0, name: "Me", team: 0, race: "humans", hero: "paladin", isBot: false, defeated: false, score: 0 },
      { index: 1, name: "Foe", team: 1, race: "orcs", hero: "warchief", isBot: true, defeated: false, score: 0 },
    ],
    map: { width: SIZE, height: SIZE, tiles: Buffer.from(tiles).toString("base64") },
  };
}

function record(id: number, kind: string, owner: number, x: number, y: number, flags = 0): EntityRecord {
  return { id, kind: kindOf(kind), owner, x, y, hp: 10, maxHp: 10, state: 0, facing: 0, extra: 0, flags, attackSpeed: 1 };
}

describe("ClientWorld", () => {
  it("keeps an enemy building as a ghost after it leaves sight", () => {
    const world = new ClientWorld(welcome());
    const scout = record(1, "villager", 0, 10.5, 10.5);
    const tower = record(2, "tower", 1, 14, 10);

    world.applySnapshot({ tick: 1, entities: [scout, tower] }, 0);
    world.applySnapshot({ tick: 2, entities: [{ ...scout, x: 2.5, y: 30.5 }] }, 100);

    expect(world.entities.get(2)?.ghost).toBe(true);
  });

  it("drops a ghost once its footprint is visible and the building is gone", () => {
    const world = new ClientWorld(welcome());
    const scout = record(1, "villager", 0, 10.5, 10.5);
    world.applySnapshot({ tick: 1, entities: [scout, record(2, "tower", 1, 14, 10)] }, 0);
    world.applySnapshot({ tick: 2, entities: [{ ...scout, x: 2.5, y: 30.5 }] }, 100);

    world.applySnapshot({ tick: 3, entities: [scout] }, 200);

    expect(world.entities.has(2)).toBe(false);
  });

  it("forgets an enemy unit the moment it is out of sight", () => {
    const world = new ClientWorld(welcome());
    world.applySnapshot({ tick: 1, entities: [record(1, "villager", 0, 10.5, 10.5), record(3, "spearman", 1, 12, 12)] }, 0);

    world.applySnapshot({ tick: 2, entities: [record(1, "villager", 0, 10.5, 10.5)] }, 100);

    expect(world.entities.has(3)).toBe(false);
  });

  it("slides a moving unit between snapshots a tick and a margin behind, and snaps a long jump", () => {
    const world = new ClientWorld(welcome());
    world.applySnapshot({ tick: 1, entities: [record(1, "villager", 0, 10, 10), record(2, "villager", 0, 5, 5)] }, 0);
    world.applySnapshot({ tick: 2, entities: [record(1, "villager", 0, 11, 10), record(2, "villager", 0, 25, 5)] }, 100);

    // Rendering runs one 100 ms tick plus a 30 ms jitter margin behind: 180 ms local is halfway between the snapshots.
    world.interpolate(180);

    expect(world.entities.get(1)?.renderX).toBeCloseTo(10.5);
    expect(world.entities.get(2)?.renderX).toBe(25);
  });
});

describe("contextCommand", () => {
  function setup() {
    const world = new ClientWorld(welcome());
    world.applySnapshot(
      {
        tick: 1,
        entities: [
          record(1, "villager", 0, 25.5, 20.5),
          record(2, "spearman", 0, 26.5, 20.5),
          record(3, "spearman", 1, 27.5, 21.5),
          record(4, "goldMine", NEUTRAL_OWNER, 24, 24),
          record(5, "barracks", 0, 20.5, 15.5, 1),
          record(6, "wolf", NEUTRAL_OWNER, 23.5, 18.5),
        ],
      },
      0,
    );
    const get = (id: number) => world.entities.get(id)!;
    return { world, get };
  }

  it("attacks an enemy or a creep", () => {
    const { world, get } = setup();

    expect(contextCommand(world, [get(2)], { x: 27.5, y: 21.5, entity: get(3) }, false)).toEqual({ type: "attack", units: [2], target: 3 });
    expect(contextCommand(world, [get(2)], { x: 23.5, y: 18.5, entity: get(6) }, false)).toMatchObject({ type: "attack", target: 6 });
  });

  it("gathers from a node and from an explored tree tile", () => {
    const { world, get } = setup();

    expect(contextCommand(world, [get(1)], { x: 24, y: 24, entity: get(4) }, false)).toMatchObject({ type: "gather", target: 4 });
    expect(contextCommand(world, [get(1)], { x: 30.4, y: 20.6 }, false)).toEqual({ type: "gather", units: [1], target: 0, tileX: 30, tileY: 20 });
  });

  it("sends villagers to finish a foundation", () => {
    const { world, get } = setup();

    expect(contextCommand(world, [get(1)], { x: 20.5, y: 15.5, entity: get(5) }, false)).toEqual({ type: "construct", units: [1], target: 5 });
  });

  it("moves, or attack-moves, on open ground", () => {
    const { world, get } = setup();

    expect(contextCommand(world, [get(1), get(2)], { x: 5, y: 6 }, true)).toEqual({ type: "move", units: [1, 2], x: 5, y: 6, attackMove: true });
  });

  it("ignores enemy entities in the selection", () => {
    const { world, get } = setup();

    expect(contextCommand(world, [get(3)], { x: 5, y: 6 }, false)).toBeNull();
  });
});

describe("fallen entities", () => {
  it("keeps a building the death tick's snapshot dropped, with its level, for that tick's death event", () => {
    const world = new ClientWorld(welcome());
    const villager = record(1, "villager", 0, 10.5, 10.5);
    world.applySnapshot({ tick: 1, entities: [villager, { ...record(2, "house", 0, 12, 12), state: 3 }] }, 0);

    world.applySnapshot({ tick: 2, entities: [villager] }, 100);
    world.applyEvents([{ k: "death", id: 2, owner: 0, entityKind: kindOf("house"), x: 12, y: 12, category: "building" }]);

    expect(world.entities.has(2)).toBe(false);
    expect(world.fallen.get(2)?.level).toBe(3);
    world.applySnapshot({ tick: 3, entities: [villager] }, 200);
    expect(world.fallen.size).toBe(0);
  });

  it("keeps an entity a death event removes when its snapshot was missed", () => {
    const world = new ClientWorld(welcome());
    world.applySnapshot({ tick: 1, entities: [record(1, "villager", 0, 10.5, 10.5), { ...record(2, "house", 0, 12, 12), state: 2 }] }, 0);

    world.applyEvents([{ k: "death", id: 2, owner: 0, entityKind: kindOf("house"), x: 12, y: 12, category: "building" }]);

    expect(world.fallen.get(2)?.level).toBe(2);
  });
});

describe("placement", () => {
  it("rejects unexplored ground and spots covered by a known building", () => {
    const world = new ClientWorld(welcome());
    world.applySnapshot({ tick: 1, entities: [record(1, "villager", 0, 10.5, 10.5), record(2, "house", 0, 12, 12)] }, 0);
    const house = kinds[kindOf("house")]!.def as Parameters<typeof canPlace>[1];

    expect(canPlace(world, house, 7, 7)).toBe(true);
    expect(canPlace(world, house, 11, 11)).toBe(false);
    expect(canPlace(world, house, 30, 30)).toBe(false);
    expect(placementOrigin(house, 10.2, 10.9)).toEqual({ x: 9, y: 10 });
  });

  it("lets walls, but no other building, stand in shallows", () => {
    const world = new ClientWorld(welcome());
    world.applySnapshot({ tick: 1, entities: [record(1, "villager", 0, 10.5, 10.5)] }, 0);
    world.applyEvents([{ k: "tiles", changes: [[8, 8, Tile.Shallow]] }]);
    const def = (id: string) => kinds[kindOf(id)]!.def as Parameters<typeof canPlace>[1];

    expect(canPlace(world, def("wall"), 8, 8)).toBe(true);
    expect(canPlace(world, def("gate"), 8, 8)).toBe(true);
    expect(canPlace(world, def("house"), 7, 7)).toBe(false);
  });
});

describe("wall lines", () => {
  const def = (id: string) => kinds[kindOf(id)]!.def as Parameters<typeof canPlace>[1];

  function walledWorld() {
    const world = new ClientWorld(welcome());
    world.applySnapshot({ tick: 1, entities: [record(1, "villager", 0, 10.5, 10.5), record(2, "wall", 0, 12.5, 10.5), record(3, "wall", 1, 8.5, 10.5)] }, 0);
    return world;
  }

  it("walks the same king-step tiles as the server, capped at the drag limit", () => {
    expect(lineTiles(0, 0, 3, 1)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ]);
    expect(lineTiles(0, 0, 100, 0)).toHaveLength(MAX_LINE_TILES);
  });

  it("marks own wall tiles valid so a line extends it, and enemy walls invalid", () => {
    const cells = lineCells(walledWorld(), def("wall"), { x: 8, y: 10 }, { x: 13, y: 10 });

    expect(cells.map((c) => c.valid)).toEqual([false, true, true, true, true, true]);
  });

  it("lets a gate or wall tower replace a tile of your own wall but not an enemy one", () => {
    const world = walledWorld();

    expect(canPlace(world, def("gate"), 12, 10)).toBe(true);
    expect(canPlace(world, def("wallTower"), 12, 10)).toBe(true);
    expect(canPlace(world, def("gate"), 8, 10)).toBe(false);
    expect(canPlace(world, def("house"), 12, 10)).toBe(false);
  });
});

describe("raids and building levels", () => {
  function raidWorld() {
    const world = new ClientWorld(welcome());
    world.applySnapshot(
      {
        tick: 1,
        entities: [
          record(1, "villager", 0, 25.5, 20.5),
          record(2, "spearman", 0, 26.5, 20.5),
          record(7, "storehouse", 1, 28, 24),
          record(8, "house", 1, 22, 24),
        ],
      },
      0,
    );
    return { world, get: (id: number) => world.entities.get(id)! };
  }

  it("sends villagers to steal from an enemy drop-off", () => {
    const { world, get } = raidWorld();

    const command = contextCommand(world, [get(1), get(2)], { x: 28, y: 24, entity: get(7) }, false);

    expect(command).toEqual({ type: "gather", units: [1, 2], target: 7 });
    expect(cursorFor(world, command)).toBe("gather-mine");
    expect(actionHint(world, command)).toBe("Right-click to steal resources");
  });

  it("attacks enemy buildings that hold no resources, and anything with soldiers alone", () => {
    const { world, get } = raidWorld();

    expect(contextCommand(world, [get(1)], { x: 22, y: 24, entity: get(8) }, false)).toMatchObject({ type: "attack", target: 8 });
    expect(contextCommand(world, [get(2)], { x: 28, y: 24, entity: get(7) }, false)).toMatchObject({ type: "attack", target: 7 });
  });

  it("reads a building's level and upgrade progress from its record", () => {
    const world = new ClientWorld(welcome());
    const tower = { ...record(9, "tower", 0, 14, 10, Flags.Upgrading), state: 2, extra: 40 };
    const hero = { ...record(10, "paladin", 0, 12.5, 12.5, Flags.Hero), extra: 5 };

    world.applySnapshot({ tick: 1, entities: [tower, hero] }, 0);

    expect(world.entities.get(9)).toMatchObject({ level: 2, upgrading: true, upgradeProgress: 40 });
    expect(world.entities.get(10)).toMatchObject({ level: 5, upgrading: false });
    expect(recordSight(tower)).toBe(buildingStats(buildingDef("tower"), 2).sight);
  });
});
