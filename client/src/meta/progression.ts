import type { Difficulty } from "../net/protocol";
import { addToLifetime, EMPTY_LIFETIME, newAchievements, type AchievementDef, type Lifetime } from "./achievements";
import { applyDaily, dailyChallenges, dailyFor, dateKey, isDailyDone, type ChallengeProgress, type DailyState } from "./challenges";
import { LADDER, rungBeaten, type Rung } from "./ladder";
import { levelInfo, type LevelInfo } from "./levels";
import type { MatchOutcome } from "./outcome";
import { DEFAULT_LOOK, isUnlockedAt, unlockable, unlockedBetween, type CosmeticSlot, type Unlockable } from "./unlocks";
import { matchXp, totalXp, type XpLine } from "./xp";

/** Matches remembered as already counted, so a repeated end message never pays twice. */
const RECORDED_KEEP = 20;

/** Everything the profile keeps between visits. */
export interface MetaState {
  version: 1;
  xp: number;
  lifetime: Lifetime;
  /** Ladder difficulties beaten at least once. */
  beaten: Difficulty[];
  daily: DailyState;
  /** Achievement id to the time it was earned, in epoch milliseconds. */
  achievements: Record<string, number>;
  look: Record<CosmeticSlot, string>;
  tutorialDone: boolean;
  recorded: string[];
}

/** What one finished match paid, for the end screen and toasts. */
export interface MatchReward {
  matchId: string;
  lines: XpLine[];
  xpGained: number;
  before: LevelInfo;
  after: LevelInfo;
  unlocked: Unlockable[];
  challenges: ChallengeProgress[];
  achievements: AchievementDef[];
  /** The ladder rung this match beat for the first time. */
  rung?: Rung;
}

export function freshMeta(now: Date): MetaState {
  return {
    version: 1,
    xp: 0,
    lifetime: { ...EMPTY_LIFETIME },
    beaten: [],
    daily: { date: dateKey(now), progress: {} },
    achievements: {},
    look: { ...DEFAULT_LOOK },
    tutorialDone: false,
    recorded: [],
  };
}

/** Reads a stored state defensively: missing or malformed fields fall back to a fresh profile's, and a past day's challenges roll over. */
// Caps a hand-edited save, so the level walk in levelInfo stays short.
const MAX_STORED_XP = 100_000_000;

export function normalizeMeta(stored: unknown, now: Date): MetaState {
  const fresh = freshMeta(now);
  if (!stored || typeof stored !== "object") return fresh;
  const s = stored as Partial<MetaState>;
  const lifetime: Partial<Lifetime> = s.lifetime && typeof s.lifetime === "object" ? s.lifetime : {};
  const daily = s.daily && typeof s.daily.date === "string" ? { date: s.daily.date, progress: numbers(s.daily.progress) } : undefined;
  return {
    version: 1,
    xp: Math.min(MAX_STORED_XP, Math.max(0, finite(s.xp, 0))),
    lifetime: {
      matches: finite(lifetime.matches, 0),
      wins: finite(lifetime.wins, 0),
      kills: finite(lifetime.kills, 0),
      heroKills: finite(lifetime.heroKills, 0),
      soldiersTrained: finite(lifetime.soldiersTrained, 0),
      gathered: finite(lifetime.gathered, 0),
      racesWon: Array.isArray(lifetime.racesWon) ? lifetime.racesWon.filter((race) => typeof race === "string") : [],
    },
    beaten: Array.isArray(s.beaten) ? s.beaten.filter((d) => LADDER.some((rung) => rung.difficulty === d)) : [],
    daily: dailyFor(daily, dateKey(now)),
    achievements: numbers(s.achievements),
    look: { ...fresh.look, ...(s.look ?? {}) },
    tutorialDone: s.tutorialDone === true,
    recorded: Array.isArray(s.recorded) ? s.recorded.filter((id) => typeof id === "string") : [],
  };
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Keeps only the finite numeric entries of a stored record, such as challenge progress or achievement dates. */
function numbers(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])));
}

/** Pays one finished match into the profile; null when this match was already counted. */
export function applyMatch(state: MetaState, outcome: MatchOutcome, now: Date): { state: MetaState; reward: MatchReward } | null {
  if (state.recorded.includes(outcome.matchId)) return null;
  const lines = matchXp(outcome);
  const { state: daily, progress } = applyDaily(dailyFor(state.daily, dateKey(now)), outcome);
  for (const challenge of progress.filter((c) => c.completed)) lines.push({ label: `Daily: ${challenge.def.text}`, xp: challenge.def.xp });
  const beatenRung = rungBeaten(outcome);
  const rung = beatenRung && !state.beaten.includes(beatenRung.difficulty) ? beatenRung : undefined;
  if (rung) lines.push({ label: `Ladder: ${rung.rank} rank`, xp: rung.xp });
  const lifetime = addToLifetime(state.lifetime, outcome);
  const achievements = newAchievements(state.achievements, {
    lifetime,
    outcome,
    tutorialDone: state.tutorialDone,
    dailySwept: dailyChallenges(daily.date).every((def) => isDailyDone(daily, def)),
  });
  for (const achievement of achievements) lines.push({ label: `Achievement: ${achievement.name}`, xp: achievement.xp });
  const xpGained = totalXp(lines);
  const before = levelInfo(state.xp);
  const after = levelInfo(state.xp + xpGained);
  const next: MetaState = {
    ...state,
    xp: state.xp + xpGained,
    lifetime,
    beaten: rung ? [...state.beaten, rung.difficulty] : state.beaten,
    daily,
    achievements: { ...state.achievements, ...Object.fromEntries(achievements.map((a) => [a.id, now.getTime()])) },
    recorded: [...state.recorded, outcome.matchId].slice(-RECORDED_KEEP),
  };
  return {
    state: next,
    reward: { matchId: outcome.matchId, lines, xpGained, before, after, unlocked: unlockedBetween(before.level, after.level), challenges: progress, achievements, rung },
  };
}

/** Marks the tutorial finished and pays any achievement that unlocks; a no-op the second time. */
export function applyTutorialDone(state: MetaState, now: Date): { state: MetaState; achievements: AchievementDef[] } {
  if (state.tutorialDone) return { state, achievements: [] };
  const marked = { ...state, tutorialDone: true };
  const achievements = newAchievements(state.achievements, {
    lifetime: state.lifetime,
    tutorialDone: true,
    dailySwept: false,
  });
  return {
    state: {
      ...marked,
      xp: state.xp + achievements.reduce((sum, a) => sum + a.xp, 0),
      achievements: { ...state.achievements, ...Object.fromEntries(achievements.map((a) => [a.id, now.getTime()])) },
    },
    achievements,
  };
}

/** Wears a cosmetic in its slot, if the profile has unlocked it; anything else leaves the state as it was. */
export function equip(state: MetaState, slot: CosmeticSlot, id: string): MetaState {
  const item = unlockable(id);
  if (!item || item.kind !== slot || !isUnlockedAt(id, levelInfo(state.xp).level)) return state;
  return { ...state, look: { ...state.look, [slot]: id } };
}

/** The cosmetic actually worn in a slot: the chosen one while unlocked, else the default. */
export function worn(state: MetaState, slot: CosmeticSlot): Unlockable {
  const id = state.look[slot];
  const chosen = isUnlockedAt(id, levelInfo(state.xp).level) ? unlockable(id) : undefined;
  return chosen ?? unlockable(DEFAULT_LOOK[slot])!;
}
