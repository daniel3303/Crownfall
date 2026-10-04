import type { Difficulty } from "../net/protocol";
import type { MatchOutcome } from "./outcome";

export interface Rung {
  difficulty: Difficulty;
  /** The difficulty as players read it, with its article: "an Easy". */
  foe: string;
  rank: string;
  /** One-time XP for the first win over this rung. */
  xp: number;
}

/** The bot ladder, lowest rung first. */
export const LADDER: Rung[] = [
  { difficulty: "easy", foe: "an Easy", rank: "Squire", xp: 100 },
  { difficulty: "normal", foe: "a Normal", rank: "Knight", xp: 200 },
  { difficulty: "hard", foe: "a Hard", rank: "Champion", xp: 350 },
  { difficulty: "brutal", foe: "a Brutal", rank: "Warlord", xp: 600 },
];

/** The rung a match beat: a win with at least one bot among the enemies, on a ladder difficulty. */
export function rungBeaten(outcome: MatchOutcome): Rung | undefined {
  if (!outcome.won || !outcome.vsBots) return undefined;
  return LADDER.find((rung) => rung.difficulty === outcome.difficulty);
}

/** The highest rung ever beaten, which names the player's ladder rank; undefined before the first. */
export function ladderRank(beaten: readonly Difficulty[]): Rung | undefined {
  return [...LADDER].reverse().find((rung) => beaten.includes(rung.difficulty));
}

/** The lowest rung not yet beaten, which the menu highlights; undefined once the whole ladder is beaten. */
export function nextRung(beaten: readonly Difficulty[]): Rung | undefined {
  return LADDER.find((rung) => !beaten.includes(rung.difficulty));
}
