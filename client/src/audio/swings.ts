/** A melee attacker and the time between its blows, in milliseconds. */
export interface Swinger {
  id: number;
  cooldownMs: number;
}

// A unit's first blow lands within this long of taking its attack stance, so a charging line does not ring in unison.
const FIRST_BLOW_SPREAD_MS = 250;

/**
 * When each melee attacker's next weapon sound is due. The simulation sends no event for a melee hit, so the sounds
 * follow each unit's attack cooldown while it holds its attack stance.
 */
export class SwingClock {
  private readonly next = new Map<number, number>();

  /** The attackers whose blow lands by `now`; attackers missing from the list have stopped and are forgotten. */
  due(attackers: Iterable<Swinger>, now: number, random: () => number): number[] {
    const due: number[] = [];
    const seen = new Set<number>();
    for (const { id, cooldownMs } of attackers) {
      seen.add(id);
      const next = this.next.get(id);
      if (next === undefined) {
        this.next.set(id, now + random() * FIRST_BLOW_SPREAD_MS);
        continue;
      }
      if (now < next) continue;
      due.push(id);
      // After a stall (a hidden tab, a late snapshot) the rhythm restarts instead of firing the missed blows.
      this.next.set(id, next + cooldownMs > now ? next + cooldownMs : now + cooldownMs);
    }
    for (const id of this.next.keys()) if (!seen.has(id)) this.next.delete(id);
    return due;
  }
}
