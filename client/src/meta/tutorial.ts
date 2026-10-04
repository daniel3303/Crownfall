import { content, kindInfo } from "../content/content";
import type { GameEvent, MatchConfig } from "../net/protocol";

/** A private one-on-one on a small map against the passive bot, which builds at home and never attacks. */
export const TUTORIAL_CONFIG: MatchConfig = {
  teams: 2,
  playersPerTeam: 1,
  sharing: "separate",
  difficulty: "passive",
  mapSize: "small",
};

/** What the player has done so far in the tutorial match, gathered from the HUD, the world and match events. */
export interface TutorialCounters {
  /** Tiles the camera has moved from where the match opened it. */
  cameraTravel: number;
  villagersSelected: boolean;
  housesBuilt: number;
  villagersTrained: number;
  goldGathered: number;
  barracksBuilt: number;
  soldiersTrained: number;
  /** Wolves slain with the player's hero close by. */
  wolvesSlain: number;
  abilitiesCast: number;
  /** Upgrades started or finished. */
  upgrades: number;
}

export const NO_PROGRESS: TutorialCounters = {
  cameraTravel: 0,
  villagersSelected: false,
  housesBuilt: 0,
  villagersTrained: 0,
  goldGathered: 0,
  barracksBuilt: 0,
  soldiersTrained: 0,
  wolvesSlain: 0,
  abilitiesCast: 0,
  upgrades: 0,
};

export interface TutorialStep {
  id: string;
  title: string;
  text: string;
  done(counters: TutorialCounters): boolean;
}

/** The server's MapGenerator places three wolves per camp, so slaying that many beside the hero clears one; keep the two in step. */
const CAMP_WOLVES = 3;

export const TUTORIAL_STEPS: TutorialStep[] = [
  { id: "camera", title: "Survey the land", text: "Drag the map, swipe with two fingers or hold the arrow keys to move the camera.", done: (c) => c.cameraTravel >= 6 },
  { id: "select", title: "Muster your villagers", text: "Click a villager, or right-drag a box around several, to select them.", done: (c) => c.villagersSelected },
  { id: "house", title: "Build a house", text: "With villagers selected press H, then click open ground. Houses raise your population cap.", done: (c) => c.housesBuilt >= 1 },
  { id: "villagers", title: "Train 3 villagers", text: "Select your town center and press Z three times. More hands, more resources.", done: (c) => c.villagersTrained >= 3 },
  { id: "gold", title: "Mine gold", text: "Select a villager and right-click a gold mine. Gold pays for archers, riders and upgrades.", done: (c) => c.goldGathered > 0 },
  { id: "barracks", title: "Build a barracks", text: "With villagers selected press B and place it near your town center.", done: (c) => c.barracksBuilt >= 1 },
  { id: "soldiers", title: "Train 3 soldiers", text: "Select the finished barracks and press Z, X or C to train spearmen, archers or riders.", done: (c) => c.soldiersTrained >= 3 },
  { id: "wolves", title: "Clear a wolf camp", text: "Select your hero (click it, or hold Space) and right-click the wolves out in the wilds. Bring your soldiers along.", done: (c) => c.wolvesSlain >= CAMP_WOLVES },
  { id: "ability", title: "Use a hero ability", text: "Press Q to cast your hero's first ability. Its W, E and R abilities unlock as your hero levels up.", done: (c) => c.abilitiesCast >= 1 },
  { id: "upgrade", title: "Upgrade a building", text: "Select a building and press U. Upgrades add health, storage and stronger troops.", done: (c) => c.upgrades >= 1 },
];

/** The step the overlay shows: the first one neither done nor skipped, or -1 when the tutorial is through. */
export function currentStep(counters: TutorialCounters, skipped: ReadonlySet<string>): number {
  return TUTORIAL_STEPS.findIndex((step) => !step.done(counters) && !skipped.has(step.id));
}

/** Steps finished for real, skips not counted. */
export function stepsDone(counters: TutorialCounters): number {
  return TUTORIAL_STEPS.filter((step) => step.done(counters)).length;
}

/** A wolf counts for the tutorial only when the player's hero fought nearby. */
const HERO_REACH = 12;

const SOLDIERS = new Set(content.units.filter((u) => u.tags.includes("military")).map((u) => u.id));

/** Who is watching: the local seat and, while it lives, where its hero stands. */
export interface TutorialWitness {
  you: number;
  hero: { x: number; y: number } | null;
}

/** Folds one batch of match events into the counters; events of other seats change nothing. */
export function countEvents(counters: TutorialCounters, events: GameEvent[], witness: TutorialWitness): TutorialCounters {
  const next = { ...counters };
  for (const event of events) {
    switch (event.k) {
      case "completed":
        if (event.player !== witness.you) break;
        if (event.what === "house") next.housesBuilt++;
        else if (event.what === "barracks") next.barracksBuilt++;
        else if (event.what === "villager") next.villagersTrained++;
        else if (SOLDIERS.has(event.what)) next.soldiersTrained++;
        break;
      case "deposit":
        if (event.player === witness.you && event.resource === "gold") next.goldGathered += event.amount;
        break;
      case "death":
        if (event.owner < 0 && kindInfo(event.entityKind)?.def.id === "wolf" && near(witness.hero, event.x, event.y)) next.wolvesSlain++;
        break;
      case "ability":
        if (event.player === witness.you) next.abilitiesCast++;
        break;
      case "upgraded":
        if (event.player === witness.you) next.upgrades++;
        break;
    }
  }
  return next;
}

function near(hero: TutorialWitness["hero"], x: number, y: number): boolean {
  return hero !== null && Math.hypot(hero.x - x, hero.y - y) <= HERO_REACH;
}
