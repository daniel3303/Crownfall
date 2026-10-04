/** Round axis steps: 1, 2 or 5 times a power of ten. */
export function niceStep(max: number, ticks: number): number {
  if (max <= 0) return 1;
  const raw = max / ticks;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10;
  return Math.max(1, nice * power);
}

/** Y axis ticks from 0 up to and including the first nice value at or above `max`. */
export function yTicks(max: number, ticks = 4): number[] {
  const step = niceStep(max, ticks);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const values: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) values.push(v);
  return values;
}

/** Minute marks for the time axis, every 1, 2, 5, 10 or 15 minutes so about six fit. */
export function minuteTicks(totalSeconds: number): number[] {
  const minutes = totalSeconds / 60;
  const step = [1, 2, 5, 10, 15, 30].find((s) => minutes / s <= 6) ?? 60;
  const values: number[] = [];
  for (let m = 0; m <= minutes + 1e-9; m += step) values.push(m * 60);
  return values;
}

/** Index of the sample nearest to a time, for the hover crosshair. */
export function nearestSample(seconds: number[], at: number): number {
  let best = 0;
  for (let i = 1; i < seconds.length; i++) {
    if (Math.abs(seconds[i]! - at) < Math.abs(seconds[best]! - at)) best = i;
  }
  return best;
}
