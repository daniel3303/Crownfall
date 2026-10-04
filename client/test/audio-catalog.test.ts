import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LOOP_MANIFEST, LOOPS, SOUNDS, variantFiles, type LoopWindows, type SoundId } from "../src/audio/catalog";
import { DEFAULT_VOLUMES, loadVolumes, saveVolumes } from "../src/audio/settings";

const AUDIO_DIR = fileURLToPath(new URL("../public/assets/audio", import.meta.url));

describe("audio catalog", () => {
  it("matches the files tools/assets/sounds.mjs builds, with nothing missing or left over", () => {
    const expected = [...(Object.keys(SOUNDS) as SoundId[]).flatMap(variantFiles), ...Object.values(LOOPS).map((loop) => loop.file)];
    const built = readdirSync(AUDIO_DIR)
      .filter((file) => file.endsWith(".mp3"))
      .map((file) => file.slice(0, -".mp3".length));
    expect(built.sort()).toEqual(expected.sort());
  });

  it("gives every loop a seamless window inside its file", () => {
    const windows = JSON.parse(readFileSync(`${AUDIO_DIR}/${LOOP_MANIFEST}`, "utf8")) as LoopWindows;
    expect(Object.keys(windows).sort()).toEqual(Object.values(LOOPS).map((loop) => loop.file).sort());
    for (const window of Object.values(windows)) {
      expect(window.start).toBeGreaterThan(0);
      expect(window.end).toBeGreaterThan(window.start);
    }
  });

  it("caps every sound to at least one voice", () => {
    for (const def of Object.values(SOUNDS)) expect(def.maxVoices).toBeGreaterThanOrEqual(1);
  });
});

describe("audio settings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to the defaults when storage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(loadVolumes()).toEqual(DEFAULT_VOLUMES);
    expect(() => saveVolumes(DEFAULT_VOLUMES)).not.toThrow();
  });

  it("restores saved volumes, clamped, ignoring junk", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) };
    vi.stubGlobal("localStorage", storage);
    store.set("crownfall.volumes", JSON.stringify({ music: 0.2, ambience: 3, effects: "loud" }));
    expect(loadVolumes()).toEqual({ music: 0.2, ambience: 1, effects: DEFAULT_VOLUMES.effects });
    saveVolumes({ music: 0.1, ambience: 0.5, effects: 0.9 });
    expect(loadVolumes()).toEqual({ music: 0.1, ambience: 0.5, effects: 0.9 });
  });
});
