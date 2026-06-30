/**
 * Local mock implementations of the hub's shared services, FOR DEV ONLY.
 *
 * In production these are provided by the hub (serverless leaderboard, auth,
 * lead-capture, OG card, all backed by the managed DB). The module never imports
 * these mocks — it only depends on the interfaces — so swapping in the real hub
 * services requires no module change. They exist purely so the game is playable
 * standalone via `npm run dev`.
 *
 * The mock leaderboard runs the REAL anti-cheat validator (validateRun) so you
 * can see client-tampered scores get rejected locally, exactly as in production.
 */
import type {
  AnalyticsService,
  AuthService,
  HubIdentity,
  LeaderboardEntry,
  LeaderboardScope,
  LeaderboardService,
  LeadCaptureInput,
  LeadCaptureResult,
  LeadCaptureService,
  OgCardService,
  SubmitScoreInput,
  SubmitScoreResult,
} from '@hub/types';
import { validateRun } from '../../api/_lib/validateRun';

let anonCounter = 1000;

export const mockAuth: AuthService = {
  async getIdentity(): Promise<HubIdentity> {
    return { anonId: `anon-${anonCounter++}` };
  },
};

export const mockAnalytics: AnalyticsService = {
  track(event): void {
    // Mirrors the shape the real sink receives.
    // eslint-disable-next-line no-console
    console.info('[analytics]', event.name, event.segment, event.props ?? {});
  },
};

const board: { score: number; name: string; topCatch?: string }[] = [];

export const mockLeaderboard: LeaderboardService = {
  async submit(input: SubmitScoreInput): Promise<SubmitScoreResult> {
    // Server-authoritative validation — the whole point of anti-cheat.
    const result = validateRun(input.telemetry);
    if (!result.valid) {
      return { accepted: false, recordedScore: 0, ranks: {}, catchOfTheWeek: false, reason: result.reasons[0] };
    }
    const name = input.identity.profile?.name ?? 'Anonymous';
    const entry = { score: result.recordedScore, name, topCatch: undefined as string | undefined };
    board.push(entry);
    board.sort((a, b) => b.score - a.score);
    const rank = board.findIndex((e) => e === entry) + 1;
    const ranks: Partial<Record<LeaderboardScope, number>> = {};
    for (const s of input.scopes) ranks[s] = rank;
    // eslint-disable-next-line no-console
    console.info('[leaderboard] recorded', result.recordedScore, 'tampered:', result.tampered, 'rank:', rank);
    return {
      accepted: true,
      recordedScore: result.recordedScore,
      ranks,
      catchOfTheWeek: rank === 1,
    };
  },
  async top(scope: LeaderboardScope, opts): Promise<LeaderboardEntry[]> {
    void scope;
    return board.slice(0, opts?.limit ?? 10).map((e, i) => ({
      rank: i + 1,
      displayName: e.name,
      score: e.score,
      ...(e.topCatch ? { topCatchLabel: e.topCatch } : {}),
    }));
  },
  async getStreakBonus(): Promise<{ streakDays: number; multiplier: number }> {
    return { streakDays: 1, multiplier: 1 };
  },
};

export const mockLeads: LeadCaptureService = {
  async capture(input: LeadCaptureInput): Promise<LeadCaptureResult> {
    // Emulates the shared service writing the lead AND POSTing the CRM webhook.
    // eslint-disable-next-line no-console
    console.info('[crm-webhook] lead', {
      name: input.name,
      segment: input.segment,
      source: input.source,
      referralCode: input.referralCode,
      claimedCatchId: input.claimedCatchId,
      consent: input.consent,
    });
    const identity: HubIdentity = {
      ...input.identity,
      profile: {
        name: input.name,
        segment: input.segment,
        ...(input.email ? { email: input.email } : {}),
        ...(input.whatsapp ? { whatsapp: input.whatsapp } : {}),
        ...(input.office ? { office: input.office } : {}),
      },
    };
    return { ok: true, identity };
  },
  async requestDeletion(): Promise<{ ok: boolean }> {
    return { ok: true };
  },
};

export const mockOg: OgCardService = {
  buildShareUrl({ score, topCatchLabel, challenge }): string {
    const params = new URLSearchParams({
      score: String(score),
      catch: topCatchLabel,
      ...(challenge ? { challenge: '1' } : {}),
    });
    // Points at the OG card endpoint; the share link itself would be a hub route
    // carrying ?target= so recipients load the head-to-head challenge.
    return `/api/og/card?${params.toString()}`;
  },
};
