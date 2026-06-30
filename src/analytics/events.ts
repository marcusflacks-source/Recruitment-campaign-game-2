/**
 * Analytics helper. Wraps the hub's shared AnalyticsService so every event is
 * tagged with the game id and the current audience segment, and so the set of
 * event names is type-checked at every call site.
 *
 * Required events: play_start, cast, catch_landed (with catch id), play_end,
 * score_saved, reward_claimed, lead_captured, share_clicked.
 */
import type { AnalyticsService, AnalyticsEventName, Segment } from '../hub/types';

export class Analytics {
  private segment: Segment | 'anonymous' = 'anonymous';

  constructor(
    private readonly sink: AnalyticsService,
    private readonly gameId: string,
  ) {}

  /** Update the segment once the player opts in; future events carry it. */
  setSegment(segment: Segment): void {
    this.segment = segment;
  }

  track(name: AnalyticsEventName, props?: Record<string, unknown>): void {
    this.sink.track({
      name,
      gameId: this.gameId,
      segment: this.segment,
      ...(props ? { props } : {}),
    });
  }
}
