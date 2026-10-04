import { afterEach, describe, expect, it, vi } from "vitest";
import { readJson, writeJson } from "../src/meta/storage";

function fakeStorage(store: Map<string, string>, refuseWrites = false) {
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (refuseWrites) throw new Error("QuotaExceededError");
      store.set(key, value);
    },
  };
}

describe("meta storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads a save another tab made after this tab's own write", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", fakeStorage(store));

    writeJson("test.tabs", { xp: 100 });
    store.set("test.tabs", JSON.stringify({ xp: 250 }));

    expect(readJson("test.tabs")).toEqual({ xp: 250 });
  });

  it("keeps a refused write for the rest of the visit", () => {
    vi.stubGlobal("localStorage", fakeStorage(new Map(), true));

    writeJson("test.full", { xp: 40 });

    expect(readJson("test.full")).toEqual({ xp: 40 });
  });

  it("reads absent, blocked or corrupt entries as null", () => {
    expect(readJson("test.none")).toBeNull();
    vi.stubGlobal("localStorage", fakeStorage(new Map([["test.corrupt", "{oops"]])));

    expect(readJson("test.corrupt")).toBeNull();
    expect(readJson("test.missing")).toBeNull();
  });
});
