import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodeSnapshot } from "../src/net/protocol";

const fixture = (name: string) => fileURLToPath(new URL(`../../protocol/fixtures/${name}`, import.meta.url));

describe("decodeSnapshot", () => {
  it("decodes the golden fixture the C# encoder writes", () => {
    const expected = JSON.parse(readFileSync(fixture("snapshot-v2.json"), "utf8"));
    const bytes = readFileSync(fixture("snapshot-v2.bin"));

    const frame = decodeSnapshot(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

    expect(frame.tick).toBe(expected.tick);
    expect(frame.entities).toHaveLength(expected.entities.length);
    frame.entities.forEach((entity, i) => {
      const raw = expected.entities[i];
      expect(entity).toMatchObject({
        id: raw.id,
        kind: raw.kind,
        owner: raw.owner,
        x: raw.x / 256,
        y: raw.y / 256,
        hp: raw.hp,
        maxHp: raw.maxHp,
        state: raw.state,
        extra: raw.extra,
        flags: raw.flags,
        attackSpeed: raw.attackSpeed / 64,
      });
      expect(entity.facing).toBeCloseTo((raw.facing / 256) * Math.PI * 2, 6);
    });
  });

  it("rejects an unknown message type", () => {
    const bytes = new Uint8Array([9, 1, 0, 0, 0, 0, 0, 0]);

    expect(() => decodeSnapshot(bytes.buffer)).toThrow("Unsupported snapshot format");
  });
});
