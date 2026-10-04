import { describe, expect, it } from "vitest";
import { MotionTrack, SnapshotClock, type MotionSample } from "../src/game/motion";

const sample = (t: number, x: number, y = 0, state = 1): MotionSample => ({ t, x, y, facing: 0, state });
const out = (): MotionSample => sample(0, 0);

describe("MotionTrack", () => {
  it("interpolates between the two samples around the render time", () => {
    const track = new MotionTrack();
    track.push(sample(100, 10), false);
    track.push(sample(200, 11), false);
    track.push(sample(300, 13), false);
    expect(track.at(150, 100, out()).x).toBeCloseTo(10.5);
    expect(track.at(250, 100, out()).x).toBeCloseTo(12);
  });

  it("takes facing and state from the sample the unit is leaving", () => {
    const track = new MotionTrack();
    track.push({ t: 100, x: 0, y: 0, facing: 1, state: 1 }, false);
    track.push({ t: 200, x: 1, y: 0, facing: 2, state: 0 }, false);
    const at = track.at(190, 100, out());
    expect(at.facing).toBe(1);
    expect(at.state).toBe(1);
  });

  it("holds the oldest sample before the history starts", () => {
    const track = new MotionTrack();
    track.push(sample(100, 10), false);
    track.push(sample(200, 11), false);
    expect(track.at(50, 100, out()).x).toBe(10);
  });

  it("coasts along the last step when a snapshot is late, up to the cap", () => {
    const track = new MotionTrack();
    track.push(sample(100, 10), false);
    track.push(sample(200, 11), false);
    expect(track.at(250, 100, out()).x).toBeCloseTo(11.5);
    expect(track.at(900, 100, out()).x).toBeCloseTo(12);
  });

  it("snaps on a teleport instead of sliding across the map", () => {
    const track = new MotionTrack();
    track.push(sample(100, 10), false);
    track.push(sample(200, 40), true);
    expect(track.at(150, 100, out()).x).toBe(40);
  });

  it("replaces a sample for the same tick", () => {
    const track = new MotionTrack();
    track.push(sample(100, 10), false);
    track.push(sample(100, 12), false);
    expect(track.latest?.x).toBe(12);
  });
});

describe("SnapshotClock", () => {
  const TICK = 100;
  const DELAY = 130;
  /** Arrivals for ticks `from`..`to`, each `late` ms after its tick time, and the render time every 16 ms between. */
  const play = (clock: SnapshotClock, from: number, to: number, late: (tick: number) => number) => {
    const times: number[] = [];
    let arrival = from;
    for (let now = from * TICK + late(from); arrival <= to; now += 16) {
      while (arrival <= to && arrival * TICK + late(arrival) <= now) clock.arrived(arrival, arrival * TICK + late(arrival++));
      times.push(clock.renderTime(now));
    }
    return times;
  };

  it("renders the delay behind the snapshots' tick time", () => {
    const clock = new SnapshotClock(TICK, DELAY);
    clock.arrived(10, 5000);
    expect(clock.renderTime(5000)).toBe(1000 - DELAY);
    expect(clock.renderTime(5050)).toBe(1050 - DELAY);
  });

  it("keeps time through ordinary jitter, taking the fastest recent snapshot", () => {
    const clock = new SnapshotClock(TICK, DELAY);
    const late = (tick: number) => 40 + ((tick * 37) % 60);
    const times = play(clock, 0, 60, late);
    // It runs the delay behind the fastest of the last twenty snapshots.
    const fastest = Math.min(...Array.from({ length: 20 }, (_, i) => late(41 + i)));
    expect(clock.renderTime(7000)).toBeCloseTo(7000 - fastest - DELAY, 6);
    // Once settled, rendering runs at real speed: one frame moves render time one frame.
    const steps = times.slice(30).map((t, i, all) => (i === 0 ? 16 : t - all[i - 1]!));
    expect(Math.max(...steps.map((step) => Math.abs(step - 16)))).toBeLessThan(0.5);
  });

  it("slows down without stepping back when the server falls behind, then follows the new pace", () => {
    const clock = new SnapshotClock(TICK, DELAY);
    // From tick 20 on every snapshot comes 300 ms later than before: a server stall it never makes up.
    const times = play(clock, 0, 60, (tick) => (tick < 20 ? 10 : 310));
    for (let i = 1; i < times.length; i++) expect(times[i]!).toBeGreaterThanOrEqual(times[i - 1]!);
    const now = 60 * TICK + 310;
    expect(clock.renderTime(now)).toBeCloseTo(now - 310 - DELAY, 0);
  });

  it("ignores one late snapshot and catches up at most a quarter fast when snapshots come sooner", () => {
    const steady = new SnapshotClock(TICK, DELAY);
    const spiked = new SnapshotClock(TICK, DELAY);
    play(steady, 0, 30, () => 50);
    play(spiked, 0, 30, (tick) => (tick === 15 ? 140 : 50));
    expect(spiked.renderTime(3200)).toBe(steady.renderTime(3200));
    // Snapshots now 40 ms sooner: rendering closes the gap within its speed limit.
    const sooner = new SnapshotClock(TICK, DELAY);
    const times = play(sooner, 0, 40, (tick) => (tick < 20 ? 50 : 10));
    const steps = times.map((t, i) => (i === 0 ? 16 : t - times[i - 1]!));
    expect(Math.max(...steps)).toBeLessThanOrEqual(16 * 1.25 + 1e-9);
    expect(sooner.renderTime(40 * TICK + 10)).toBeCloseTo(40 * TICK - DELAY, 0);
  });
});
