import { describe, it, expect } from 'vitest';
import {
  comboMultiplier,
  timingBonus,
  canLand,
  scoreCatch,
  SCORE_MODEL,
} from '../src/shared/scoreModel';

describe('scoreModel', () => {
  it('grows the combo per streak up to the cap', () => {
    expect(comboMultiplier(1)).toBe(1);
    expect(comboMultiplier(2)).toBe(1 + SCORE_MODEL.comboStep);
    expect(comboMultiplier(100)).toBe(SCORE_MODEL.maxCombo);
  });

  it('maps cast accuracy to a timing bonus between 1 and the max', () => {
    expect(timingBonus(0)).toBe(1);
    expect(timingBonus(1)).toBe(SCORE_MODEL.maxTimingBonus);
    expect(timingBonus(0.5)).toBeCloseTo(1 + (SCORE_MODEL.maxTimingBonus - 1) * 0.5);
  });

  it('gates rarer catches behind tighter casts', () => {
    expect(canLand('common', 0.25)).toBe(true);
    expect(canLand('legendary', 0.25)).toBe(false);
    expect(canLand('legendary', 0.9)).toBe(true);
  });

  it('scores higher for a tighter cast and a longer combo', () => {
    const base = scoreCatch({ baseValue: 100, rarity: 'common', castAccuracy: 0.3, biteHit: true, streak: 1 });
    const better = scoreCatch({ baseValue: 100, rarity: 'common', castAccuracy: 1, biteHit: true, streak: 3 });
    expect(better.points).toBeGreaterThan(base.points);
  });

  it('awards zero when the bite is missed', () => {
    const s = scoreCatch({ baseValue: 100, rarity: 'common', castAccuracy: 1, biteHit: false, streak: 5 });
    expect(s.points).toBe(0);
  });
});
