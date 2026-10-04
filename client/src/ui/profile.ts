import { content } from "../content/content";
import type { Profile } from "../session";

const KEY = "crownfall.profile";

const NAMES = ["Aldric", "Brenna", "Corvin", "Dagny", "Elric", "Freya", "Gareth", "Hilda", "Ivor", "Jora"];

export function loadProfile(): Profile {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Profile | null;
    if (saved?.name && content.races.some((r) => r.id === saved.race)) return saved;
  } catch {
    // Unreadable storage falls back to a fresh profile.
  }
  return { name: NAMES[Math.floor(Math.random() * NAMES.length)]!, race: content.races[0]!.id };
}

export function saveProfile(profile: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // Storage can be blocked; the profile still works for this visit.
  }
}
