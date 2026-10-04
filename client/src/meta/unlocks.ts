/** Kinds of things a profile level unlocks. Cosmetics never change how a match plays; `hero` is reserved for gating heroes. */
export type UnlockKind = "title" | "crest" | "banner" | "frame" | "hero";

export interface Unlockable {
  /** Unique across kinds, prefixed by kind: `title:knight`, `crest:flame`, `hero:ranger`. */
  id: string;
  kind: UnlockKind;
  name: string;
  /** Profile level that unlocks it; 1 means owned from the start. */
  level: number;
  /** Crest glyph name, banner colours or frame colour, read by the cosmetic renderers. */
  look?: string;
}

const registry = new Map<string, Unlockable>();

/** Adds an unlockable, or replaces one with the same id; a later batch registers heroes here to gate them by level. */
export function registerUnlock(item: Unlockable): void {
  registry.set(item.id, item);
}

/** The profile level that unlocks an id; undefined for an id nobody registered. */
export function unlockLevel(id: string): number | undefined {
  return registry.get(id)?.level;
}

/** Whether a profile at `level` owns the id; unregistered ids are never unlocked. */
export function isUnlockedAt(id: string, level: number): boolean {
  const required = unlockLevel(id);
  return required !== undefined && level >= required;
}

export function unlockable(id: string): Unlockable | undefined {
  return registry.get(id);
}

/** Every unlockable of a kind, cheapest first. */
export function unlockablesOf(kind: UnlockKind): Unlockable[] {
  return [...registry.values()].filter((u) => u.kind === kind).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

/** What climbing from one level to another unlocks, cheapest first; empty when the level did not rise. */
export function unlockedBetween(fromLevel: number, toLevel: number): Unlockable[] {
  return [...registry.values()].filter((u) => u.level > fromLevel && u.level <= toLevel).sort((a, b) => a.level - b.level);
}

const COSMETICS: Unlockable[] = [
  { id: "title:recruit", kind: "title", name: "Recruit", level: 1 },
  { id: "title:squire", kind: "title", name: "Squire", level: 3 },
  { id: "title:knight", kind: "title", name: "Knight", level: 5 },
  { id: "title:warden", kind: "title", name: "Warden", level: 8 },
  { id: "title:champion", kind: "title", name: "Champion", level: 12 },
  { id: "title:warlord", kind: "title", name: "Warlord", level: 16 },
  { id: "title:crownbreaker", kind: "title", name: "Crownbreaker", level: 20 },
  { id: "title:sovereign", kind: "title", name: "Sovereign", level: 25 },
  { id: "crest:shield", kind: "crest", name: "Shield", level: 1, look: "shield" },
  { id: "crest:swords", kind: "crest", name: "Crossed Swords", level: 2, look: "swords" },
  { id: "crest:hammer", kind: "crest", name: "Hammer", level: 4, look: "hammer" },
  { id: "crest:flame", kind: "crest", name: "Flame", level: 6, look: "flame" },
  { id: "crest:moon", kind: "crest", name: "Moon", level: 9, look: "moon" },
  { id: "crest:skull", kind: "crest", name: "Skull", level: 11, look: "skull" },
  { id: "crest:bird", kind: "crest", name: "Raven", level: 14, look: "bird" },
  { id: "crest:gem", kind: "crest", name: "Gem", level: 18, look: "gem" },
  { id: "crest:crown", kind: "crest", name: "Crown", level: 22, look: "crown" },
  { id: "banner:oak", kind: "banner", name: "Oak", level: 1, look: "#3a3226,#251f17" },
  { id: "banner:azure", kind: "banner", name: "Azure", level: 2, look: "#1e3a8a,#0f172a" },
  { id: "banner:crimson", kind: "banner", name: "Crimson", level: 4, look: "#7f1d1d,#1c0a0a" },
  { id: "banner:verdant", kind: "banner", name: "Verdant", level: 7, look: "#14532d,#0a1a10" },
  { id: "banner:royal", kind: "banner", name: "Royal Purple", level: 10, look: "#581c87,#1a0b2e" },
  { id: "banner:gilded", kind: "banner", name: "Gilded", level: 13, look: "#a16207,#3b2506" },
  { id: "banner:obsidian", kind: "banner", name: "Obsidian", level: 17, look: "#27272a,#000000" },
  { id: "banner:dragonfire", kind: "banner", name: "Dragonfire", level: 24, look: "#c2410c,#450a0a" },
  { id: "frame:wood", kind: "frame", name: "Wooden", level: 1, look: "#6b5a3a" },
  { id: "frame:bronze", kind: "frame", name: "Bronze", level: 3, look: "#b45309" },
  { id: "frame:silver", kind: "frame", name: "Silver", level: 6, look: "#cbd5e1" },
  { id: "frame:gold", kind: "frame", name: "Gold", level: 10, look: "#e9c46a" },
  { id: "frame:runic", kind: "frame", name: "Runic", level: 15, look: "#22d3ee" },
  { id: "frame:royal", kind: "frame", name: "Royal", level: 21, look: "#f472b6" },
];

COSMETICS.forEach(registerUnlock);

/** The cosmetic a fresh profile wears in each slot. */
export const DEFAULT_LOOK = { title: "title:recruit", crest: "crest:shield", banner: "banner:oak", frame: "frame:wood" } as const;

export type CosmeticSlot = keyof typeof DEFAULT_LOOK;
