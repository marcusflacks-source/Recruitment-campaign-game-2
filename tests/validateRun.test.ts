import { describe, it, expect } from 'vitest';
import { validateRun, RUN_BOUNDS } from '../api/_lib/validateRun';
import type { RunTelemetry, TelemetryEvent } from '../src/hub/types';
import { TELEMETRY_VERSION } from '../src/game/telemetry';
import { catchConfig } from '../src/content/catches';

const common = catchConfig.catches.find((c) => c.rarity === 'common')!;
const legendary = catchConfig.catches.find((c) => c.rarity === 'legendary')!;

function telemetry(events: TelemetryEvent[], over?: Partial<RunTelemetry>): RunTelemetry {
  const clientScore = over?.clientScore ?? 0;
  return {
    gameId: 'cast-for-the-catch',
    version: TELEMETRY_VERSION,
    startedAt: 0,
    endedAt: 60_000,
    events,
    clientScore,
    ...over,
  };
}

function landing(t: number, catchId: string, castAccuracy: number, combo = 1): TelemetryEvent {
  return { t, catchId, castAccuracy, biteHit: true, combo };
}

describe('validateRun — anti-cheat', () => {
  it('accepts a clean run and recomputes the server score', () => {
    const events = [
      landing(2000, common.id, 0.9, 1),
      landing(6000, common.id, 0.95, 1.5),
    ];
    const r = validateRun(telemetry(events, { clientScore: 0 }));
    expect(r.valid).toBe(true);
    expect(r.recordedScore).toBeGreaterThan(0);
    // Server score is independent of clientScore.
    expect(r.tampered).toBe(false);
  });

  it('rejects an inflated client score as tampered', () => {
    const events = [landing(2000, common.id, 0.9, 1)];
    const r = validateRun(telemetry(events, { clientScore: 999_999 }));
    // The score is still recorded as the server value, but flagged tampered.
    expect(r.tampered).toBe(true);
    expect(r.recordedScore).toBeLessThan(999_999);
  });

  it('does not award points for a legendary catch off a loose cast', () => {
    // A legendary catch requires a tight cast; 0.1 accuracy cannot land it.
    const events = [landing(2000, legendary.id, 0.1, 1)];
    const r = validateRun(telemetry(events));
    expect(r.recordedScore).toBe(0);
    expect(r.tampered).toBe(true);
    expect(r.reasons.some((x) => x.startsWith('unearned_catch'))).toBe(true);
  });

  it('does not award points when the bite was missed', () => {
    const events: TelemetryEvent[] = [
      { t: 2000, catchId: common.id, castAccuracy: 0.9, biteHit: false, combo: 1 },
    ];
    const r = validateRun(telemetry(events));
    expect(r.recordedScore).toBe(0);
  });

  it('rejects an unknown catch id', () => {
    const events = [landing(2000, 'not-a-real-catch', 0.9)];
    const r = validateRun(telemetry(events));
    expect(r.valid).toBe(false);
    expect(r.reasons).toContain('unknown_catch_not-a-real-catch');
  });

  it('rejects implausible durations', () => {
    const events = [landing(2000, common.id, 0.9)];
    expect(validateRun(telemetry(events, { endedAt: 5_000 })).valid).toBe(false);
    expect(validateRun(telemetry(events, { endedAt: 999_999 })).valid).toBe(false);
  });

  it('rejects more events than wall-clock allows', () => {
    const duration = 60_000;
    const maxCycles = Math.ceil(duration / RUN_BOUNDS.minCycleMs) + 1;
    const events = Array.from({ length: maxCycles + 5 }, (_, i) =>
      landing(Math.min(duration, i * 100), common.id, 0.9),
    );
    const r = validateRun(telemetry(events, { endedAt: duration }));
    expect(r.valid).toBe(false);
    expect(r.reasons).toContain('too_many_events');
  });

  it('rejects non-monotonic event timestamps', () => {
    const events = [landing(6000, common.id, 0.9), landing(2000, common.id, 0.9)];
    const r = validateRun(telemetry(events));
    expect(r.valid).toBe(false);
    expect(r.reasons.some((x) => x.startsWith('event_time_nonmonotonic'))).toBe(true);
  });

  it('rejects the wrong game id', () => {
    const r = validateRun(telemetry([], { gameId: 'some-other-game' as 'cast-for-the-catch' }));
    expect(r.valid).toBe(false);
    expect(r.reasons).toContain('wrong_game');
  });

  it('resets the combo after a miss so streak scoring cannot be forged', () => {
    const win = [
      landing(2000, common.id, 0.95, 1),
      landing(5000, common.id, 0.95, 1.5),
      { t: 8000, catchId: '', castAccuracy: 0.1, biteHit: false, combo: 1 }, // miss
      landing(11000, common.id, 0.95, 999), // client claims huge combo
    ];
    const r = validateRun(telemetry(win));
    // The forged combo on the last catch is flagged.
    expect(r.reasons.some((x) => x.startsWith('combo_mismatch'))).toBe(true);
  });
});
