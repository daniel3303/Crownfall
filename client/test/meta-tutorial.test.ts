import { describe, expect, it } from "vitest";
import { kinds } from "../src/content/content";
import { readJson, writeJson } from "../src/meta/storage";
import { countEvents, currentStep, NO_PROGRESS, stepsDone, TUTORIAL_CONFIG, TUTORIAL_STEPS } from "../src/meta/tutorial";
import type { GameEvent } from "../src/net/protocol";

const WOLF = kinds.find((k) => k.def.id === "wolf")!.kind;
const witness = { you: 0, hero: { x: 50, y: 50 } };

describe("tutorial", () => {
  it("is a one-on-one against the passive bot", () => {
    expect(TUTORIAL_CONFIG).toMatchObject({ teams: 2, playersPerTeam: 1, difficulty: "passive" });
  });

  it("walks the ten steps in order", () => {
    expect(TUTORIAL_STEPS.map((s) => s.id)).toEqual(["camera", "select", "house", "villagers", "gold", "barracks", "soldiers", "wolves", "ability", "upgrade"]);
    expect(currentStep(NO_PROGRESS, new Set())).toBe(0);
  });

  it("moves past skipped steps without counting them as done", () => {
    const skipped = new Set(["camera", "select"]);

    expect(currentStep(NO_PROGRESS, skipped)).toBe(2);
    expect(stepsDone(NO_PROGRESS)).toBe(0);
  });

  it("finishes when every step is done", () => {
    const all = { ...NO_PROGRESS, cameraTravel: 10, villagersSelected: true, housesBuilt: 1, villagersTrained: 3, goldGathered: 10, barracksBuilt: 1, soldiersTrained: 3, wolvesSlain: 3, abilitiesCast: 1, upgrades: 1 };

    expect(currentStep(all, new Set())).toBe(-1);
    expect(stepsDone(all)).toBe(TUTORIAL_STEPS.length);
  });

  it("counts only the local seat's buildings, training, gold, casts and upgrades", () => {
    const events: GameEvent[] = [
      { k: "completed", player: 0, id: 1, what: "house" },
      { k: "completed", player: 0, id: 2, what: "villager" },
      { k: "completed", player: 0, id: 3, what: "spearman" },
      { k: "completed", player: 1, id: 4, what: "barracks" },
      { k: "deposit", player: 0, x: 1, y: 1, resource: "gold", amount: 10 },
      { k: "deposit", player: 0, x: 1, y: 1, resource: "wood", amount: 10 },
      { k: "ability", player: 0, team: 0, hero: 9, slot: 0, x: 1, y: 1, radius: 2, delayTicks: 0 },
      { k: "upgraded", player: 1, team: 1, id: 5, what: "house", level: 2, x: 1, y: 1 },
    ];

    const counters = countEvents(NO_PROGRESS, events, witness);

    expect(counters).toMatchObject({ housesBuilt: 1, villagersTrained: 1, soldiersTrained: 1, barracksBuilt: 0, goldGathered: 10, abilitiesCast: 1, upgrades: 0 });
  });

  it("counts wolves only when they die near the player's hero", () => {
    const death = (x: number): GameEvent => ({ k: "death", id: x, owner: -1, entityKind: WOLF, x, y: 50, category: "unit" });

    expect(countEvents(NO_PROGRESS, [death(55), death(80)], witness).wolvesSlain).toBe(1);
    expect(countEvents(NO_PROGRESS, [death(55)], { you: 0, hero: null }).wolvesSlain).toBe(0);
  });
});

describe("meta storage", () => {
  it("keeps this visit's writes when the browser has no storage", () => {
    writeJson("crownfall.test", { xp: 5 });

    expect(readJson<{ xp: number }>("crownfall.test")).toEqual({ xp: 5 });
    expect(readJson("crownfall.missing")).toBeNull();
  });
});
