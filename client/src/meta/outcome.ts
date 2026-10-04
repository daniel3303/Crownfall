import type { Difficulty, EndMessage, MatchConfig, PlayerView } from "../net/protocol";

/** One finished match from the local player's seat: everything progression, challenges and achievements read. */
export interface MatchOutcome {
  matchId: string;
  won: boolean;
  draw: boolean;
  /** The bots' difficulty; `passive` marks the tutorial. */
  difficulty: Difficulty;
  /** At least one enemy seat was a bot when the match ended. */
  vsBots: boolean;
  race: string;
  durationSeconds: number;
  score: number;
  gathered: number;
  kills: number;
  heroKills: number;
  heroDeaths: number;
  soldiersTrained: number;
  buildingsBuilt: number;
  heroLevel: number;
}

/** Reads the local player's outcome from the end message; null when the player has no seat in it. */
export function outcomeFrom(end: EndMessage, matchId: string, you: number, config: MatchConfig, roster: PlayerView[]): MatchOutcome | null {
  const me = end.players.find((p) => p.index === you);
  if (!me) return null;
  const draw = end.winningTeam < 0;
  return {
    matchId,
    won: !draw && end.winningTeam === me.team,
    draw,
    difficulty: config.difficulty,
    vsBots: end.players.some((p) => p.team !== me.team && p.isBot),
    race: roster.find((p) => p.index === you)?.race ?? "",
    durationSeconds: end.durationSeconds ?? 0,
    score: me.score,
    gathered: me.gathered,
    kills: me.kills,
    heroKills: me.heroKills ?? 0,
    heroDeaths: me.heroDeaths ?? 0,
    soldiersTrained: me.soldiersTrained ?? 0,
    buildingsBuilt: me.buildingsBuilt ?? 0,
    heroLevel: me.heroLevel,
  };
}

export function isTutorial(outcome: Pick<MatchOutcome, "difficulty">): boolean {
  return outcome.difficulty === "passive";
}
