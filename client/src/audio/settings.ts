import type { Bus } from "./catalog";

/** Per-viewer audio preferences in localStorage; blocked storage falls back to defaults for the session. */

export type Volumes = Record<Bus, number>;

const MUTE_KEY = "crownfall.muted";
const VOLUME_KEY = "crownfall.volumes";
export const DEFAULT_VOLUMES: Volumes = { music: 0.6, ambience: 0.7, effects: 0.8 };

export function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Storage can be blocked; the setting still holds for this session.
  }
}

export function loadVolumes(): Volumes {
  try {
    const stored = JSON.parse(localStorage.getItem(VOLUME_KEY) ?? "{}") as Partial<Record<Bus, unknown>>;
    const volumes = { ...DEFAULT_VOLUMES };
    for (const bus of Object.keys(DEFAULT_VOLUMES) as Bus[]) {
      const value = stored[bus];
      if (typeof value === "number" && Number.isFinite(value)) volumes[bus] = clampVolume(value);
    }
    return volumes;
  } catch {
    return { ...DEFAULT_VOLUMES };
  }
}

export function saveVolumes(volumes: Volumes): void {
  try {
    localStorage.setItem(VOLUME_KEY, JSON.stringify(volumes));
  } catch {
    // Storage can be blocked; the setting still holds for this session.
  }
}

export function clampVolume(value: number): number {
  return Math.max(0, Math.min(1, value));
}
