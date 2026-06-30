/**
 * Server-side score validator for cast for the catch (anti-cheat).
 *
 * This is the per-game validation hook the SHARED leaderboard service calls
 * before recording a score (the service routes by telemetry.gameId). It does not
 * replace or modify the shared service — it only answers "given this run's
 * telemetry, what is the maximum plausible score?" and the shared service
 * records THAT number, never the client-reported one.
 *
 * It replays the run through the exact same scoring model the client used,
 * recomputing the combo streak itself and rejecting physically impossible runs
 * (too many catches for the elapsed time, casts too loose for the rarity landed,
 * a missed bite scored as a catch, etc.). Pure + dependency-free so it runs in
 * any serverless runtime and is unit-testable.
 */
import type { RunTelemetry, TelemetryEvent } from '../../src/hub/types';
import { catchById, type CatchDef } from '../../src/content/catches';
import { scoreCatch, comboMultiplier, canLand, clamp01 } from '../../src/shared/scoreModel';
import { TELEMETRY_VERSION } from '../../src/game/telemetry';

export const RUN_BOUNDS = {
  /** A run is 45–90s; allow a little slack for network/timing jitter. */
  minRunMs: 30_000,
  maxRunMs: 120_000,
  /** Minimum wall-clock for one cast→reel→bite→reveal cycle. Caps catch count. */
  minCycleMs: 1_300,
};

export interface ValidationResult {
  valid: boolean;
  /** Server-authoritative score to record. 0 when invalid. */
  recordedScore: number;
  /** True if the client-reported score exceeded what telemetry justifies. */
  tampered: boolean;
  reasons: string[];
}

export function validateRun(
  telemetry: RunTelemetry,
  lookup: (id: string) => CatchDef | undefined = (id) => catchById.get(id),
): ValidationResult {
  const reasons: string[] = [];
  const fail = (reason: string): ValidationResult => {
    reasons.push(reason);
    return { valid: false, recordedScore: 0, tampered: true, reasons };
  };

  if (telemetry.gameId !== 'cast-for-the-catch') return fail('wrong_game');
  if (telemetry.version !== TELEMETRY_VERSION) return fail('unsupported_telemetry_version');

  const durationMs = telemetry.endedAt - telemetry.startedAt;
  if (!Number.isFinite(durationMs) || durationMs < RUN_BOUNDS.minRunMs || durationMs > RUN_BOUNDS.maxRunMs) {
    return fail('implausible_duration');
  }

  const events = telemetry.events;
  if (!Array.isArray(events)) return fail('no_events');

  // A run can't contain more catch cycles than wall-clock allows.
  const maxCycles = Math.ceil(durationMs / RUN_BOUNDS.minCycleMs) + 1;
  if (events.length > maxCycles) return fail('too_many_events');

  let streak = 0;
  let score = 0;
  let lastT = -1;

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (!isWellFormed(e)) return fail(`malformed_event_${i}`);
    if (e.t < 0 || e.t > durationMs + 1000) return fail(`event_time_oob_${i}`);
    if (e.t < lastT) return fail(`event_time_nonmonotonic_${i}`);
    lastT = e.t;

    const accuracy = clamp01(e.castAccuracy);

    // A miss is any event with no landed catch id.
    if (!e.catchId) {
      streak = 0;
      continue;
    }

    const def = lookup(e.catchId);
    if (!def) return fail(`unknown_catch_${e.catchId}`);

    // Physical rules: the bite must have been hit and the cast tight enough.
    if (!e.biteHit || !canLand(def.rarity, accuracy)) {
      // Claimed a catch the telemetry can't justify — treat the attempt as a miss
      // and flag the run as tampered.
      streak = 0;
      reasons.push(`unearned_catch_${i}`);
      continue;
    }

    const nextStreak = streak + 1;
    const scored = scoreCatch({
      baseValue: def.baseValue,
      rarity: def.rarity,
      castAccuracy: accuracy,
      biteHit: true,
      streak: nextStreak,
    });
    if (scored.points <= 0) {
      streak = 0;
      continue;
    }
    // Cross-check the client-reported combo against the server's own streak.
    const expectedCombo = comboMultiplier(nextStreak);
    if (Number.isFinite(e.combo) && Math.abs(e.combo - expectedCombo) > 0.001) {
      reasons.push(`combo_mismatch_${i}`);
    }
    streak = nextStreak;
    score += scored.points;
  }

  const tampered =
    reasons.length > 0 || telemetry.clientScore > score + scoreTolerance(score);

  // We record the server score regardless; tampering only annotates the result.
  return { valid: true, recordedScore: score, tampered, reasons };
}

/** Allow tiny rounding drift between client and server score. */
function scoreTolerance(score: number): number {
  return Math.max(1, Math.round(score * 0.001));
}

function isWellFormed(e: TelemetryEvent): boolean {
  return (
    e != null &&
    typeof e.t === 'number' &&
    typeof e.catchId === 'string' &&
    typeof e.castAccuracy === 'number' &&
    typeof e.biteHit === 'boolean' &&
    typeof e.combo === 'number'
  );
}
