import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { kindInfo, sightOf } from "../src/content/content";
import { FogGrid } from "../src/game/vision";
import { decodeSnapshot, Tile } from "../src/net/protocol";

interface VisionFixture {
  width: number;
  height: number;
  team: number;
  playerTeams: number[];
  tiles: string;
  snapshot: string;
  visible: string;
}

const path = fileURLToPath(new URL("../../protocol/fixtures/vision-v2.json", import.meta.url));
const fixture = JSON.parse(readFileSync(path, "utf8")) as VisionFixture;

const toArrayBuffer = (bytes: Buffer) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

describe("FogGrid", () => {
  it("stamps exactly the tiles the server's VisionSystem reveals", () => {
    const frame = decodeSnapshot(toArrayBuffer(Buffer.from(fixture.snapshot, "base64")));
    const expected = new Uint8Array(Buffer.from(fixture.visible, "base64"));
    const tiles = new Uint8Array(Buffer.from(fixture.tiles, "base64"));
    const fog = new FogGrid(fixture.width, fixture.height, (x, y) => tiles[y * fixture.width + x] === Tile.Tree);

    fog.update(
      frame.entities,
      (owner) => fixture.playerTeams[owner] === fixture.team,
      (record) => {
        const info = kindInfo(record.kind);
        return info ? sightOf(info) : 0;
      },
    );

    const mismatches = [...expected].reduce((count, value, i) => count + (value !== fog.visible[i] ? 1 : 0), 0);
    expect(mismatches).toBe(0);
    expect(fog.visible.some((v) => v === 1)).toBe(true);
  });

  it("sees the first tree of a forest but not the tiles behind it", () => {
    const trees = new Set(["8,5"]);
    const fog = new FogGrid(20, 20, (x, y) => trees.has(`${x},${y}`));
    const viewer = { id: 1, kind: 0, owner: 0, x: 5.5, y: 5.5, hp: 1, maxHp: 1, state: 0, facing: 0, extra: 0, flags: 0, attackSpeed: 1 };

    fog.update([viewer], () => true, () => 6);

    expect(fog.isVisible(7, 5)).toBe(true);
    expect(fog.isVisible(8, 5)).toBe(true);
    expect(fog.isVisible(9, 5)).toBe(false);
    expect(fog.isVisible(10, 5)).toBe(false);
    expect(fog.isVisible(5, 9)).toBe(true);
  });

  it("keeps explored tiles after the viewer leaves", () => {
    const fog = new FogGrid(20, 20);
    const scout = { id: 1, kind: 0, owner: 0, x: 5.5, y: 5.5, hp: 1, maxHp: 1, state: 0, facing: 0, extra: 0, flags: 0, attackSpeed: 1 };

    fog.update([scout], () => true, () => 2);
    fog.update([{ ...scout, x: 15.5 }], () => true, () => 2);

    expect(fog.isVisible(5, 5)).toBe(false);
    expect(fog.isExplored(5, 5)).toBe(true);
    expect(fog.isVisible(15, 5)).toBe(true);
  });
});
