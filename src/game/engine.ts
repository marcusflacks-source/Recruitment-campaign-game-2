/**
 * Core game logic for "cast for the catch" — a skill-and-timing fishing loop.
 *
 * Loop:
 *   1. CASTING  — a power/aim meter sweeps 0→1→0; tap to cast. Tap value = accuracy.
 *   2. REELING  — short delay while the line is out; tapping now is a false start.
 *   3. BITE     — a reaction prompt opens for `biteWindowMs`; tap to lock the catch.
 *   4. REVEAL   — the landed "better" + its proof fact are shown.
 * Consecutive landed catches build a combo multiplier; any miss resets it.
 *
 * Rendering is intentionally NOT here. The engine exposes an immutable `view()`
 * snapshot the renderer reads each frame, and an `update(now)` the host calls
 * from requestAnimationFrame. This keeps the rules unit-testable headlessly.
 */
import type { CatchDef } from '../content/catches';
import { findFastTrackCatch } from '../content/catches';
import { scoreCatch, comboMultiplier } from '../shared/scoreModel';
import { sweepMsForScore, biteWindowMsForScore } from './difficulty';
import { pickCatch } from './catchPool';
import { TelemetryRecorder } from './telemetry';

export type Phase = 'ready' | 'casting' | 'reeling' | 'bite' | 'reveal' | 'ended';

export interface EngineCallbacks {
  onScoreChange?(score: number, combo: number): void;
  onCatchLanded?(c: CatchDef, points: number, isFastTrack: boolean): void;
  onMiss?(reason: 'loose-cast' | 'false-start' | 'missed-bite'): void;
  onPlayEnd?(summary: RunSummary): void;
}

export interface RunSummary {
  score: number;
  catches: number;
  topCatch?: CatchDef;
  durationMs: number;
}

export interface EngineOptions {
  gameId: string;
  /** Total run length in ms (spec: 45–90s). */
  runMs?: number;
  /** Injected for determinism in tests; defaults to Math.random. */
  random?: () => number;
  callbacks?: EngineCallbacks;
}

export interface EngineView {
  phase: Phase;
  /** Casting meter position 0..1 (triangle sweep). */
  meter: number;
  /** Bite prompt progress 0..1 (1 = window about to close). */
  biteProgress: number;
  score: number;
  combo: number;
  streak: number;
  /** ms remaining in the run. */
  timeLeftMs: number;
  catches: number;
  lastCatch?: { def: CatchDef; points: number };
  lastMiss?: string;
}

const REEL_MIN_MS = 350;
const REEL_MAX_MS = 1050;
const REVEAL_MS = 1150;
const READY_MS = 700;
const DEFAULT_RUN_MS = 75_000;

export class GameEngine {
  private readonly runMs: number;
  private readonly random: () => number;
  private readonly cb: EngineCallbacks;
  private readonly gameId: string;
  private recorder: TelemetryRecorder;
  private readonly fastTrackId = findFastTrackCatch()?.id;

  private phase: Phase = 'ready';
  private startedAt = 0;
  private now = 0;
  private phaseEndsAt = 0;

  private score = 0;
  private streak = 0;
  private catches = 0;
  private topCatch?: CatchDef;
  private lastCatch?: { def: CatchDef; points: number };
  private lastMiss?: string;

  // Per-cast working state.
  private pendingAccuracy = 0;
  private biteOpensAt = 0;
  private biteClosesAt = 0;

  constructor(opts: EngineOptions) {
    this.runMs = opts.runMs ?? DEFAULT_RUN_MS;
    this.random = opts.random ?? Math.random;
    this.cb = opts.callbacks ?? {};
    this.gameId = opts.gameId;
    this.recorder = new TelemetryRecorder(this.gameId, 0);
  }

  /** Begin the run. `now` is a monotonic ms clock (performance.now()). */
  begin(now: number): void {
    this.startedAt = now;
    this.now = now;
    this.recorder = new TelemetryRecorder(this.gameId, now);
    this.enter('ready', now, READY_MS);
  }

  /** Advance timers. Call once per animation frame. */
  update(now: number): void {
    if (this.phase === 'ended') return;
    this.now = now;

    if (now - this.startedAt >= this.runMs) {
      this.end();
      return;
    }

    switch (this.phase) {
      case 'ready':
        if (now >= this.phaseEndsAt) this.enter('casting', now);
        break;
      case 'reeling':
        if (now >= this.biteOpensAt) this.enter('bite', now);
        break;
      case 'bite':
        if (now >= this.biteClosesAt) this.miss('missed-bite');
        break;
      case 'reveal':
        if (now >= this.phaseEndsAt) this.enter('casting', now);
        break;
      default:
        break;
    }
  }

