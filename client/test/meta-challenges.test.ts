import { describe, expect, it } from "vitest";
import { applyDaily, CHALLENGE_POOL, dailyChallenges, dailyFor, dateKey } from "../src/meta/challenges";
import { outcome } from "./meta-fixtures";

describe("daily challenges", () => {
  it("draws three distinct challenges for a date, the same every time", () => {
    const first = dailyChallenges("2026-10-04").map((c) => c.id);

    expect(first).toHaveLength(3);
    expect(new Set(first).size).toBe(3);
    expect(dailyChallenges("2026-10-04").map((c) => c.id)).toEqual(first);
  });

  it("draws a different set on most days", () => {
    const sets = new Set<string>();
    for (let day = 1; day <= 30; day++) sets.add(dailyChallenges(`2026-11-${String(day).padStart(2, "0")}`).map((c) => c.id).join(","));

    expect(sets.size).toBeGreaterThan(20);
  });

  it("uses every challenge in the pool across a month", () => {
    const seen = new Set<string>();
    for (let day = 1; day <= 31; day++) for (const c of dailyChallenges(`2026-12-${String(day).padStart(2, "0")}`)) seen.add(c.id);

    expect(seen.size).toBe(CHALLENGE_POOL.length);
  });

  it("keys the day by the local calendar date, not UTC", () => {
    const lateEvening = new Date(2026, 9, 4, 23, 59);
    const justAfterMidnight = new Date(2026, 9, 5, 0, 1);

    expect(dateKey(lateEvening)).toBe("2026-10-04");
    expect(dateKey(justAfterMidnight)).toBe("2026-10-05");
  });

  it("starts the progress afresh on a new day", () => {
    const yesterday = { date: "2026-10-03", progress: { "play-3": 2 } };

    expect(dailyFor(yesterday, "2026-10-04")).toEqual({ date: "2026-10-04", progress: {} });
    expect(dailyFor(yesterday, "2026-10-03")).toBe(yesterday);
  });

  it("adds up progress over the day's matches and completes a goal once", () => {
    const date = dayWith("slay-heroes");
    const first = applyDaily({ date, progress: {} }, outcome({ heroKills: 2 }));
    const second = applyDaily(first.state, outcome({ heroKills: 2 }));
    const third = applyDaily(second.state, outcome({ heroKills: 5 }));

    const slay = (r: typeof first) => r.progress.find((p) => p.def.id === "slay-heroes")!;
    expect(slay(first)).toMatchObject({ before: 0, after: 2, completed: false });
    expect(slay(second)).toMatchObject({ before: 2, after: 3, completed: true });
    expect(slay(third)).toMatchObject({ before: 3, after: 3, completed: false });
  });

  it("counts nothing from the tutorial", () => {
    const date = dayWith("play-3");

    const { progress } = applyDaily({ date, progress: {} }, outcome({ difficulty: "passive", won: true }));

    expect(progress.every((p) => p.after === 0)).toBe(true);
  });

  it("judges race and speed challenges by the match itself", () => {
    const orcs = CHALLENGE_POOL.find((c) => c.id === "win-orcs")!;
    const fast = CHALLENGE_POOL.find((c) => c.id === "win-fast")!;

    expect(orcs.measure(outcome({ won: true, race: "orcs" }))).toBe(1);
    expect(orcs.measure(outcome({ won: true, race: "humans" }))).toBe(0);
    expect(orcs.measure(outcome({ won: false, race: "orcs" }))).toBe(0);
    expect(fast.measure(outcome({ won: true, durationSeconds: 14 * 60 + 59 }))).toBe(1);
    expect(fast.measure(outcome({ won: true, durationSeconds: 15 * 60 }))).toBe(0);
  });
});

/** The first date in 2026 whose draw includes the challenge, so tests do not depend on the hash's picks. */
function dayWith(id: string): string {
  for (let day = 0; day < 366; day++) {
    const key = dateKey(new Date(2026, 0, 1 + day));
    if (dailyChallenges(key).some((c) => c.id === id)) return key;
  }
  throw new Error(`No 2026 day draws ${id}`);
}
