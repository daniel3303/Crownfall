import { describe, expect, it } from "vitest";
import { SOUNDS } from "../src/audio/catalog";
import { ANNOUNCEMENT_MS, ANNOUNCEMENT_SOUNDS, currentAnnouncement, queueAnnouncement, type Announcement } from "../src/ui/hud/announcements";

const call = (id: number, title: string): Omit<Announcement, "start"> => ({ id, type: "killStreak", title, text: "", ours: true });

describe("announcements", () => {
  it("shows banners that arrive together one after another", () => {
    let queue = queueAnnouncement([], call(1, "First Blood"), 1000);
    queue = queueAnnouncement(queue, call(2, "Killing Spree"), 1000);

    expect(currentAnnouncement(queue, 1000)?.title).toBe("First Blood");
    expect(currentAnnouncement(queue, 1000 + ANNOUNCEMENT_MS)?.title).toBe("Killing Spree");
    expect(currentAnnouncement(queue, 1000 + 2 * ANNOUNCEMENT_MS)).toBeNull();
  });

  it("drops finished banners and starts a late one at once", () => {
    const queue = queueAnnouncement(queueAnnouncement([], call(1, "Old"), 0), call(2, "New"), 10 * ANNOUNCEMENT_MS);

    expect(queue.map((a) => a.title)).toEqual(["New"]);
    expect(queue[0]!.start).toBe(10 * ANNOUNCEMENT_MS);
  });

  it("plays only sounds the catalog ships", () => {
    for (const sound of Object.values(ANNOUNCEMENT_SOUNDS)) expect(SOUNDS[sound]).toBeDefined();
  });
});