  /** Player input (pointerdown / key). Behaviour depends on the phase. */
  tap(now: number): void {
    this.now = now;
    switch (this.phase) {
      case 'casting': {
        this.pendingAccuracy = this.meterValue(now);
        const reel = REEL_MIN_MS + this.random() * (REEL_MAX_MS - REEL_MIN_MS);
        this.biteOpensAt = now + reel;
        this.biteClosesAt = this.biteOpensAt + biteWindowMsForScore(this.score);
        this.enter('reeling', now);
        return;
      }
      case 'reeling':
        // Tapped before the fish bit — false start.
        this.miss('false-start');
        return;
      case 'bite':
        this.land(now);
        return;
      default:
        return;
    }
  }

  /** Immutable snapshot for the renderer. */
  view(): EngineView {
    const v: EngineView = {
      phase: this.phase,
      meter: this.phase === 'casting' ? this.meterValue(this.now) : 0,
      biteProgress: this.biteProgressValue(this.now),
      score: this.score,
      combo: comboMultiplier(this.streak),
      streak: this.streak,
      timeLeftMs: Math.max(0, this.runMs - (this.now - this.startedAt)),
      catches: this.catches,
    };
    if (this.lastCatch) v.lastCatch = this.lastCatch;
    if (this.lastMiss) v.lastMiss = this.lastMiss;
    return v;
  }

  /** Build the telemetry payload for server-side validation. */
  buildTelemetry(): ReturnType<TelemetryRecorder['build']> {
    return this.recorder.build(this.now, this.score);
  }

  isEnded(): boolean {
    return this.phase === 'ended';
  }

  // --- internals -----------------------------------------------------------

  private enter(phase: Phase, now: number, durationMs?: number): void {
    this.phase = phase;
    if (durationMs !== undefined) this.phaseEndsAt = now + durationMs;
  }

  /** Triangle-wave meter in [0,1], period from the difficulty ramp. */
  private meterValue(now: number): number {
    const period = sweepMsForScore(this.score);
    const phase = ((now - this.startedAt) % period) / period; // 0..1
    return phase < 0.5 ? phase * 2 : 2 - phase * 2; // up then down
  }

  private biteProgressValue(now: number): number {
    if (this.phase !== 'bite') return 0;
    const span = this.biteClosesAt - this.biteOpensAt;
    if (span <= 0) return 1;
    return Math.min(1, Math.max(0, (now - this.biteOpensAt) / span));
  }

  private land(now: number): void {
    const def = pickCatch(this.pendingAccuracy, this.random());
    const nextStreak = this.streak + 1;
    const scored = scoreCatch({
      baseValue: def.baseValue,
      rarity: def.rarity,
      castAccuracy: this.pendingAccuracy,
      biteHit: true,
      streak: nextStreak,
    });

    if (scored.points <= 0) {
      // Cast was too loose for what bit — it slips the hook.
      this.miss('loose-cast');
      return;
    }

    this.streak = nextStreak;
    this.score += scored.points;
    this.catches += 1;
    this.lastCatch = { def, points: scored.points };
    this.lastMiss = undefined;
    if (!this.topCatch || def.baseValue > this.topCatch.baseValue) this.topCatch = def;

    this.recorder.record(now, {
      catchId: def.id,
      castAccuracy: round3(this.pendingAccuracy),
      biteHit: true,
      combo: scored.combo,
    });

    const isFastTrack = def.id === this.fastTrackId;
    this.cb.onCatchLanded?.(def, scored.points, isFastTrack);
    this.cb.onScoreChange?.(this.score, scored.combo);
    this.enter('reveal', now, REVEAL_MS);
  }

  private miss(reason: 'loose-cast' | 'false-start' | 'missed-bite'): void {
    this.streak = 0;
    this.lastMiss = reason;
    this.lastCatch = undefined;
    // Record the missed attempt so the server sees the full attempt history.
    this.recorder.record(this.now, {
      catchId: '',
      castAccuracy: round3(this.pendingAccuracy),
      biteHit: reason === 'loose-cast',
      combo: 1,
    });
    this.cb.onMiss?.(reason);
    this.cb.onScoreChange?.(this.score, 1);
    this.enter('reveal', this.now, REVEAL_MS);
  }

  private end(): void {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    const summary: RunSummary = {
      score: this.score,
      catches: this.catches,
      durationMs: Math.round(this.now - this.startedAt),
    };
    if (this.topCatch) summary.topCatch = this.topCatch;
    this.cb.onPlayEnd?.(summary);
  }
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
