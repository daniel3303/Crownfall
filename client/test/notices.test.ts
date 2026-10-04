import { afterEach, describe, expect, it, vi } from "vitest";
import { NOTICE_MS, store } from "../src/ui/store";

describe("HudStore.notify", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps one toast when the same message repeats", () => {
    store.reset();
    store.notify("Not enough gold.", "warn");
    store.notify("Train queued.", "info");
    store.notify("Not enough gold.", "warn");

    expect(store.get().notices.map((n) => n.text)).toEqual(["Train queued.", "Not enough gold."]);
  });

  it("drops a toast once it has been on screen for its full time", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "performance"] });
    store.reset();
    store.notify("Bought Leather Armor.", "info");
    vi.advanceTimersByTime(NOTICE_MS - 100);
    expect(store.get().notices).toHaveLength(1);

    vi.advanceTimersByTime(200);

    expect(store.get().notices).toEqual([]);
  });
});
