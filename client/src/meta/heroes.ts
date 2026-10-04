import { content, raceHeroes } from "../content/content";
import { isUnlockedAt, registerUnlock, unlockLevel } from "./unlocks";

/** Profile level that unlocks each hero; the classic heroes, and any hero not listed, are owned from the start. */
const HERO_LEVELS: Record<string, number> = { archmage: 2, shaman: 2, ranger: 3, blademaster: 3 };

for (const race of content.races) {
  for (const hero of raceHeroes(race.id)) {
    registerUnlock({ id: heroUnlockId(hero.id), kind: "hero", name: hero.name, level: HERO_LEVELS[hero.id] ?? 1 });
  }
}

export function heroUnlockId(heroId: string): string {
  return `hero:${heroId}`;
}

/** The profile level a hero needs; 1 for one owned from the start. */
export function heroUnlockLevel(heroId: string): number {
  return unlockLevel(heroUnlockId(heroId)) ?? 1;
}

export function isHeroUnlocked(heroId: string, profileLevel: number): boolean {
  return isUnlockedAt(heroUnlockId(heroId), profileLevel);
}

/** The hero a seat of the race leads: the saved pick when the race fields it and the level owns it, else the classic hero. */
export function pickedHero(raceId: string, saved: string | undefined, profileLevel: number): string {
  const pick = raceHeroes(raceId).find((h) => h.id === saved);
  return pick && isHeroUnlocked(pick.id, profileLevel) ? pick.id : (content.races.find((r) => r.id === raceId)?.hero ?? "");
}
