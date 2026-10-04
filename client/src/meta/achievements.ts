import { isTutorial, type MatchOutcome } from "./outcome";

/** Totals over every finished match, tutorial excluded. */
export interface Lifetime {
  matches: number;
  wins: number;
  kills: number;
  heroKills: number;
  soldiersTrained: number;
  gathered: number;
  /** Races the player has won with. */
  racesWon: string[];
}

export const EMPTY_LIFETIME: Lifetime = { matches: 0, wins: 0, kills: 0, heroKills: 0, soldiersTrained: 0, gathered: 0, racesWon: [] };

/** What an achievement rule may look at: totals after the match, the match itself if there was one, and flags. */
export interface AchievementContext {
  lifetime: Lifetime;
  outcome?: MatchOutcome;
  tutorialDone: boolean;
  /** Every one of today's daily challenges is done. */
  dailySwept: boolean;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  /** Icon id for the gallery badge. */
  icon: string;
  xp: number;
  earned(context: AchievementContext): boolean;
}

/** A real match's outcome; the tutorial's passive bot earns no match achievement. */
function played(context: AchievementContext): MatchOutcome | undefined {
  return context.outcome && !isTutorial(context.outcome) ? context.outcome : undefined;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first-win", name: "First Victory", description: "Win a match.", icon: "trophy", xp: 50, earned: (c) => c.lifetime.wins >= 1 },
  { id: "flawless", name: "Untouchable", description: "Win without losing your hero.", icon: "shieldCheck", xp: 100, earned: (c) => !!played(c)?.won && played(c)!.heroDeaths === 0 },
  { id: "hero-hunter", name: "Hero Hunter", description: "Slay 10 enemy heroes in total.", icon: "target", xp: 100, earned: (c) => c.lifetime.heroKills >= 10 },
  { id: "blitz", name: "Lightning Campaign", description: "Win in under 12 minutes.", icon: "timer", xp: 100, earned: (c) => !!played(c)?.won && played(c)!.durationSeconds < 12 * 60 },
  { id: "giant-slayer", name: "Giant Slayer", description: "Beat a Hard bot.", icon: "swords", xp: 100, earned: (c) => beat(c, "hard") },
  { id: "brutal", name: "Brutal Conqueror", description: "Beat a Brutal bot.", icon: "skull", xp: 200, earned: (c) => beat(c, "brutal") },
  { id: "veteran", name: "Veteran", description: "Finish 10 matches.", icon: "medal", xp: 75, earned: (c) => c.lifetime.matches >= 10 },
  { id: "standing-army", name: "Standing Army", description: "Train 100 soldiers in total.", icon: "users", xp: 75, earned: (c) => c.lifetime.soldiersTrained >= 100 },
  { id: "treasurer", name: "Treasurer", description: "Gather 5,000 resources in one match.", icon: "coins", xp: 75, earned: (c) => (played(c)?.gathered ?? 0) >= 5000 },
  { id: "legend", name: "Living Legend", description: "Raise your hero to level 8 in one match.", icon: "crown", xp: 100, earned: (c) => (played(c)?.heroLevel ?? 0) >= 8 },
  { id: "two-crowns", name: "Two Crowns", description: "Win as both Humans and Orcs.", icon: "gem", xp: 100, earned: (c) => c.lifetime.racesWon.includes("humans") && c.lifetime.racesWon.includes("orcs") },
  { id: "devoted", name: "Devoted", description: "Complete all three daily challenges in one day.", icon: "calendar", xp: 100, earned: (c) => c.dailySwept },
  { id: "scholar", name: "Scholar", description: "Finish every tutorial step.", icon: "graduation", xp: 50, earned: (c) => c.tutorialDone },
];

function beat(context: AchievementContext, difficulty: MatchOutcome["difficulty"]): boolean {
  const outcome = played(context);
  return !!outcome && outcome.won && outcome.vsBots && outcome.difficulty === difficulty;
}

/** Achievements the context earns that the player does not hold yet, in gallery order. */
export function newAchievements(held: Record<string, number>, context: AchievementContext): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => held[a.id] === undefined && a.earned(context));
}

/** Folds one match into the lifetime totals; the tutorial adds nothing. */
export function addToLifetime(lifetime: Lifetime, outcome: MatchOutcome): Lifetime {
  if (isTutorial(outcome)) return lifetime;
  const racesWon = outcome.won && outcome.race && !lifetime.racesWon.includes(outcome.race) ? [...lifetime.racesWon, outcome.race] : lifetime.racesWon;
  return {
    matches: lifetime.matches + 1,
    wins: lifetime.wins + (outcome.won ? 1 : 0),
    kills: lifetime.kills + outcome.kills,
    heroKills: lifetime.heroKills + outcome.heroKills,
    soldiersTrained: lifetime.soldiersTrained + outcome.soldiersTrained,
    gathered: lifetime.gathered + outcome.gathered,
    racesWon,
  };
}
