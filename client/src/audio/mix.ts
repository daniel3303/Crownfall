/** Pure mixing math for the audio module: positional level, pan and muffling, voice caps and combat intensity. */

/** Camera zoom (the orbit radius) at its closest and farthest; mirrors the limits in render/camera.ts. */
export const ZOOM_NEAR = 14;
export const ZOOM_FAR = 52;
// Half the ground width the camera shows, per unit of zoom (0.75 rad field of view on a wide screen).
const VIEW_HALF_WIDTH_PER_ZOOM = 0.7;
// Level falls with distance past the view's edge, to a floor that keeps off-screen fights audible.
const ROLLOFF = 1.5;
export const OFFSCREEN_FLOOR = 0.12;
const MAX_PAN = 0.75;
// Fully zoomed out, the whole battlefield mix sits this much lower than fully zoomed in.
const ZOOMED_OUT_GAIN = 0.7;
const OPEN_CUTOFF_HZ = 18000;
const MUFFLED_CUTOFF_HZ = 1200;

export interface Listener {
  x: number;
  y: number;
  zoom: number;
}

/** Map units from the camera focus to the edge of the view, at a zoom. */
export function viewRadius(zoom: number): number {
  return zoom * VIEW_HALF_WIDTH_PER_ZOOM;
}

/** Linear level of a sound at a map point: full on screen, rolling off past the view to the off-screen floor. */
export function attenuation(listener: Listener, x: number, y: number): number {
  const distance = Math.hypot(x - listener.x, y - listener.y);
  const radius = viewRadius(listener.zoom);
  if (distance <= radius) return 1;
  return Math.max(OFFSCREEN_FLOOR, (radius / distance) ** ROLLOFF);
}

/** Stereo position from -1 (left) to 1 (right): the screen's edges sit at ±MAX_PAN, never hard-panned. */
export function pan(listener: Listener, x: number): number {
  const offset = (x - listener.x) / viewRadius(listener.zoom);
  return Math.max(-1, Math.min(1, offset)) * MAX_PAN;
}

/** Master battlefield level for a zoom: closer is louder. */
export function zoomGain(zoom: number): number {
  const t = Math.max(0, Math.min(1, (zoom - ZOOM_NEAR) / (ZOOM_FAR - ZOOM_NEAR)));
  return 1 + (ZOOMED_OUT_GAIN - 1) * t;
}

/** Low-pass cutoff for a sound at a level: distant sounds lose their highs, like a far-off fight. */
export function muffleCutoff(level: number): number {
  const t = Math.max(0, Math.min(1, (1 - level) / (1 - OFFSCREEN_FLOOR)));
  return OPEN_CUTOFF_HZ * (MUFFLED_CUTOFF_HZ / OPEN_CUTOFF_HZ) ** t;
}

/** A random factor in [1 - spread, 1 + spread]. */
export function jitter(random: () => number, spread: number): number {
  return 1 + (random() * 2 - 1) * spread;
}

export function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

// --- Voices --------------------------------------------------------------------------------

export interface Voice {
  id: number;
  sound: string;
  gain: number;
  started: number;
}

export type Admission = { admitted: false } | { admitted: true; evict?: Voice };

// A playing voice counts for less as it ages, since one-shots fade: an old clash yields to a fresh one.
const VOICE_FADE_SECONDS = 0.6;

/** Caps simultaneous voices per sound and overall; a new voice replaces the weakest one only if it is louder. */
export class VoiceLimiter {
  private readonly voices: Voice[] = [];

  constructor(private readonly globalMax: number) {}

  get count(): number {
    return this.voices.length;
  }

  admit(sound: string, gain: number, soundMax: number, now: number): Admission {
    const same = this.voices.filter((v) => v.sound === sound);
    if (same.length >= soundMax) return this.replaceWeakest(same, gain, now);
    if (this.voices.length >= this.globalMax) return this.replaceWeakest(this.voices, gain, now);
    return { admitted: true };
  }

  add(voice: Voice): void {
    this.voices.push(voice);
  }

  remove(id: number): void {
    const index = this.voices.findIndex((v) => v.id === id);
    if (index >= 0) this.voices.splice(index, 1);
  }

  private replaceWeakest(candidates: Voice[], gain: number, now: number): Admission {
    let weakest: Voice | undefined;
    let weakestLevel = Infinity;
    for (const voice of candidates) {
      const level = voice.gain * Math.exp(-(now - voice.started) / VOICE_FADE_SECONDS);
      if (level < weakestLevel) {
        weakest = voice;
        weakestLevel = level;
      }
    }
    if (!weakest || gain <= weakestLevel) return { admitted: false };
    return { admitted: true, evict: weakest };
  }
}

// --- Combat intensity ----------------------------------------------------------------------

// Combat weight halves this often (seconds) once the fighting stops.
export const INTENSITY_HALF_LIFE = 5;
// Steady weight at which the war bed reaches two thirds of its level: about ten melee units trading blows on screen.
const INTENSITY_SCALE = 50;

/** Recent combat, weighted by closeness to the camera and decaying over time; drives the war soundscape. */
export class CombatIntensity {
  private level = 0;
  private time = 0;

  add(weight: number, now: number): void {
    this.decay(now);
    this.level += weight;
  }

  value(now: number): number {
    this.decay(now);
    return this.level;
  }

  /** How far the soundscape leans to war, from 0 (peace) towards 1. */
  warMix(now: number): number {
    return 1 - Math.exp(-this.value(now) / INTENSITY_SCALE);
  }

  reset(): void {
    this.level = 0;
  }

  private decay(now: number): void {
    if (now > this.time) this.level *= 0.5 ** ((now - this.time) / INTENSITY_HALF_LIFE);
    this.time = Math.max(this.time, now);
  }
}

/** Equal-power gains for the peace and war beds, so the crossfade never dips or swells. */
export function crossfadeGains(warMix: number): { peace: number; war: number } {
  const angle = (Math.max(0, Math.min(1, warMix)) * Math.PI) / 2;
  return { peace: Math.cos(angle), war: Math.sin(angle) };
}
