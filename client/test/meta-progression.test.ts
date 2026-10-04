import { describe, expect, it } from "vitest";
import { dailyChallenges, dateKey } from "../src/meta/challenges";
import { applyMatch, applyTutorialDone, equip, freshMeta, normalizeMeta, worn } from "../src/meta/progression";
import { levelInfo } from "../src/meta/levels";
import { outcome } from "./meta-fixtures";

const NOW = new Date(2026, 9, 4, 18, 0);

describe("progression", () => {
  it("caps a hand-edited XP total so the level walk stays short", () => {
    const meta = normalizeMeta({ ...freshMeta(NOW), xp: 1e20 }, NOW);

    expect(meta.xp).toBeLessThanOrEqual(100_000_000);
    expect(levelInfo(meta.xp).level).toBeGreaterThan(1);
  });

  it("pays a match once, however often its end message arrives", () => {
    const first = applyMatch(freshMeta(NOW), outcome({ matchId: "a", won: true }), NOW)!;

    expect(first.reward.xpGained).toBeGreaterThan(0);
    expect(first.state.xp).toBe(first.reward.xpGained);
    expect(applyMatch(first.state, outcome({ matchId: "a", won: true }), NOW)).toBeNull();
  });

  it("adds the first ladder win, its rank bonus and new achievements to the XP lines", () => {
    const { state, reward } = applyMatch(freshMeta(NOW), outcome({ won: true, difficulty: "easy", durationSeconds: 20 * 60, heroDeaths: 1 }), NOW)!;

    expect(state.beaten).toEqual(["easy"]);
    expect(reward.rung?.rank).toBe("Squire");
    expect(reward.lines.map((l) => l.label)).toEqual(expect.arrayContaining(["Ladder: Squire rank", "Achievement: First Victory"]));
    expect(reward.xpGained).toBe(reward.lines.reduce((sum, l) => sum + l.xp, 0));
  });

  it("pays a ladder rung only the first time", () => {
    const first = applyMatch(freshMeta(NOW), outcome({ matchId: "a", won: true, difficulty: "easy" }), NOW)!;
    const second = applyMatch(first.state, outcome({ matchId: "b", won: true, difficulty: "easy" }), NOW)!;

    expect(second.reward.rung).toBeUndefined();
    expect(second.state.beaten).toEqual(["easy"]);
  });

  it("reports the level climbed and the cosmetics it unlocked", () => {
    const rich = { ...freshMeta(NOW), xp: 290 };

    const { reward } = applyMatch(rich, outcome({ won: true, difficulty: "brutal" }), NOW)!;

    expect(reward.before.level).toBe(1);
    expect(reward.after.level).toBeGreaterThanOrEqual(2);
    expect(reward.unlocked.map((u) => u.id)).toContain("crest:swords");
  });

  it("moves today's challenges and resets yesterday's", () => {
    const stale = { ...freshMeta(NOW), daily: { date: "2026-10-03", progress: { "play-3": 2 } } };

    const { state, reward } = applyMatch(stale, outcome(), NOW)!;

    expect(state.daily.date).toBe(dateKey(NOW));
    expect(reward.challenges.map((c) => c.def.id)).toEqual(dailyChallenges(dateKey(NOW)).map((c) => c.id));
  });

  it("awards Scholar once for the tutorial", () => {
    const first = applyTutorialDone(freshMeta(NOW), NOW);
    const again = applyTutorialDone(first.state, NOW);

    expect(first.achievements.map((a) => a.id)).toEqual(["scholar"]);
    expect(first.state.xp).toBe(50);
    expect(again.achievements).toEqual([]);
    expect(again.state).toBe(first.state);
  });

  it("wears only cosmetics the level has unlocked", () => {
    const fresh = freshMeta(NOW);

    expect(equip(fresh, "crest", "crest:crown")).toBe(fresh);
    expect(equip(fresh, "title", "crest:shield")).toBe(fresh);
    expect(worn(equip({ ...fresh, xp: 100_000 }, "crest", "crest:crown"), "crest").id).toBe("crest:crown");
  });

  it("falls back to the default look for a cosmetic no longer unlocked", () => {
    const state = { ...freshMeta(NOW), look: { ...freshMeta(NOW).look, banner: "banner:dragonfire" } };

    expect(worn(state, "banner").id).toBe("banner:oak");
  });

  it("reads corrupt or partial storage as a sane profile", () => {
    expect(normalizeMeta(null, NOW)).toEqual(freshMeta(NOW));
    expect(normalizeMeta("garbage", NOW)).toEqual(freshMeta(NOW));
    const partial = normalizeMeta({ xp: 500, beaten: ["easy", "bogus"], lifetime: { wins: 3 } }, NOW);
    expect(partial.xp).toBe(500);
    expect(partial.beaten).toEqual(["easy"]);
    expect(partial.lifetime.wins).toBe(3);
    expect(partial.lifetime.racesWon).toEqual([]);
  });

  it("drops tampered counters and dates instead of carrying strings into the profile", () => {
    const tampered = normalizeMeta(
      { lifetime: { kills: "9001", wins: 2, racesWon: ["orcs", 7] }, achievements: { "first-win": 1700000000000, flawless: "soon" } },
      NOW,
    );

    expect(tampered.lifetime.kills).toBe(0);
    expect(tampered.lifetime.wins).toBe(2);
    expect(tampered.lifetime.racesWon).toEqual(["orcs"]);
    expect(tampered.achievements).toEqual({ "first-win": 1700000000000 });
  });

  it("rolls yesterday's challenges over on load and keeps today's progress", () => {
    const yesterday = normalizeMeta({ daily: { date: "2026-10-03", progress: { "win-1": 1 } } }, NOW);
    const today = normalizeMeta({ daily: { date: "2026-10-04", progress: { "win-1": 1, bogus: "x" } } }, NOW);

    expect(yesterday.daily).toEqual({ date: "2026-10-04", progress: {} });
    expect(today.daily).toEqual({ date: "2026-10-04", progress: { "win-1": 1 } });
  });
});
