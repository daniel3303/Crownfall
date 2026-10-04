/** One server sample of a moving entity, stamped with its tick time in server milliseconds. */
export interface MotionSample {
  t: number;
  x: number;
  y: number;
  facing: number;
  state: number;
}

/** Samples kept per entity: enough to bracket a render time a little over one tick behind the newest. */
const HISTORY = 4;

/**
 * A unit's recent server samples, read back at a render time slightly in the past so it moves between two known
 * samples instead of chasing the newest one, and a late or early snapshot neither stalls nor jumps it.
 */
export class MotionTrack {
  private readonly samples: MotionSample[] = [];

  /** Adds a sample; a teleport drops the history so the entity snaps instead of sliding across the map. */
  push(sample: MotionSample, teleport: boolean): void {
    if (teleport) this.samples.length = 0;
    const last = this.samples[this.samples.length - 1];
    if (last && sample.t <= last.t) {
      this.samples[this.samples.length - 1] = sample;
      return;
    }
    this.samples.push(sample);
    if (this.samples.length > HISTORY) this.samples.shift();
  }

  get latest(): MotionSample | undefined {
    return this.samples[this.samples.length - 1];
  }

  /**
   * Position, facing and state at server time `t`: interpolated between the two samples around it, held at the
   * oldest before the history starts, and extrapolated along the last step for at most `maxAheadMs` past the newest.
   */
  at(t: number, maxAheadMs: number, out: MotionSample): MotionSample {
    const samples = this.samples;
    const first = samples[0];
    if (!first) return out;
    const last = samples[samples.length - 1]!;
    if (t <= first.t || samples.length === 1) return copy(first, out, t);
    if (t >= last.t) {
      const before = samples[samples.length - 2]!;
      const ahead = Math.min(t - last.t, maxAheadMs) / (last.t - before.t);
      copy(last, out, t);
      out.x = last.x + (last.x - before.x) * ahead;
      out.y = last.y + (last.y - before.y) * ahead;
      return out;
    }
    let i = samples.length - 2;
    while (samples[i]!.t > t) i--;
    const a = samples[i]!;
    const b = samples[i + 1]!;
    const f = (t - a.t) / (b.t - a.t);
    copy(a, out, t);
    out.x = a.x + (b.x - a.x) * f;
    out.y = a.y + (b.y - a.y) * f;
    return out;
  }
}

function copy(from: MotionSample, out: MotionSample, t: number): MotionSample {
  out.t = t;
  out.x = from.x;
  out.y = from.y;
  out.facing = from.facing;
  out.state = from.state;
  return out;
}

/** Arrivals the clock takes its fastest from: two seconds of snapshots. */
const WINDOW = 20;
/** Lateness no jitter explains: the server fell behind, so the clock follows at once instead of after the window. */
const SHIFT_MS = 150;
/** Clock error that brings rendering to a standstill; a smaller error slows it in proportion. */
const SLEW_MS = 150;
/** The most rendering speeds up to catch snapshots that arrive sooner. */
const MAX_SPEEDUP = 0.25;

/**
 * Maps the local clock to server tick time from the fastest recent snapshot, so ordinary jitter only adds lateness the
 * render delay absorbs. Rendering never steps back: when snapshots fall behind (a server stall) the clock slows, down
 * to a standstill, and when they come sooner it runs at most a quarter fast until it has caught up.
 */
export class SnapshotClock {
  private offset: number | null = null;
  private target = 0;
  private readonly recent: number[] = [];
  private last = 0;

  constructor(
    private readonly tickMs: number,
    /** How far behind the newest snapshot rendering runs. */
    readonly delayMs: number,
  ) {}

  /** Records that the snapshot for `tick` arrived at local time `now`. */
  arrived(tick: number, now: number): void {
    const offset = now - tick * this.tickMs;
    if (this.offset === null) {
      this.offset = offset;
      this.last = now;
    } else if (offset - this.target > SHIFT_MS) {
      this.recent.length = 0;
    }
    this.recent.push(offset);
    if (this.recent.length > WINDOW) this.recent.shift();
    this.target = Math.min(...this.recent);
  }

  /** The server time to render at local time `now`; call it once a frame, with time running forward. */
  renderTime(now: number): number {
    if (this.offset === null) return -this.delayMs;
    const elapsed = Math.max(0, now - this.last);
    this.last = Math.max(this.last, now);
    const error = this.target - this.offset;
    if (error > 0) this.offset += Math.min(error, elapsed * Math.min(1, error / SLEW_MS));
    else this.offset += Math.max(error, elapsed * Math.max(-MAX_SPEEDUP, error / SLEW_MS));
    return now - this.offset - this.delayMs;
  }
}
