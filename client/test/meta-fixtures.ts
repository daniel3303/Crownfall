import type { MatchOutcome } from "../src/meta/outcome";

/** A finished match from the local seat; each test overrides only what it is about. */
export function outcome(patch: Partial<MatchOutcome> = {}): MatchOutcome {
  return {
    matchId: "m1",
    won: false,
    draw: false,
    difficulty: "normal",
    vsBots: true,
    race: "humans",
    durationSeconds: 0,
    score: 0,
    gathered: 0,
    kills: 0,
    heroKills: 0,
    heroDeaths: 0,
    soldiersTrained: 0,
    buildingsBuilt: 0,
    heroLevel: 1,
    ...patch,
  };
}
