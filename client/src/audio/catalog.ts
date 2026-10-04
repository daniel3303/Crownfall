/** Every sound the game plays, as built by tools/assets/sounds.mjs into /assets/audio. */

export type Bus = "music" | "ambience" | "effects";

export type SoundId =
  | "select"
  | "move"
  | "attack"
  | "place"
  | "clash"
  | "chop"
  | "crossbow"
  | "bow"
  | "arrowHit"
  | "arrowHitWood"
  | "death"
  | "deathBones"
  | "collapse"
  | "meteorFall"
  | "meteor"
  | "cleave"
  | "charge"
  | "rally"
  | "alert"
  | "levelUp"
  | "built"
  | "trained"
  | "coin"
  | "depositWood"
  | "depositStone"
  | "depositFood"
  | "victory"
  | "defeat";

export interface SoundDef {
  /** Recorded takes, served as `<id>-1.mp3` to `<id>-<variants>.mp3`; one is picked at random per play. */
  variants: number;
  gain: number;
  maxVoices: number;
  /** Minimum milliseconds between two starts, for acknowledgements a click spree would stack. */
  minInterval?: number;
  /** Random playback-rate spread (±fraction), so repeats differ in pitch. */
  pitchJitter?: number;
  /** Random level spread (±dB). */
  gainJitter?: number;
  /** Combat weight this sound adds to the war soundscape when it plays at a map point. */
  intensity?: number;
}

const UI = { maxVoices: 1, minInterval: 70, pitchJitter: 0.05, gainJitter: 1.5 };
const DEPOSIT = { maxVoices: 2, minInterval: 90, pitchJitter: 0.08, gainJitter: 2 };
const STINGER = { variants: 1, gain: 0.9, maxVoices: 1 };

export const SOUNDS: Record<SoundId, SoundDef> = {
  select: { ...UI, variants: 3, gain: 0.5 },
  move: { ...UI, variants: 3, gain: 0.55 },
  attack: { ...UI, variants: 3, gain: 0.5 },
  place: { ...UI, variants: 3, gain: 0.6, maxVoices: 2 },
  clash: { variants: 8, gain: 0.5, maxVoices: 6, pitchJitter: 0.08, gainJitter: 2.5, intensity: 1 },
  chop: { variants: 5, gain: 0.45, maxVoices: 4, pitchJitter: 0.08, gainJitter: 2, intensity: 0.6 },
  crossbow: { variants: 5, gain: 0.4, maxVoices: 4, pitchJitter: 0.06, gainJitter: 2, intensity: 0.3 },
  bow: { variants: 5, gain: 0.4, maxVoices: 4, pitchJitter: 0.06, gainJitter: 2, intensity: 0.3 },
  arrowHit: { variants: 5, gain: 0.45, maxVoices: 4, pitchJitter: 0.1, gainJitter: 2, intensity: 0.4 },
  arrowHitWood: { variants: 4, gain: 0.4, maxVoices: 3, pitchJitter: 0.1, gainJitter: 2, intensity: 0.2 },
  death: { variants: 6, gain: 0.55, maxVoices: 3, minInterval: 60, pitchJitter: 0.07, gainJitter: 2, intensity: 3 },
  deathBones: { variants: 3, gain: 0.5, maxVoices: 3, pitchJitter: 0.1, gainJitter: 2, intensity: 2 },
  collapse: { variants: 3, gain: 0.85, maxVoices: 2, pitchJitter: 0.05, gainJitter: 1, intensity: 6 },
  meteorFall: { variants: 1, gain: 0.7, maxVoices: 2, pitchJitter: 0.03 },
  meteor: { variants: 2, gain: 1, maxVoices: 2, pitchJitter: 0.04, intensity: 8 },
  cleave: { variants: 2, gain: 0.75, maxVoices: 2, pitchJitter: 0.05, gainJitter: 1, intensity: 2 },
  charge: { variants: 2, gain: 0.75, maxVoices: 2, pitchJitter: 0.05, gainJitter: 1, intensity: 2 },
  rally: { variants: 1, gain: 0.75, maxVoices: 1, pitchJitter: 0.02 },
  alert: { variants: 2, gain: 0.6, maxVoices: 1, minInterval: 2500 },
  levelUp: { variants: 1, gain: 0.6, maxVoices: 1 },
  built: { variants: 2, gain: 0.65, maxVoices: 1, minInterval: 300, pitchJitter: 0.03 },
  trained: { variants: 2, gain: 0.55, maxVoices: 1, minInterval: 200, pitchJitter: 0.04 },
  coin: { ...DEPOSIT, variants: 3, gain: 0.4 },
  depositWood: { ...DEPOSIT, variants: 3, gain: 0.4 },
  depositStone: { ...DEPOSIT, variants: 3, gain: 0.35 },
  depositFood: { ...DEPOSIT, variants: 2, gain: 0.45 },
  victory: STINGER,
  defeat: STINGER,
};

/** Seamless loops: the peace and war beds crossfade on combat intensity, the music plays under both. */
export const LOOPS = {
  peace: { file: "ambience-peace", bus: "ambience" },
  war: { file: "ambience-war", bus: "ambience" },
  music: { file: "music-battle", bus: "music" },
} as const satisfies Record<string, { file: string; bus: Bus }>;

export type LoopId = keyof typeof LOOPS;

export const AUDIO_BASE = "/assets/audio/";
/** Each loop's seamless window (seconds into the decoded file), written by the build next to the loops. */
export const LOOP_MANIFEST = "loops.json";

export type LoopWindows = Record<string, { start: number; end: number }>;

/** Served file names (without extension) of a sound's variants. */
export function variantFiles(id: SoundId): string[] {
  return Array.from({ length: SOUNDS[id].variants }, (_, i) => `${id}-${i + 1}`);
}
