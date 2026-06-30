/**
 * Weighted catch selection. The cast's accuracy gates which rarities are even
 * reachable (a sloppy cast can only land common fish); among reachable rarities
 * we draw by rarity weight. This is what makes a perfect cast yield a rarer
 * "better".
 */
import {
  catchConfig,
  RARITY_WEIGHT,
  RARITY_DIFFICULTY,
  type CatchDef,
  type Rarity,
} from '@content/catches';

const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/** Highest rarity tier reachable for a given cast accuracy (0..1). */
export function maxRarityForAccuracy(accuracy: number): Rarity {
  let best: Rarity = 'common';
  for (const r of RARITY_ORDER) {
    if (accuracy >= RARITY_DIFFICULTY[r]) best = r;
  }
  return best;
}

/**
 * Pick a catch for a cast of `accuracy`, drawing `rand` in [0,1).
 * Only catches at or below the reachable rarity are eligible; among those,
 * selection is weighted toward commoner tiers, so rarer betters stay special.
 */
export function pickCatch(accuracy: number, rand: number): CatchDef {
  const cap = maxRarityForAccuracy(accuracy);
  const capIdx = RARITY_ORDER.indexOf(cap);
  const eligible = catchConfig.catches.filter(
    (c) => RARITY_ORDER.indexOf(c.rarity) <= capIdx,
  );
  // A great cast biases toward the top of its reachable range.
  const weighted = eligible.map((c) => {
    const tierIdx = RARITY_ORDER.indexOf(c.rarity);
    // Closeness of this tier to the cap, rewarded when the cast is strong.
    const proximity = 1 + (capIdx > 0 ? (tierIdx / capIdx) * accuracy : 0);
    return { c, w: RARITY_WEIGHT[c.rarity] * proximity };
  });

  const total = weighted.reduce((s, x) => s + x.w, 0);
  let roll = rand * total;
  for (const { c, w } of weighted) {
    roll -= w;
    if (roll <= 0) return c;
  }
  return eligible[eligible.length - 1] ?? catchConfig.catches[0];
}
