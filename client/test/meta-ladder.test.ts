import { describe, expect, it } from "vitest";
import { LADDER, ladderRank, nextRung, rungBeaten } from "../src/meta/ladder";
import { outcome } from "./meta-fixtures";

describe("bot ladder", () => {
  it("climbs Easy, Normal, Hard, Brutal in that order", () => {
    expect(LADDER.map((r) => r.difficulty)).toEqual(["easy", "normal", "hard", "brutal"]);
    expect(LADDER.map((r) => r.xp)).toEqual([...LADDER.map((r) => r.xp)].sort((a, b) => a - b));
  });

  it("points a new profile at the first rung, with no rank yet", () => {
    expect(nextRung([])?.difficulty).toBe("easy");
    expect(ladderRank([])).toBeUndefined();
  });

  it("highlights the lowest rung not yet beaten, even when a higher one is", () => {
    expect(nextRung(["easy", "hard"])?.difficulty).toBe("normal");
    expect(ladderRank(["easy", "hard"])?.rank).toBe("Champion");
  });

  it("has no next rung once Brutal and everything below is beaten", () => {
    expect(nextRung(["easy", "normal", "hard", "brutal"])).toBeUndefined();
    expect(ladderRank(["easy", "normal", "hard", "brutal"])?.rank).toBe("Warlord");
  });

  it("counts only wins with a bot among the enemies", () => {
    expect(rungBeaten(outcome({ won: true, difficulty: "hard" }))?.rank).toBe("Champion");
    expect(rungBeaten(outcome({ won: true, difficulty: "hard", vsBots: false }))).toBeUndefined();
    expect(rungBeaten(outcome({ won: false, difficulty: "hard" }))).toBeUndefined();
    expect(rungBeaten(outcome({ won: true, difficulty: "passive" }))).toBeUndefined();
  });
});
