/** XP the first level-up costs; each later level costs `LEVEL_STEP` more than the one before. */
const FIRST_LEVEL_XP = 300;
const LEVEL_STEP = 100;

export interface LevelInfo {
  level: number;
  /** XP earned since this level began. */
  into: number;
  /** XP this level needs in all before the next. */
  needed: number;
  /** 0 to 1 toward the next level. */
  progress: number;
}

export function xpToNext(level: number): number {
  return FIRST_LEVEL_XP + LEVEL_STEP * (level - 1);
}

/** Total XP at which a level begins; level 1 begins at 0. */
export function xpAtLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpToNext(l);
  return total;
}

export function levelInfo(totalXp: number): LevelInfo {
  let level = 1;
  let rest = Math.max(0, Math.floor(totalXp));
  while (rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  const needed = xpToNext(level);
  return { level, into: rest, needed, progress: rest / needed };
}
