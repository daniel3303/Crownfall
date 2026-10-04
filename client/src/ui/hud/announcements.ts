import type { SoundId } from "../../audio";
import type { AnnouncementType } from "../../net/protocol";

/** How long one banner stays up; banners that arrive together queue one after another. */
export const ANNOUNCEMENT_MS = 3200;

export interface Announcement {
  id: number;
  type: AnnouncementType;
  title: string;
  text: string;
  /** When its banner appears, in performance.now() milliseconds. */
  start: number;
  /** True when the viewer's side made it happen. */
  ours: boolean;
}

/** Appends a banner timed to follow the last queued one, dropping banners that have finished. */
export function queueAnnouncement(queue: readonly Announcement[], next: Omit<Announcement, "start">, now: number): Announcement[] {
  const live = queue.filter((a) => a.start + ANNOUNCEMENT_MS > now);
  const last = live[live.length - 1];
  const start = last ? Math.max(now, last.start + ANNOUNCEMENT_MS) : now;
  return [...live, { ...next, start }];
}

/** The banner showing at this moment, or null between banners. */
export function currentAnnouncement(queue: readonly Announcement[], now: number): Announcement | null {
  return queue.find((a) => a.start <= now && now < a.start + ANNOUNCEMENT_MS) ?? null;
}

/** Existing sounds, chosen so each call reads differently: horns for feats, the alarm for the dragon's landing. */
export const ANNOUNCEMENT_SOUNDS: Record<AnnouncementType, SoundId> = {
  firstBlood: "rally",
  killStreak: "rally",
  shutdown: "levelUp",
  dragonSpawned: "alert",
  dragonSlain: "levelUp",
};
