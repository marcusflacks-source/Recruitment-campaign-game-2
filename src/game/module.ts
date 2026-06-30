/**
 * CastForTheCatchModule — the hub game module.
 *
 * Implements the hub's GameModule contract (init, start, onScore, teardown).
 * Owns the canvas, the engine, the DOM overlays and the wiring to the shared
 * services injected via HubContext. It never imports concrete shared services —
 * only the interfaces — so it plugs into the hub without modifying anything.
 */
import type {
  GameModule,
  HubContext,
  HubIdentity,
  ScoreReport,
  SubmitScoreResult,
} from '@hub/types';
import type { CatchDef } from '@content/catches';
import { findFastTrackCatch } from '@content/catches';
import { Analytics } from '../analytics/events';
import { GameEngine, type RunSummary } from './engine';
import { Renderer, type RenderSize } from './render';
import { openLeadForm, toCaptureInput, type LeadFormResult } from './ui/leadForm';
import { renderEndScreen, type EndScreenModel } from './ui/endScreen';

export const GAME_ID = 'cast-for-the-catch';

export class CastForTheCatchModule implements GameModule {
  readonly id = GAME_ID;

  private ctx!: HubContext;
  private analytics!: Analytics;
  private identity!: HubIdentity;

  private canvas?: HTMLCanvasElement;
  private renderer?: Renderer;
  private engine?: GameEngine;

  private rafId = 0;
  private size: RenderSize = { width: 360, height: 640, dpr: 1 };
  private scoreCb?: (report: ScoreReport) => void;
  private cleanups: Array<() => void> = [];

  // Pause bookkeeping so the run clock freezes while a form/overlay is open.
  private paused = false;
  private pauseStartedAt = 0;
  private pauseOffset = 0;

  private lastSummary?: RunSummary;
  private challengeTarget?: number;
  private claimedFastTrack = false;
  private lastFormResult?: LeadFormResult;

