/**
 * Difficulty ramp. As the player's score rises, the casting meter sweeps faster
 * and the bite reaction window shrinks. All curves are pure functions of score
 * so they are deterministic and easy to tune (see README "Tuning difficulty").
 */
export const DIFFICULTY = {
  /** Casting meter sweep period (ms) for a full bar travel at score 0. */
  baseSweepMs: 1600,
  /** Hardest (fastest) sweep period the ramp approaches. */
  minSweepMs: 650,
  /** Score at which difficulty is ~63% of the way to its hardest. */
  rampScale: 3500,
  /** Bite reaction window (ms) at score 0. */
  baseBiteMs: 900,
  /** Tightest bite window the ramp approaches. */
  minBiteMs: 320,
} as const;

/** Exponential ease from `base` toward `floor` as score grows. */
function ramp(score: number, base: number, floor: number): number {
  const k = 1 - Math.exp(-Math.max(0, score) / DIFFICULTY.rampScale);
  return base - (base - floor) * k;
}

/** Sweep period of the casting meter in ms at the given score. */
export function sweepMsForScore(score: number): number {
  return Math.round(ramp(score, DIFFICULTY.baseSweepMs, DIFFICULTY.minSweepMs));
}

/** Bite reaction window in ms at the given score. */
export function biteWindowMsForScore(score: number): number {
  return Math.round(ramp(score, DIFFICULTY.baseBiteMs, DIFFICULTY.minBiteMs));
}
