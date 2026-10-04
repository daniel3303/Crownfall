import { describe, expect, it } from "vitest";
import {
  attenuation,
  CombatIntensity,
  crossfadeGains,
  INTENSITY_HALF_LIFE,
  muffleCutoff,
  OFFSCREEN_FLOOR,
  pan,
  viewRadius,
  VoiceLimiter,
  ZOOM_FAR,
  ZOOM_NEAR,
  zoomGain,
} from "../src/audio/mix";
import { SwingClock } from "../src/audio/swings";

const listener = { x: 50, y: 50, zoom: 30 };

describe("positional mixing", () => {
  it("plays sounds on screen at full level", () => {
    expect(attenuation(listener, 50, 50)).toBe(1);
    expect(attenuation(listener, 50 + viewRadius(30) * 0.9, 50)).toBe(1);
  });

  it("rolls off past the view edge but keeps off-screen fights audible", () => {
    const edge = viewRadius(30);
    const near = attenuation(listener, 50 + edge * 1.5, 50);
    const far = attenuation(listener, 50 + edge * 3, 50);
    expect(near).toBeLessThan(1);
    expect(far).toBeLessThan(near);
    expect(attenuation(listener, 5000, 5000)).toBe(OFFSCREEN_FLOOR);
  });

  it("hears farther when zoomed out", () => {
    const point = 50 + viewRadius(ZOOM_NEAR) * 2;
    expect(attenuation({ ...listener, zoom: ZOOM_FAR }, point, 50)).toBeGreaterThan(attenuation({ ...listener, zoom: ZOOM_NEAR }, point, 50));
  });

  it("pans by side and never hard-pans", () => {
    expect(pan(listener, 50)).toBe(0);
    expect(pan(listener, 40)).toBeLessThan(0);
    expect(pan(listener, 60)).toBeGreaterThan(0);
    expect(pan(listener, 5000)).toBeLessThan(1);
    expect(pan(listener, 5000)).toBe(-pan(listener, -4900));
  });

  it("lowers the whole mix as the camera pulls back", () => {
    expect(zoomGain(ZOOM_NEAR)).toBe(1);
    expect(zoomGain(ZOOM_FAR)).toBeLessThan(1);
    expect(zoomGain(ZOOM_FAR * 2)).toBe(zoomGain(ZOOM_FAR));
  });

  it("muffles distant sounds more", () => {
    expect(muffleCutoff(1)).toBeGreaterThan(16000);
    expect(muffleCutoff(0.5)).toBeLessThan(muffleCutoff(0.8));
    expect(muffleCutoff(OFFSCREEN_FLOOR)).toBeLessThan(1500);
  });
});

describe("VoiceLimiter", () => {
  it("caps voices per sound, replacing the weakest only for a louder one", () => {
    const limiter = new VoiceLimiter(10);
    limiter.add({ id: 1, sound: "clash", gain: 0.5, started: 0 });
    limiter.add({ id: 2, sound: "clash", gain: 0.2, started: 0 });
    expect(limiter.admit("clash", 0.1, 2, 0)).toEqual({ admitted: false });
    const louder = limiter.admit("clash", 0.4, 2, 0);
    expect(louder.admitted && louder.evict?.id).toBe(2);
    expect(limiter.admit("death", 0.1, 2, 0)).toEqual({ admitted: true });
  });

  it("caps voices overall", () => {
    const limiter = new VoiceLimiter(2);
    limiter.add({ id: 1, sound: "clash", gain: 0.5, started: 0 });
    limiter.add({ id: 2, sound: "death", gain: 0.6, started: 0 });
    expect(limiter.admit("bow", 0.3, 4, 0)).toEqual({ admitted: false });
    const louder = limiter.admit("bow", 0.55, 4, 0);
    expect(louder.admitted && louder.evict?.id).toBe(1);
  });

  it("lets an old voice yield to a fresh one of the same level", () => {
    const limiter = new VoiceLimiter(10);
    limiter.add({ id: 1, sound: "clash", gain: 0.5, started: 0 });
    const fresh = limiter.admit("clash", 0.5, 1, 2);
    expect(fresh.admitted && fresh.evict?.id).toBe(1);
  });

  it("frees a slot when a voice ends", () => {
    const limiter = new VoiceLimiter(10);
    limiter.add({ id: 1, sound: "clash", gain: 0.5, started: 0 });
    limiter.remove(1);
    expect(limiter.count).toBe(0);
    expect(limiter.admit("clash", 0.1, 1, 0)).toEqual({ admitted: true });
  });
});

describe("CombatIntensity", () => {
  it("halves every half-life once the fighting stops", () => {
    const intensity = new CombatIntensity();
    intensity.add(8, 0);
    expect(intensity.value(INTENSITY_HALF_LIFE)).toBeCloseTo(4, 5);
    expect(intensity.value(2 * INTENSITY_HALF_LIFE)).toBeCloseTo(2, 5);
  });

  it("leans to war as combat builds, approaching but never passing full war", () => {
    const intensity = new CombatIntensity();
    expect(intensity.warMix(0)).toBe(0);
    intensity.add(20, 0);
    const some = intensity.warMix(0);
    intensity.add(200, 0);
    expect(intensity.warMix(0)).toBeGreaterThan(some);
    expect(intensity.warMix(0)).toBeLessThan(1);
  });

  it("forgets everything on reset", () => {
    const intensity = new CombatIntensity();
    intensity.add(20, 1);
    intensity.reset();
    expect(intensity.value(1)).toBe(0);
  });
});

describe("crossfadeGains", () => {
  it("keeps constant power across the crossfade", () => {
    for (const mix of [0, 0.25, 0.5, 0.9, 1]) {
      const { peace, war } = crossfadeGains(mix);
      expect(peace ** 2 + war ** 2).toBeCloseTo(1, 10);
    }
    expect(crossfadeGains(0)).toEqual({ peace: 1, war: 0 });
    expect(crossfadeGains(1).peace).toBeCloseTo(0, 10);
  });
});

describe("SwingClock", () => {
  const noJitter = () => 0;

  it("sounds each melee attacker once per cooldown", () => {
    const clock = new SwingClock();
    const attackers = [{ id: 7, cooldownMs: 1000 }];
    expect(clock.due(attackers, 0, noJitter)).toEqual([]);
    expect(clock.due(attackers, 100, noJitter)).toEqual([7]);
    expect(clock.due(attackers, 900, noJitter)).toEqual([]);
    expect(clock.due(attackers, 1000, noJitter)).toEqual([7]);
  });

  it("restarts the rhythm after a stall instead of firing missed blows", () => {
    const clock = new SwingClock();
    const attackers = [{ id: 7, cooldownMs: 1000 }];
    clock.due(attackers, 0, noJitter);
    expect(clock.due(attackers, 5000, noJitter)).toEqual([7]);
    expect(clock.due(attackers, 5500, noJitter)).toEqual([]);
    expect(clock.due(attackers, 6000, noJitter)).toEqual([7]);
  });

  it("forgets attackers that left their attack stance", () => {
    const clock = new SwingClock();
    clock.due([{ id: 7, cooldownMs: 1000 }], 0, noJitter);
    clock.due([], 100, noJitter);
    expect(clock.due([{ id: 7, cooldownMs: 1000 }], 200, noJitter)).toEqual([]);
  });
});
