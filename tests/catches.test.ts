import { describe, it, expect } from 'vitest';
import {
  validateCatchConfig,
  CatchConfigError,
  catchConfig,
  findFastTrackCatch,
} from '../src/content/catches';

describe('catch content config', () => {
  it('loads and validates the bundled config', () => {
    expect(catchConfig.catches.length).toBeGreaterThanOrEqual(2);
    expect(catchConfig.gameId).toBe('cast-for-the-catch');
  });

  it('exposes the interview fast-track as the lead-capture trigger', () => {
    const ft = findFastTrackCatch();
    expect(ft).toBeDefined();
    expect(ft?.optionalReward?.triggersLeadCapture).toBe(true);
    // Marketing rule: the rarest catch is the fast-track.
    expect(ft?.rarity).toBe('legendary');
  });

  it('lets marketing add a catch without code changes (schema accepts it)', () => {
    const extended = {
      version: 99,
      gameId: 'cast-for-the-catch',
      catches: [
        ...catchConfig.catches,
        {
          id: 'better-flexibility',
          label: 'better flexibility',
          rarity: 'uncommon',
          baseValue: 150,
          proofFact: 'Work the way that suits your life — results matter, not a clock.',
        },
      ],
    };
    const cfg = validateCatchConfig(extended);
    expect(cfg.catches.find((c) => c.id === 'better-flexibility')).toBeDefined();
  });

  it('rejects malformed content loudly', () => {
    expect(() => validateCatchConfig({ gameId: 'cast-for-the-catch', version: 1, catches: [] })).toThrow(
      CatchConfigError,
    );
    expect(() =>
      validateCatchConfig({
        version: 1,
        gameId: 'cast-for-the-catch',
        catches: [
          { id: 'a', label: 'a', rarity: 'common', baseValue: 1, proofFact: 'x' },
          { id: 'a', label: 'b', rarity: 'common', baseValue: 1, proofFact: 'y' },
        ],
      }),
    ).toThrow(/duplicate/);
  });
});
