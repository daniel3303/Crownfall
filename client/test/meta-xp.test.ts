import { describe, expect, it } from "vitest";
import { levelInfo, xpAtLevel, xpToNext } from "../src/meta/levels";
import { matchXp, totalXp } from "../src/meta/xp";
import { outcome } from "./meta-fixtures";

describe("match XP", () => {
  it("pays a lost match only for finishing, kills, heroes and length", () => {
    const lines = matchXp(outcome({ kills: 10, heroKills: 1, durationSeconds: 10 * 60 + 59 }));

    expect(lines.map((l) => l.label)).toEqual(["Match finished", "10 kills", "1 hero slain", "10 minutes of battle"]);
    expect(totalXp(lines)).toBe(40 + 20 + 30 + 40);
  });

  it("pays more for beating harder bots", () => {
    const victory = (difficulty: "easy" | "normal" | "hard" | "brutal") => totalXp(matchXp(outcome({ won: true, difficulty })));

    expect(victory("easy")).toBeLessThan(victory("normal"));
    expect(victory("normal")).toBeLessThan(victory("hard"));
    expect(victory("hard")).toBeLessThan(victory("brutal"));
    expect(victory("brutal")).toBe(40 + Math.round(120 * 2.2));
  });

  it("prices a win over an all-human enemy team by its own rate, whatever the bot setting", () => {
    const lines = matchXp(outcome({ won: true, vsBots: false, difficulty: "easy" }));

    expect(lines).toContainEqual({ label: "Victory over rivals", xp: 180 });
  });

  it("caps kills, hero kills and battle length", () => {
    const lines = matchXp(outcome({ kills: 500, heroKills: 40, durationSeconds: 3 * 60 * 60 }));

    expect(totalXp(lines)).toBe(40 + 150 + 150 + 30 * 4);
  });

  it("pays a stalemate less than a victory and more than a defeat", () => {
    const draw = totalXp(matchXp(outcome({ draw: true })));

    expect(draw).toBeGreaterThan(totalXp(matchXp(outcome())));
    expect(draw).toBeLessThan(totalXp(matchXp(outcome({ won: true, difficulty: "easy" }))));
  });

  it("pays the tutorial a quarter of a victory", () => {
    const lines = matchXp(outcome({ won: true, difficulty: "passive", vsBots: true }));

    expect(lines).toContainEqual({ label: "Tutorial victory", xp: 30 });
  });

  it("pays tutorial kills, heroes and minutes at the tutorial rate", () => {
    const lines = matchXp(outcome({ difficulty: "passive", kills: 30, heroKills: 2, durationSeconds: 16 * 60 }));

    expect(lines).toEqual([
      { label: "Match finished", xp: 40 },
      { label: "30 kills", xp: 15 },
      { label: "2 heroes slain", xp: 15 },
      { label: "16 minutes of battle", xp: 16 },
    ]);
  });
});

describe("profile levels", () => {
  it("starts at level 1 and costs 100 XP more for each level after", () => {
    expect(levelInfo(0)).toEqual({ level: 1, into: 0, needed: 300, progress: 0 });
    expect(xpToNext(1)).toBe(300);
    expect(xpToNext(2)).toBe(400);
    expect(xpAtLevel(3)).toBe(700);
  });

  it("levels up exactly at the threshold", () => {
    expect(levelInfo(299).level).toBe(1);
    expect(levelInfo(300)).toEqual({ level: 2, into: 0, needed: 400, progress: 0 });
    expect(levelInfo(xpAtLevel(10) + 50)).toMatchObject({ level: 10, into: 50 });
  });

  it("reads negative or fractional XP as whole XP from zero", () => {
    expect(levelInfo(-20).level).toBe(1);
    expect(levelInfo(299.9).level).toBe(1);
  });
});
