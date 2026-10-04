import { isTutorial, type MatchOutcome } from "./outcome";

export const DAILY_COUNT = 3;

export interface ChallengeDef {
  id: string;
  text: string;
  goal: number;
  xp: number;
  /** What one match adds toward the goal; progress adds up over the day's matches. */
  measure(outcome: MatchOutcome): number;
}

const won = (o: MatchOutcome) => (o.won ? 1 : 0);

export const CHALLENGE_POOL: ChallengeDef[] = [
  { id: "win-orcs", text: "Win as Orcs", goal: 1, xp: 150, measure: (o) => (o.won && o.race === "orcs" ? 1 : 0) },
  { id: "win-humans", text: "Win as Humans", goal: 1, xp: 150, measure: (o) => (o.won && o.race === "humans" ? 1 : 0) },
  { id: "slay-heroes", text: "Slay 3 enemy heroes", goal: 3, xp: 150, measure: (o) => o.heroKills },
  { id: "win-fast", text: "Win in under 15 minutes", goal: 1, xp: 175, measure: (o) => (o.won && o.durationSeconds < 15 * 60 ? 1 : 0) },
  { id: "train-soldiers", text: "Train 30 soldiers", goal: 30, xp: 120, measure: (o) => o.soldiersTrained },
  { id: "gather", text: "Gather 4,000 resources", goal: 4000, xp: 120, measure: (o) => o.gathered },
  { id: "kills", text: "Defeat 50 enemies", goal: 50, xp: 120, measure: (o) => o.kills },
  { id: "win-hard", text: "Beat a Hard or Brutal bot", goal: 1, xp: 200, measure: (o) => (o.won && o.vsBots && (o.difficulty === "hard" || o.difficulty === "brutal") ? 1 : 0) },
  { id: "flawless", text: "Win without losing your hero", goal: 1, xp: 175, measure: (o) => (o.won && o.heroDeaths === 0 ? 1 : 0) },
  { id: "hero-level", text: "Raise your hero to level 6", goal: 1, xp: 120, measure: (o) => (o.heroLevel >= 6 ? 1 : 0) },
  { id: "play-3", text: "Finish 3 matches", goal: 3, xp: 100, measure: () => 1 },
  { id: "build", text: "Construct 15 buildings", goal: 15, xp: 100, measure: (o) => o.buildingsBuilt },
  { id: "wins-2", text: "Win 2 matches", goal: 2, xp: 150, measure: won },
];

/** Today's progress: challenge id to amount done, capped at its goal. */
export interface DailyState {
  date: string;
  progress: Record<string, number>;
}

export interface ChallengeProgress {
  def: ChallengeDef;
  before: number;
  after: number;
  /** Reached its goal in this match. */
  completed: boolean;
}

/** The local calendar day as YYYY-MM-DD; local, not UTC, so the challenges turn over at the player's midnight. */
export function dateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The day's challenges: the same three for everyone on the same local date, drawn without repeats. */
export function dailyChallenges(key: string, pool: ChallengeDef[] = CHALLENGE_POOL, count = DAILY_COUNT): ChallengeDef[] {
  const random = mulberry32(hashString(key));
  const order = [...pool];
  const picks = Math.min(count, order.length);
  for (let i = 0; i < picks; i++) {
    const j = i + Math.floor(random() * (order.length - i));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order.slice(0, picks);
}

/** Today's state, started afresh when the stored one belongs to another day. */
export function dailyFor(stored: DailyState | undefined, key: string): DailyState {
  return stored?.date === key ? stored : { date: key, progress: {} };
}

/** Adds one match to today's challenges; the tutorial's passive bot counts for none. */
export function applyDaily(state: DailyState, outcome: MatchOutcome): { state: DailyState; progress: ChallengeProgress[] } {
  const progress: ChallengeProgress[] = [];
  const next: Record<string, number> = { ...state.progress };
  for (const def of dailyChallenges(state.date)) {
    const before = Math.min(def.goal, next[def.id] ?? 0);
    const gained = isTutorial(outcome) ? 0 : Math.max(0, def.measure(outcome));
    const after = Math.min(def.goal, before + gained);
    next[def.id] = after;
    progress.push({ def, before, after, completed: before < def.goal && after >= def.goal });
  }
  return { state: { date: state.date, progress: next }, progress };
}

export function isDailyDone(state: DailyState, def: ChallengeDef): boolean {
  return (state.progress[def.id] ?? 0) >= def.goal;
}

/** FNV-1a: a stable 32-bit hash of the date key. */
function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A small seeded generator, so a date always draws the same challenges. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
