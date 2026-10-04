import { content } from "../content/content";
import { pickedHero } from "../meta/heroes";
import { levelInfo } from "../meta/levels";
import { normalizeMeta, type MetaState } from "../meta/progression";
import { readJson, writeJson } from "../meta/storage";
import { isUnlockedAt } from "../meta/unlocks";
import type { Profile } from "../session";

export { registerUnlock, unlockLevel } from "../meta/unlocks";

const KEY = "crownfall.profile";
/** Progression lives under its own key, so the join profile stays the small name-and-race record the server reads. */
const META_KEY = "crownfall.meta";

const NAMES = ["Aldric", "Brenna", "Corvin", "Dagny", "Elric", "Freya", "Gareth", "Hilda", "Ivor", "Jora"];

export function loadProfile(): Profile {
  const saved = readJson<Profile>(KEY);
  if (saved?.name && content.races.some((r) => r.id === saved.race)) return saved;
  // The drawn name is kept, so the legend card, lobby seat and scoreboard show one name across visits.
  const fresh = { name: NAMES[Math.floor(Math.random() * NAMES.length)]!, race: content.races[0]!.id };
  saveProfile(fresh);
  return fresh;
}

export function saveProfile(profile: Profile): void {
  writeJson(KEY, profile);
}

/** Level, XP, ladder, daily challenges, achievements and cosmetics; a fresh profile when storage is empty or blocked. */
export function loadMeta(now = new Date()): MetaState {
  return normalizeMeta(readJson(META_KEY), now);
}

export function saveMeta(state: MetaState): void {
  writeJson(META_KEY, state);
}

export function profileLevel(): number {
  return levelInfo(loadMeta().xp).level;
}

/** The hero the profile leads for its race: its last pick there while unlocked, else the race's classic hero. */
export function profileHero(profile: Profile): string {
  return pickedHero(profile.race, profile.heroes?.[profile.race], profileLevel());
}

/** Remembers a hero pick for its race, so the next lobby and Quick Play lead it. */
export function rememberHero(race: string, hero: string): void {
  const profile = loadProfile();
  saveProfile({ ...profile, heroes: { ...profile.heroes, [race]: hero } });
}

/** Whether the local profile's level unlocks an id, such as a cosmetic or a level-gated hero. */
export function isUnlocked(id: string): boolean {
  return isUnlockedAt(id, profileLevel());
}
