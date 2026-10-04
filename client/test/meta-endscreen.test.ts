import { describe, expect, it } from "vitest";
import { minuteTicks, nearestSample, niceStep, yTicks } from "../src/meta/chart-scale";
import { mvpAwards } from "../src/meta/mvp";
import { outcomeFrom } from "../src/meta/outcome";
import type { EndMessage, EndPlayer } from "../src/net/protocol";

function player(index: number, team: number, patch: Partial<EndPlayer> = {}): EndPlayer {
  return {
    index,
    name: `P${index}`,
    team,
    hero: team === 0 ? "paladin" : "warchief",
    isBot: index !== 0,
    score: 0,
    gathered: 0,
    kills: 0,
    losses: 0,
    unitsTrained: 0,
    heroLevel: 1,
    soldiersTrained: 0,
    buildingsBuilt: 0,
    heroKills: 0,
    heroDeaths: 0,
    ...patch,
  };
}

describe("MVP awards", () => {
  it("names the leader of each category and skips categories nobody scored in", () => {
    const awards = mvpAwards([player(0, 0, { kills: 30, gathered: 900 }), player(1, 1, { kills: 12, gathered: 2500, heroLevel: 4 })]);
    const byId = Object.fromEntries(awards.map((a) => [a.category.id, a]));

    expect(byId["warmonger"]).toMatchObject({ value: 30, player: { index: 0 } });
    expect(byId["quartermaster"]).toMatchObject({ value: 2500, player: { index: 1 } });
    expect(byId["legend"]).toMatchObject({ value: 4, player: { index: 1 } });
    expect(byId["hero-slayer"]).toBeUndefined();
  });

  it("breaks a tie by score, then by seat", () => {
    const tied = mvpAwards([player(2, 1, { kills: 5, score: 10 }), player(1, 0, { kills: 5, score: 50 }), player(0, 0, { kills: 5, score: 50 })]);

    expect(tied.find((a) => a.category.id === "warmonger")!.player.index).toBe(0);
  });

  it("reads a single count in the singular", () => {
    const [warmonger, slayer] = mvpAwards([player(0, 0, { kills: 1, heroKills: 1 })]);

    expect(warmonger!.category.describe(warmonger!.value)).toBe("1 kill");
    expect(slayer!.category.describe(slayer!.value)).toBe("1 hero slain");
    expect(warmonger!.category.describe(80)).toBe("80 kills");
  });
});

describe("match outcome", () => {
  const end: EndMessage = {
    t: "end",
    winningTeam: 0,
    durationSeconds: 640,
    players: [player(0, 0, { heroKills: 2 }), player(1, 1)],
    timeline: { intervalSeconds: 10, seconds: [0], players: [] },
  };
  const config = { teams: 2, playersPerTeam: 1, sharing: "separate" as const, difficulty: "hard" as const, mapSize: "small" as const };
  const roster = [
    { index: 0, name: "P0", team: 0, race: "orcs", hero: "warchief", isBot: false, defeated: false, score: 0 },
    { index: 1, name: "P1", team: 1, race: "humans", hero: "paladin", isBot: true, defeated: false, score: 0 },
  ];

  it("reads the local seat's result, race and the enemy bots", () => {
    expect(outcomeFrom(end, "m", 0, config, roster)).toMatchObject({ won: true, draw: false, vsBots: true, race: "orcs", heroKills: 2, durationSeconds: 640 });
    expect(outcomeFrom(end, "m", 1, config, roster)).toMatchObject({ won: false, vsBots: false });
  });

  it("reads a winning team of -1 as a draw", () => {
    expect(outcomeFrom({ ...end, winningTeam: -1 }, "m", 0, config, roster)).toMatchObject({ won: false, draw: true });
  });

  it("returns nothing for a seat that is not in the match", () => {
    expect(outcomeFrom(end, "m", 7, config, roster)).toBeNull();
  });
});

describe("graph scales", () => {
  it("steps axes by 1, 2 or 5 times a power of ten", () => {
    expect(niceStep(37, 4)).toBe(10);
    expect(niceStep(1800, 4)).toBe(500);
    expect(yTicks(37)).toEqual([0, 10, 20, 30, 40]);
    expect(yTicks(0)).toEqual([0, 1]);
  });

  it("marks about six minute ticks whatever the match length", () => {
    expect(minuteTicks(5 * 60)).toEqual([0, 60, 120, 180, 240, 300]);
    expect(minuteTicks(42 * 60).length).toBeLessThanOrEqual(7);
  });

  it("snaps the crosshair to the nearest sample", () => {
    expect(nearestSample([0, 10, 20, 734], 14)).toBe(1);
    expect(nearestSample([0, 10, 20, 734], 500)).toBe(3);
  });
});
