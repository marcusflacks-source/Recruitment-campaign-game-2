/**
 * Run telemetry recorder. Captures the minimal evidence the server needs to
 * recompute a plausible score: per-catch accuracy, bite hit, combo, timing.
 * The client score is included but treated as advisory by the server.
 */
import type { RunTelemetry, TelemetryEvent } from '../hub/types';

export const TELEMETRY_VERSION = 1;

export class TelemetryRecorder {
  private readonly events: TelemetryEvent[] = [];
  private readonly startedAt: number;

  constructor(
    private readonly gameId: string,
    now: number,
  ) {
    this.startedAt = now;
  }

  record(now: number, e: Omit<TelemetryEvent, 't'>): void {
    this.events.push({ t: Math.max(0, Math.round(now - this.startedAt)), ...e });
  }

  build(now: number, clientScore: number): RunTelemetry {
    return {
      gameId: this.gameId,
      version: TELEMETRY_VERSION,
      startedAt: this.startedAt,
      endedAt: now,
      events: this.events.slice(),
      clientScore,
    };
  }

  get count(): number {
    return this.events.length;
  }
}