  init(context: HubContext): void {
    this.ctx = context;
    this.identity = context.identity;
    this.analytics = new Analytics(context.analytics, GAME_ID);

    if (this.identity.profile?.segment) this.analytics.setSegment(this.identity.profile.segment);

    const target = context.params.target ?? context.params.beat;
    if (target && /^\d+$/.test(target)) this.challengeTarget = Number(target);

    // Build the canvas mount.
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, {
      display: 'block',
      width: '100%',
      height: '100%',
      touchAction: 'none',
    });
    context.container.style.position = 'relative';
    context.container.appendChild(canvas);
    this.canvas = canvas;

    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) throw new Error('cast for the catch: 2D canvas unsupported');
    this.renderer = new Renderer(ctx2d);

    this.resize();
    const onResize = (): void => this.resize();
    window.addEventListener('resize', onResize);
    this.cleanups.push(() => window.removeEventListener('resize', onResize));

    const onPointer = (e: PointerEvent): void => {
      e.preventDefault();
      if (!this.paused) this.engine?.tap(this.clock());
    };
    canvas.addEventListener('pointerdown', onPointer);
    this.cleanups.push(() => canvas.removeEventListener('pointerdown', onPointer));
  }

  start(): void {
    this.claimedFastTrack = false;
    this.pauseOffset = 0;
    this.analytics.track('play_start', { challenge: this.challengeTarget ?? null });

    this.engine = new GameEngine({
      gameId: GAME_ID,
      callbacks: {
        onScoreChange: (score, combo) => {
          this.scoreCb?.({ score, durationMs: 0 });
          void combo;
        },
        onCatchLanded: (def, points, isFastTrack) => this.handleCatch(def, points, isFastTrack),
        onPlayEnd: (summary) => this.handleEnd(summary),
      },
    });

    const startNow = this.clock();
    this.engine.begin(startNow);
    this.loop();
  }

  onScore(callback: (report: ScoreReport) => void): void {
    this.scoreCb = callback;
  }

  teardown(): void {
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    for (const fn of this.cleanups.splice(0)) fn();
    this.canvas?.remove();
    this.canvas = undefined;
    this.engine = undefined;
    this.renderer = undefined;
  }

  // --- run loop ---------------------------------------------------------------

  private loop = (): void => {
    if (!this.engine || !this.renderer) return;
    const now = this.clock();
    if (!this.paused) this.engine.update(now);
    this.renderer.draw(this.engine.view(), this.size, now);
    if (!this.engine.isEnded()) {
      this.rafId = requestAnimationFrame(this.loop);
    }
  };

  /** Monotonic clock with paused time subtracted out. */
  private clock(): number {
    return performance.now() - this.pauseOffset;
  }

  private pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.pauseStartedAt = performance.now();
    cancelAnimationFrame(this.rafId);
  }

  private resume(): void {
    if (!this.paused) return;
    this.pauseOffset += performance.now() - this.pauseStartedAt;
    this.paused = false;
    if (this.engine && !this.engine.isEnded()) this.loop();
  }

  // --- catch / fast-track -----------------------------------------------------

  private handleCatch(def: CatchDef, points: number, isFastTrack: boolean): void {
    this.analytics.track('catch_landed', { catchId: def.id, points, rarity: def.rarity });

    if (isFastTrack && !this.claimedFastTrack) {
      this.claimedFastTrack = true;
      this.pause();
      const reward = def.optionalReward;
      openLeadForm(this.ctx.container, {
        identity: this.identity,
        heading: reward?.label ?? 'Interview fast-track',
        subheading: 'You hooked the rarest catch. Claim your fast-track and we’ll be in touch.',
        ctaLabel: reward?.ctaLabel ?? 'Claim your fast-track',
        ...(this.lastFormResult ? { prefill: this.lastFormResult } : {}),
        onSubmit: (result) => {
          void this.submitLead(result, def.id, /* alsoSaveScore */ true).then(() => this.resume());
        },
        onCancel: () => this.resume(),
      });
    }
  }

  // --- end of run -------------------------------------------------------------

  private handleEnd(summary: RunSummary): void {
    cancelAnimationFrame(this.rafId);
    this.lastSummary = summary;
    this.analytics.track('play_end', {
      score: summary.score,
      catches: summary.catches,
      topCatchId: summary.topCatch?.id ?? null,
    });
    this.scoreCb?.({
      score: summary.score,
      durationMs: summary.durationMs,
      ...(summary.topCatch ? { topCatchId: summary.topCatch.id, topCatchLabel: summary.topCatch.label } : {}),
    });
    this.showEndScreen({ saved: false });
  }

  private showEndScreen(state: { saved: boolean; result?: SubmitScoreResult }): void {
    const summary = this.lastSummary;
    if (!summary) return;
    const model: EndScreenModel = {
      score: summary.score,
      catches: summary.catches,
      saved: state.saved,
      ...(summary.topCatch ? { topCatch: summary.topCatch } : {}),
      ...(this.challengeTarget !== undefined ? { challengeTarget: this.challengeTarget } : {}),
      ...(state.result?.ranks.weekly !== undefined ? { rank: state.result.ranks.weekly } : {}),
      ...(state.result?.catchOfTheWeek ? { catchOfTheWeek: true } : {}),
    };

    const close = renderEndScreen(this.ctx.container, model, {
      onSave: () => this.openSaveForm(),
      onShare: () => this.share(),
      onPlayAgain: () => {
        close();
        this.start();
      },
    });
    this.cleanups.push(close);
  }

  private openSaveForm(): void {
    openLeadForm(this.ctx.container, {
      identity: this.identity,
      heading: 'Save your score',
      subheading: 'Opt in to claim your spot on the weekly leaderboard.',
      ctaLabel: 'Save and opt in',
      ...(this.lastFormResult ? { prefill: this.lastFormResult } : {}),
      onSubmit: (result) => {
        void this.submitLead(result, undefined, true);
      },
      onCancel: () => {
        /* leave the end screen as-is */
      },
    });
  }

  /**
   * Capture the lead via the shared service, then (optionally) submit the score
   * to the shared leaderboard with server-validated telemetry. Order matters:
   * the lead is the point of the build, so it is written first.
   */
  private async submitLead(
    form: LeadFormResult,
    claimedCatchId: string | undefined,
    alsoSaveScore: boolean,
  ): Promise<void> {
    this.lastFormResult = form;
    this.analytics.setSegment(form.segment);

    const captureInput = toCaptureInput(this.identity, form, {
      source: this.ctx.params.code ? `puzzle:${this.ctx.params.code}` : `play:${GAME_ID}`,
      ...(this.identity.referralCode ? { referralCode: this.identity.referralCode } : {}),
      ...(this.ctx.params.code ? { referralCode: this.ctx.params.code } : {}),
      ...(claimedCatchId ? { claimedCatchId } : {}),
    });

    const captured = await this.ctx.leads.capture(captureInput);
    if (captured.ok) {
      this.identity = captured.identity;
      this.analytics.track('lead_captured', { segment: form.segment, claimedCatchId: claimedCatchId ?? null });
      if (claimedCatchId === findFastTrackCatch()?.id) {
        this.analytics.track('reward_claimed', { reward: 'interview-fast-track' });
      }
    }

    if (alsoSaveScore && this.engine) {
      const result = await this.ctx.leaderboard.submit({
        identity: this.identity,
        scopes: this.identity.profile?.office ? ['global', 'weekly', 'office'] : ['global', 'weekly'],
        telemetry: this.engine.buildTelemetry(),
        ...(this.identity.profile?.office ? { office: this.identity.profile.office } : {}),
        ...(this.ctx.params.challenge ? { challengeId: this.ctx.params.challenge } : {}),
      });
      if (result.accepted) {
        this.analytics.track('score_saved', { rank: result.ranks.weekly ?? null, score: result.recordedScore });
      }
      this.refreshEndScreen({ saved: result.accepted, result });
    }
  }

  private refreshEndScreen(state: { saved: boolean; result?: SubmitScoreResult }): void {
    // Remove the previous end screen (last cleanup) and re-render with saved state.
    const close = this.cleanups.pop();
    close?.();
    this.showEndScreen(state);
  }

  private share(): void {
    const summary = this.lastSummary;
    if (!summary) return;
    const url = this.ctx.og.buildShareUrl({
      anonId: this.identity.anonId,
      score: summary.score,
      topCatchLabel: summary.topCatch?.label ?? 'a better catch',
      challenge: true,
    });
    this.analytics.track('share_clicked', { score: summary.score });

    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (typeof nav.share === 'function') {
      void nav.share({
        title: 'cast for the catch · betterhomes',
        text: `I landed ${summary.score.toLocaleString()} on cast for the catch. Beat me.`,
        url,
      });
    } else if (navigator.clipboard) {
      void navigator.clipboard.writeText(url);
    }
  }

  // --- sizing -----------------------------------------------------------------

  private resize(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width || 360));
    const height = Math.max(1, Math.round(rect.height || 640));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const c = canvas.getContext('2d');
    if (c) c.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.size = { width, height, dpr };
  }
}
