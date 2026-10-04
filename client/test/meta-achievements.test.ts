import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, addToLifetime, EMPTY_LIFETIME, newAchievements, type AchievementContext } from "../src/meta/achievements";
import { outcome } from "./meta-fixtures";

const base: AchievementContext = { lifetime: EMPTY_LIFETIME, tutorialDone: false, dailySwept: false };

function earned(context: Partial<AchievementContext>, held: Record<string, number> = {}): string[] {
  return newAchievements(held, { ...base, ...context }).map((a) => a.id);
}

describe("achievements", () => {
  it("has about a dozen, each with a unique id", () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });

  it("awards First Victory and Untouchable for a first win without a hero death", () => {
    const win = outcome({ won: true, heroDeaths: 0, durationSeconds: 20 * 60 });

    expect(earned({ outcome: win, lifetime: addToLifetime(EMPTY_LIFETIME, win) })).toEqual(["first-win", "flawless"]);
  });

  it("withholds Untouchable when the hero fell even once", () => {
    const win = outcome({ won: true, heroDeaths: 1, durationSeconds: 20 * 60 });

    expect(earned({ outcome: win, lifetime: addToLifetime(EMPTY_LIFETIME, win) })).not.toContain("flawless");
  });

  it("awards Lightning Campaign below 12 minutes only", () => {
    expect(earned({ outcome: outcome({ won: true, heroDeaths: 1, durationSeconds: 11 * 60 + 59 }) })).toContain("blitz");
    expect(earned({ outcome: outcome({ won: true, heroDeaths: 1, durationSeconds: 12 * 60 }) })).not.toContain("blitz");
  });

  it("awards Brutal Conqueror for beating Brutal bots, not human rivals on a Brutal setting", () => {
    expect(earned({ outcome: outcome({ won: true, difficulty: "brutal", heroDeaths: 1, durationSeconds: 20 * 60 }) })).toContain("brutal");
    expect(earned({ outcome: outcome({ won: true, difficulty: "brutal", vsBots: false, heroDeaths: 1, durationSeconds: 20 * 60 }) })).not.toContain("brutal");
  });

  it("counts heroes slain over every match for Hero Hunter", () => {
    let lifetime = EMPTY_LIFETIME;
    for (let i = 0; i < 3; i++) lifetime = addToLifetime(lifetime, outcome({ heroKills: 3 }));
    expect(earned({ lifetime })).not.toContain("hero-hunter");

    lifetime = addToLifetime(lifetime, outcome({ heroKills: 1 }));
    expect(earned({ lifetime })).toContain("hero-hunter");
  });

  it("needs wins with both races for Two Crowns", () => {
    const humans = addToLifetime(EMPTY_LIFETIME, outcome({ won: true, race: "humans" }));
    const both = addToLifetime(humans, outcome({ won: true, race: "orcs" }));

    expect(earned({ lifetime: humans })).not.toContain("two-crowns");
    expect(earned({ lifetime: both })).toContain("two-crowns");
  });

  it("never awards an achievement twice", () => {
    const win = outcome({ won: true });

    expect(earned({ outcome: win, lifetime: addToLifetime(EMPTY_LIFETIME, win) }, { "first-win": 1 })).not.toContain("first-win");
  });

  it("ignores the tutorial for match and lifetime achievements", () => {
    const tutorial = outcome({ won: true, difficulty: "passive", durationSeconds: 5 * 60 });
    const lifetime = addToLifetime(EMPTY_LIFETIME, tutorial);

    expect(lifetime).toBe(EMPTY_LIFETIME);
    expect(earned({ outcome: tutorial, lifetime })).toEqual([]);
  });

  it("awards Scholar and Devoted from their flags", () => {
    expect(earned({ tutorialDone: true })).toEqual(["scholar"]);
    expect(earned({ dailySwept: true })).toEqual(["devoted"]);
  });
});
