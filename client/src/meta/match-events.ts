import type { GameEvent } from "../net/protocol";

type Listener = (events: GameEvent[]) => void;

const listeners = new Set<Listener>();

/** Lets UI outside the game view, such as the tutorial, watch the match's events; returns the unsubscribe. */
export function onMatchEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishMatchEvents(events: GameEvent[]): void {
  for (const listener of listeners) listener(events);
}
