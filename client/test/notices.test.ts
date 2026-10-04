import { describe, expect, it } from "vitest";
import { store } from "../src/ui/store";

describe("HudStore.notify", () => {
  it("keeps one toast when the same message repeats", () => {
    store.reset();
    store.notify("Not enough gold.", "warn");
    store.notify("Train queued.", "info");
    store.notify("Not enough gold.", "warn");

    expect(store.get().notices.map((n) => n.text)).toEqual(["Train queued.", "Not enough gold."]);
  });
});
