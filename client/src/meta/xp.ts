import type { Difficulty } from "../net/protocol";
import { isTutorial, type MatchOutcome } from "./outcome";

export interface XpLine {
  label: string;
  xp: number;
}

const FINISHED_XP = 40;
const VICTORY_XP = 120;
const DRAW_XP = 40;
const XP_PER_KILL = 2;
const MAX_KILL_XP = 150;
const XP_PER_HERO_KILL = 30;
const MAX_HERO_KILL_XP = 150;
const XP_PER_MINUTE = 4;
const MAX_MINUTES = 30;

/** How much a victory over bots of each difficulty is worth; a win over human rivals counts as `HUMAN_RIVALS`. */
export const VICTORY_MULTIPLIER: Record<Difficulty, number> = {
  passive: 0.25,
  easy: 1,
  normal: 1.3,
  hard: 1.7,
  brutal: 2.2,
};
const HUMAN_RIVALS = 1.5;

/** XP for one finished match, itemised for the end screen; lines worth nothing are left out. */
export function matchXp(outcome: MatchOutcome): XpLine[] {
  const multiplier = outcome.vsBots || isTutorial(outcome) ? VICTORY_MULTIPLIER[outcome.difficulty] : HUMAN_RIVALS;
  const lines: XpLine[] = [{ label: "Match finished", xp: FINISHED_XP }];
  if (outcome.won) lines.push({ label: victoryLabel(outcome), xp: Math.round(VICTORY_XP * multiplier) });
  else if (outcome.draw) lines.push({ label: "Stalemate", xp: DRAW_XP });
  // A tutorial foe never fights back, so its kills and minutes pay at the tutorial's victory rate too.
  const rate = isTutorial(outcome) ? VICTORY_MULTIPLIER.passive : 1;
  const kills = Math.min(MAX_KILL_XP, outcome.kills * XP_PER_KILL);
  lines.push({ label: count(outcome.kills, "kill", "kills"), xp: Math.round(kills * rate) });
  const heroKills = Math.min(MAX_HERO_KILL_XP, outcome.heroKills * XP_PER_HERO_KILL);
  lines.push({ label: count(outcome.heroKills, "hero slain", "heroes slain"), xp: Math.round(heroKills * rate) });
  const minutes = Math.min(MAX_MINUTES, Math.floor(outcome.durationSeconds / 60));
  lines.push({ label: `${count(minutes, "minute", "minutes")} of battle`, xp: Math.round(minutes * XP_PER_MINUTE * rate) });
  return lines.filter((line) => line.xp > 0);
}

export function totalXp(lines: XpLine[]): number {
  return lines.reduce((sum, line) => sum + line.xp, 0);
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function victoryLabel(outcome: MatchOutcome): string {
  if (isTutorial(outcome)) return "Tutorial victory";
  if (!outcome.vsBots) return "Victory over rivals";
  return `Victory over ${outcome.difficulty} bots`;
}
