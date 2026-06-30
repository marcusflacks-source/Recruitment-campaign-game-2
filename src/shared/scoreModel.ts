/**
 * Shared scoring model — the single source of truth for how a run scores.
 *
 * Imported by BOTH the client engine (to show a live score) and the server
 * validator (to recompute an authoritative score from telemetry). Keeping one
 * implementation is what makes anti-cheat tractable: the server replays the same
 * math and rejects any client score that exceeds what the telemetry can justify.
 *
 * This file is pure and dependency-free (no DOM, no Node) so it runs anywhere.
 */
import type { Rarity } from '@content/catches';
import { RARITY_DIFFICULTY } from '@content/catches';

/** Tunables for the scoring curve. See README "Tuning difficulty". */
export const SCORE_MODEL = {
  /** Combo grows by this per consecutive catch, capped at maxCombo. */
  comboStep: 0.5,
  maxCombo: 5,
  /** Timing bonus ranges from 1.0 (sloppy) to this (perfect cast). */
  maxTimingBonus: 2.0,
  /** A cast below this accuracy cannot land a catch at all. */
  minCastAccuracy: 0.2,
  /** Bite reaction must be hit or the catch is lost (0 points). */
  // (enforced by requiring biteHit === true in scoreCatch)
} as const;

export interface ScoredCatch {
  catchId: string;
  points: number;
  combo: number;
  timingBonus: number;
}

/** Combo multiplier after `streak` consecutive successful catches (1-indexed). */
export function comboMultiplier(streak: number): number {
  if (streak <= 1) return 1;
  return Math.min(SCORE_MODEL.maxCombo, 1 + (streak - 1) * SCORE_MODEL.comboStep);
}

/** Map cast accuracy (0..1) to a timing bonus (1..maxTimingBonus). */
export function timingBonus(castAccuracy: number): number {
  const a = clamp01(castAccuracy);
  return 1 + (SCORE_MODEL.maxTimingBonus - 1) * a;
}

/**
 * Whether a cast of `accuracy` can land a catch of `rarity`.
 * Rarer catches require a tighter (more accurate) cast. This is the rule the
 * server uses to reject telemetry claiming a legendary catch off a lazy cast.
 */
export function canLand(rarity: Rarity, castAccuracy: number): boolean {
  const threshold = Math.max(SCORE_MODEL.minCastAccuracy, RARITY_DIFFICULTY[rarity]);
  return castAccuracy >= threshold;
}

/**
 * Score a single catch. Returns 0 points if the bite was missed or the cast was
 * too loose for the rarity. `baseValue` and `rarity` come from the catch config.
 */
export function scoreCatch(params: {
  baseValue: number;
  rarity: Rarity;
  castAccuracy: number;
  biteHit: boolean;
  /** 1-indexed streak position this catch occupies. */
  streak: number;
}): ScoredCatch {
  const { baseValue, rarity, castAccuracy, biteHit, streak } = params;
  const combo = comboMultiplier(streak);
  const bonus = timingBonus(castAccuracy);

  if (!biteHit || !canLand(rarity, castAccuracy)) {
    return { catchId: '', points: 0, combo, timingBonus: bonus };
  }
  const points = Math.round(baseValue * combo * bonus);
  return { catchId: '', points, combo, timingBonus: bonus };
}

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
