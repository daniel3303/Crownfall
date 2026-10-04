import { useEffect, useState } from "react";
import { onMatchEvents } from "../../meta/match-events";
import { countEvents, NO_PROGRESS, type TutorialCounters, type TutorialWitness } from "../../meta/tutorial";
import { Flags } from "../../net/protocol";
import { session } from "../../session";
import { store } from "../store";

const POLL_MS = 250;

/** Follows the tutorial match: match events feed the counters, and a poll reads the camera, selection and upgrades. */
class TutorialTracker {
  counters: TutorialCounters = NO_PROGRESS;
  private cameraStart: { x: number; y: number } | null = null;
  private readonly unsubscribe: () => void;
  private readonly timer: number;

  constructor(private readonly changed: (counters: TutorialCounters) => void) {
    this.unsubscribe = onMatchEvents((events) => this.update(countEvents(this.counters, events, this.witness())));
    this.timer = window.setInterval(() => this.poll(), POLL_MS);
  }

  dispose(): void {
    this.unsubscribe();
    window.clearInterval(this.timer);
  }

  private witness(): TutorialWitness {
    const world = session.game?.world;
    const you = store.get().match?.you ?? -1;
    if (!world) return { you, hero: null };
    for (const entity of world.entities.values()) {
      if (entity.owner === you && (entity.flags & Flags.Hero) !== 0) return { you, hero: { x: entity.x, y: entity.y } };
    }
    return { you, hero: null };
  }

  private poll(): void {
    const game = session.game;
    const hud = store.get();
    if (!game || hud.loading) return;
    const next = { ...this.counters };
    // The match opens the camera on the town center; travel counts from the first look once the models are in.
    const focus = game.renderer.camera.focus;
    this.cameraStart ??= { x: focus.x, y: focus.y };
    next.cameraTravel = Math.max(next.cameraTravel, Math.hypot(focus.x - this.cameraStart.x, focus.y - this.cameraStart.y));
    if (hud.selection.kind === "units" && hud.selection.villagers) next.villagersSelected = true;
    const upgrading = [...game.world.entities.values()].some((e) => e.owner === hud.match?.you && e.upgrading);
    if (upgrading) next.upgrades = Math.max(next.upgrades, 1);
    if (next.cameraTravel !== this.counters.cameraTravel || next.villagersSelected !== this.counters.villagersSelected || next.upgrades !== this.counters.upgrades) {
      this.update(next);
    }
  }

  private update(counters: TutorialCounters): void {
    this.counters = counters;
    this.changed(counters);
  }
}

/** The tutorial counters for as long as the calling component stays mounted. */
export function useTutorialCounters(): TutorialCounters {
  const [counters, setCounters] = useState<TutorialCounters>(NO_PROGRESS);
  useEffect(() => {
    const tracker = new TutorialTracker(setCounters);
    return () => tracker.dispose();
  }, []);
  return counters;
}
