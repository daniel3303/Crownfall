import { advanceRow, finished, type Clip } from "./vat-clock";

/** A full about-face takes this long; smaller turns take proportionally less. */
export const ABOUT_FACE_SECONDS = 0.3;
/** Crossfade between two clips. */
export const FADE_SECONDS = 0.18;
/** A unit that stops keeps its move clip this long, so a one-tick pause at a waypoint does not flash the idle pose. */
export const MOVE_HOLD_MS = 250;
/** Move clips play at the unit's ground speed over the clip's, within limits that keep the cycle readable. */
export const MIN_MOVE_RATE = 0.5;
export const MAX_MOVE_RATE = 1.7;
/** One swing per attack interval, within limits so a very fast hero does not flail. */
export const MIN_ATTACK_RATE = 0.5;
export const MAX_ATTACK_RATE = 3;
/** Looping clips play this much faster or slower per unit, so a group does not move in lockstep. */
export const RATE_SPREAD = 0.1;

const TAU = Math.PI * 2;

/** Turns `current` toward `target` along the shorter arc by at most `maxStep` radians; the result stays in [0, 2π). */
export function turnToward(current: number, target: number, maxStep: number): number {
  let delta = (target - current) % TAU;
  if (delta > Math.PI) delta -= TAU;
  else if (delta < -Math.PI) delta += TAU;
  const next = Math.abs(delta) <= maxStep ? target : current + Math.sign(delta) * maxStep;
  return ((next % TAU) + TAU) % TAU;
}

/** Radians a unit may turn in `seconds`. */
export function turnStep(seconds: number): number {
  return (Math.PI / ABOUT_FACE_SECONDS) * seconds;
}

/** Move-clip rate that makes the feet keep pace with the ground: `stride` is the clip's ground speed at scale 1. */
export function moveRate(groundSpeed: number, stride: number, scale: number): number {
  return Math.min(MAX_MOVE_RATE, Math.max(MIN_MOVE_RATE, groundSpeed / (stride * scale)));
}

/** Attack-clip rate that plays one swing per attack interval, `cooldown / attackSpeed` seconds. */
export function attackRate(clipSeconds: number, cooldown: number, attackSpeed: number): number {
  const interval = cooldown / (attackSpeed > 0 ? attackSpeed : 1);
  if (!(interval > 0)) return 1;
  return Math.min(MAX_ATTACK_RATE, Math.max(MIN_ATTACK_RATE, clipSeconds / interval));
}

/**
 * Whether a unit should still look like it is moving: it is, or it moved within the hold time. Units drawn a little
 * behind their snapshots stop on screen a moment after the server says so; the hold covers that and waypoint pauses.
 */
export function stillMoving(moving: boolean, lastMovedMs: number, nowMs: number): boolean {
  return moving || nowMs - lastMovedMs < MOVE_HOLD_MS;
}

/** A clip frame an instance shows. */
export interface Pose {
  clip: Clip;
  row: number;
}

/** How to play a clip; callers may reuse one object, the animator copies what it keeps. */
export interface PlayOptions {
  loop: boolean;
  rate: number;
  row?: number;
  cut?: boolean;
  restart?: boolean;
}

interface Playing extends Pose {
  name: string;
  rate: number;
  loop: boolean;
}

/**
 * One instance's animation, advanced on the CPU each frame: the clip, the row it is on, and the clip it is fading
 * out of. Both keep playing during the fade, so limbs never freeze mid-swing.
 */
export class Animator {
  private current: Playing | null = null;
  private previous: Playing | null = null;
  private fade = 0;

  get name(): string | undefined {
    return this.current?.name;
  }

  get pose(): Pose | null {
    return this.current;
  }

  /** The pose fading out, or null when there is none. */
  get fading(): Pose | null {
    return this.previous !== null && this.fade < FADE_SECONDS ? this.previous : null;
  }

  /** The fading pose's weight: 1 at the switch, down to 0 after FADE_SECONDS. */
  get fadeWeight(): number {
    return this.fading ? 1 - this.fade / FADE_SECONDS : 0;
  }

  /** Whether a one-shot clip has played to its end. */
  get done(): boolean {
    return this.current !== null && !this.current.loop && finished(this.current.clip, this.current.row);
  }

  /** Switches to a clip, fading from the current one unless `cut`; the same clip again only updates its rate unless `restart`. */
  play(name: string, clip: Clip, options: PlayOptions): void {
    if (this.current?.name === name && !options.restart) {
      this.current.rate = options.rate;
      return;
    }
    if (options.cut) {
      this.previous = null;
      this.fade = 0;
    } else if (this.previous && this.fade < FADE_SECONDS) {
      // Mid-fade, the heavier of the two poses fades out from the weight it has, so nothing jumps by more than half.
      if (this.fade >= FADE_SECONDS / 2) {
        this.previous = this.current;
        this.fade = FADE_SECONDS - this.fade;
      }
    } else {
      this.previous = this.current;
      this.fade = 0;
    }
    this.current = { name, clip, row: options.row ?? 0, rate: options.rate, loop: options.loop };
  }

  /** Starts from another animator's pose, fading out of it (a corpse taking over from its living unit). */
  inherit(from: Animator): void {
    this.previous = from.current ? { ...from.current } : null;
    this.fade = 0;
  }

  advance(seconds: number): void {
    const { current, previous } = this;
    if (current) current.row = advanceRow(current.clip, current.row, seconds, current.rate, current.loop);
    if (previous) previous.row = advanceRow(previous.clip, previous.row, seconds, previous.rate, previous.loop);
    this.fade += seconds;
    if (this.fade >= FADE_SECONDS) this.previous = null;
  }
}
