/**
 * Hub integration contract.
 *
 * These interfaces describe what the betterhomes recruitment game hub ALREADY
 * provides at /careers/play. A game module conforms to `GameModule` and receives
 * the shared services through `HubContext` at init time. This module never
 * imports concrete implementations of the shared services — it only depends on
 * these contracts — which is how it plugs in without modifying them.
 */

export type Segment = 'new' | 'returning' | 'experienced' | 'relocating';

export type LeaderboardScope = 'global' | 'weekly' | 'office';

/** A player's hub identity. Anonymous until they opt in via lead capture. */
export interface HubIdentity {
  /** Stable anonymous id assigned by the hub (device/profile scoped). */
  anonId: string;
  /** Populated once the player has opted in. */
  profile?: {
    name: string;
    email?: string;
    whatsapp?: string;
    segment: Segment;
    office?: string;
  };
  /** ?code= from a physical-puzzle recipient, linked to their profile. */
  referralCode?: string;
}

/** Opaque run telemetry the server uses to recompute a plausible score. */
export interface RunTelemetry {
  /** Module id — lets the shared service route to the right validator. */
  gameId: string;
  /** Schema version of the telemetry payload. */
  version: number;
  /** Monotonic ms timestamps are NOT trusted; durations are derived server-side. */
  startedAt: number;
  endedAt: number;
  /** Per-catch evidence the server replays through the shared scoring model. */
  events: TelemetryEvent[];
  /** Client-reported score — advisory only; the server recomputes. */
  clientScore: number;
}

export interface TelemetryEvent {
  /** ms since run start. */
  t: number;
  catchId: string;
  /** 0..1 timing accuracy of the cast. */
  castAccuracy: number;
  /** Whether the bite reaction window was hit. */
  biteHit: boolean;
  /** Combo multiplier in effect when this catch landed. */
  combo: number;
}

export interface SubmitScoreInput {
  identity: HubIdentity;
  scopes: LeaderboardScope[];
  office?: string;
  telemetry: RunTelemetry;
  /** Optional head-to-head challenge this run was answering. */
  challengeId?: string;
}

export interface SubmitScoreResult {
  accepted: boolean;
  /** Server-authoritative normalised score actually recorded. */
  recordedScore: number;
  ranks: Partial<Record<LeaderboardScope, number>>;
  /** True if this is the new weekly "catch of the week". */
  catchOfTheWeek: boolean;
  /** Reason when accepted === false (e.g. 'rate_limited', 'implausible'). */
  reason?: string;
}

/** Shared, already-deployed leaderboard service (serverless + managed DB). */
export interface LeaderboardService {
  submit(input: SubmitScoreInput): Promise<SubmitScoreResult>;
  top(scope: LeaderboardScope, opts?: { office?: string; limit?: number }): Promise<LeaderboardEntry[]>;
  /** Daily streak + seasonal reset are owned by the shared service. */
  getStreakBonus(anonId: string): Promise<{ streakDays: number; multiplier: number }>;
}

export interface LeaderboardEntry {
  rank: number;
  displayName: string;
  score: number;
  topCatchLabel?: string;
  office?: string;
}

export interface LeadCaptureInput {
  identity: HubIdentity;
  name: string;
  email?: string;
  whatsapp?: string;
  segment: Segment;
  office?: string;
  consent: boolean;
  source: string;
  referralCode?: string;
  /** Which catch (if any) was claimed — e.g. the interview fast-track. */
  claimedCatchId?: string;
}

export interface LeadCaptureResult {
  ok: boolean;
  /** Identity upgraded with profile, returned for reuse in the session. */
  identity: HubIdentity;
}

/**
 * Shared lead-capture + consent service. On submit it persists the lead and
 * POSTs to the shared CRM webhook (segment tag, source/referral, claimed catch).
 * PDPL/GDPR-aligned storage and data-deletion are owned here.
 */
export interface LeadCaptureService {
  capture(input: LeadCaptureInput): Promise<LeadCaptureResult>;
  /** Easy data deletion (PDPL/GDPR). */
  requestDeletion(anonId: string): Promise<{ ok: boolean }>;
}

/** Shared identity/auth service. */
export interface AuthService {
  getIdentity(): Promise<HubIdentity>;
}

/** Shared analytics sink. Every event is tagged with the audience segment. */
export interface AnalyticsService {
  track(event: AnalyticsEvent): void;
}

export type AnalyticsEventName =
  | 'play_start'
  | 'cast'
  | 'catch_landed'
  | 'play_end'
  | 'score_saved'
  | 'reward_claimed'
  | 'lead_captured'
  | 'share_clicked';

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  gameId: string;
  segment?: Segment | 'anonymous';
  /** Event-specific payload, e.g. { catchId } for catch_landed. */
  props?: Record<string, unknown>;
}

/** Shared Open Graph score-card service (server-rendered share images). */
export interface OgCardService {
  /** Returns a shareable URL whose OG image renders the player's haul. */
  buildShareUrl(input: {
    anonId: string;
    score: number;
    topCatchLabel: string;
    challenge?: boolean;
  }): string;
}

/** Everything the hub injects into a module at init time. */
export interface HubContext {
  /** Mount point owned by the hub; the module renders only inside this. */
  container: HTMLElement;
  identity: HubIdentity;
  leaderboard: LeaderboardService;
  leads: LeadCaptureService;
  auth: AuthService;
  analytics: AnalyticsService;
  og: OgCardService;
  /** Parsed query params from /careers/play (?code=, ?challenge=, ?target=). */
  params: Record<string, string>;
}

/** Reported when a run ends, so the hub can react (e.g. show its own chrome). */
export interface ScoreReport {
  score: number;
  topCatchId?: string;
  topCatchLabel?: string;
  durationMs: number;
}

/**
 * The module interface the hub expects: init, start, onScore, teardown.
 * The hub calls `init(context)`, then `start()`. The module pushes score
 * updates to the callback registered via `onScore`. `teardown()` releases all
 * resources (RAF, listeners, DOM).
 */
export interface GameModule {
  /** Stable module id used in telemetry, analytics and leaderboard routing. */
  readonly id: string;
  init(context: HubContext): Promise<void> | void;
  start(): Promise<void> | void;
  onScore(callback: (report: ScoreReport) => void): void;
  teardown(): void;
}

/** Factory the hub registry imports from the module's entry point. */
export type GameModuleFactory = () => GameModule;
