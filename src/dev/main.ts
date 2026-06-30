/**
 * Dev hub host. Emulates what the betterhomes hub does at /careers/play:
 * builds a HubContext (identity + shared services + params), creates the module
 * via its manifest factory, and drives the lifecycle (init → start). Replaced
 * 1:1 by the real hub in production — no module change required.
 */
import manifest from '../index';
import type { HubContext, HubIdentity, ScoreReport } from '../hub/types';
import { mockAuth, mockAnalytics, mockLeaderboard, mockLeads, mockOg } from './mockServices';

async function boot(): Promise<void> {
  const container = document.getElementById('hub-stage');
  if (!container) throw new Error('missing hub stage');

  const identity: HubIdentity = await mockAuth.getIdentity();

  // Parse /careers/play query params the hub would forward (?code=, ?target=…).
  const params: Record<string, string> = {};
  new URLSearchParams(window.location.search).forEach((v, k) => (params[k] = v));
  if (params.code) identity.referralCode = params.code;

  const context: HubContext = {
    container,
    identity,
    leaderboard: mockLeaderboard,
    leads: mockLeads,
    auth: mockAuth,
    analytics: mockAnalytics,
    og: mockOg,
    params,
  };

  const game = manifest.create();
  game.onScore((report: ScoreReport) => {
    // The hub would surface this in its own chrome; here we just log it.
    if (report.durationMs > 0) {
      // eslint-disable-next-line no-console
      console.info('[hub] run ended', report);
    }
  });
  await game.init(context);
  await game.start();
}

void boot();
