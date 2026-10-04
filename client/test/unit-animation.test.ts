import { describe, expect, it } from "vitest";
import { Animator, attackRate, FADE_SECONDS, MAX_ATTACK_RATE, MIN_ATTACK_RATE, MOVE_HOLD_MS, moveRate, stillMoving, turnStep, turnToward } from "../src/render/unit-animation";
import type { Clip } from "../src/render/vat-clock";

const TAU = Math.PI * 2;

describe("turnToward", () => {
  it("turns along the shorter arc, across zero", () => {
    expect(turnToward(0.1, TAU - 0.1, 0.05)).toBeCloseTo(0.05);
    expect(turnToward(TAU - 0.1, 0.1, 0.05)).toBeCloseTo(TAU - 0.05);
  });

  it("stops on the target instead of overshooting", () => {
    expect(turnToward(1, 1.02, 0.5)).toBeCloseTo(1.02, 12);
  });

  it("takes about 0.3 s for an about-face", () => {
    let facing = 0;
    let seconds = 0;
    while (Math.abs(facing - Math.PI) > 1e-9 && seconds < 1) {
      facing = turnToward(facing, Math.PI, turnStep(1 / 60));
      seconds += 1 / 60;
    }
    expect(seconds).toBeGreaterThanOrEqual(0.25);
    expect(seconds).toBeLessThanOrEqual(0.35);
  });
});

describe("stillMoving", () => {
  it("keeps the move clip through a short pause and drops it after the hold", () => {
    expect(stillMoving(true, 0, 5000)).toBe(true);
    expect(stillMoving(false, 1000, 1000 + MOVE_HOLD_MS - 1)).toBe(true);
    expect(stillMoving(false, 1000, 1000 + MOVE_HOLD_MS)).toBe(false);
  });
});

describe("clip rates", () => {
  it("plays one swing per attack interval", () => {
    expect(attackRate(1.4, 1.4, 1)).toBeCloseTo(1);
    expect(attackRate(1.4, 1.4, 1.5)).toBeCloseTo(1.5);
    expect(attackRate(1.4, 2.8, 1)).toBeCloseTo(0.5);
  });

  it("clamps the attack rate so very fast or slow attackers stay readable", () => {
    expect(attackRate(1.4, 0.2, 1)).toBe(MAX_ATTACK_RATE);
    expect(attackRate(1.4, 10, 1)).toBe(MIN_ATTACK_RATE);
    expect(attackRate(1.4, 1.4, 0)).toBeCloseTo(1);
  });

  it("matches the move clip to the ground speed", () => {
    expect(moveRate(3.1, 6.2, 0.5)).toBeCloseTo(1);
  });
});

describe("Animator", () => {
  const idle: Clip = { start: 0, end: 29, seconds: 1 };
  const walk: Clip = { start: 30, end: 59, seconds: 1 };

  it("fades out of the previous clip while both keep playing", () => {
    const animator = new Animator();
    animator.play("Idle", idle, { loop: true, rate: 1 });
    animator.advance(0.5);
    animator.play("Move", walk, { loop: true, rate: 1 });
    expect(animator.fadeWeight).toBe(1);
    animator.advance(FADE_SECONDS / 2);
    expect(animator.fadeWeight).toBeCloseTo(0.5);
    expect(animator.fading?.row).toBeCloseTo(15 + (FADE_SECONDS / 2) * 30);
    animator.advance(FADE_SECONDS);
    expect(animator.fading).toBeNull();
    expect(animator.fadeWeight).toBe(0);
  });

  it("switching mid-fade fades out the heavier pose from the weight it has", () => {
    const attack: Clip = { start: 60, end: 89, seconds: 1 };
    const early = new Animator();
    early.play("Idle", idle, { loop: true, rate: 1 });
    early.play("Move", walk, { loop: true, rate: 1 });
    early.advance(FADE_SECONDS * 0.25);
    early.play("Attack", attack, { loop: true, rate: 1 });
    // Idle still weighed 0.75: it keeps fading from there.
    expect(early.fading?.clip).toBe(idle);
    expect(early.fadeWeight).toBeCloseTo(0.75);

    const late = new Animator();
    late.play("Idle", idle, { loop: true, rate: 1 });
    late.play("Move", walk, { loop: true, rate: 1 });
    late.advance(FADE_SECONDS * 0.75);
    late.play("Attack", attack, { loop: true, rate: 1 });
    // Move already weighed 0.75: it becomes the pose fading out, from 0.75.
    expect(late.fading?.clip).toBe(walk);
    expect(late.fadeWeight).toBeCloseTo(0.75);
  });

  it("cuts without a fade, and only retunes the rate for the same clip", () => {
    const animator = new Animator();
    animator.play("Idle", idle, { loop: true, rate: 1 });
    animator.play("Move", walk, { loop: true, rate: 1, cut: true });
    expect(animator.fading).toBeNull();
    animator.advance(0.1);
    animator.play("Move", walk, { loop: true, rate: 2 });
    expect(animator.pose?.row).toBeCloseTo(3);
    animator.advance(0.1);
    expect(animator.pose?.row).toBeCloseTo(9);
  });

  it("reports a one-shot clip done on its last row, and restarts it on request", () => {
    const animator = new Animator();
    animator.play("Cast", idle, { loop: false, rate: 1 });
    animator.advance(2);
    expect(animator.done).toBe(true);
    animator.play("Cast", idle, { loop: false, rate: 1, restart: true });
    expect(animator.done).toBe(false);
  });
});
