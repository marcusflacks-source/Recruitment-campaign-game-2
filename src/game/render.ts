/**
 * Canvas renderer for cast for the catch. Portrait, mobile-first, warm Sand→Slate
 * coastal tones (not cartoonish). Pure drawing from an EngineView snapshot — no
 * game rules here. Canvas (not Phaser) keeps the bundle tiny for <3s on 4G.
 */
import { palette, fonts } from '../brand/theme';
import type { EngineView } from './engine';

export interface RenderSize {
  width: number;
  height: number;
  dpr: number;
}

export class Renderer {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  draw(view: EngineView, size: RenderSize, tMs: number): void {
    const { ctx } = this;
    const { width: w, height: h } = size;

    this.sky(w, h);
    this.water(w, h, tMs);
    this.hud(view, w);

    if (view.phase === 'casting') this.castMeter(view, w, h);
    if (view.phase === 'reeling') this.line(w, h, tMs, false);
    if (view.phase === 'bite') {
      this.line(w, h, tMs, true);
      this.biteTarget(view, w, h, tMs);
    }
    if (view.phase === 'reveal') this.reveal(view, w, h);
    if (view.phase === 'ready') this.prompt(w, h, 'Tap to cast');
    ctx.restore?.();
  }

  private sky(w: number, h: number): void {
    const { ctx } = this;
    const g = ctx.createLinearGradient(0, 0, 0, h * 0.55);
    g.addColorStop(0, palette.mist);
    g.addColorStop(1, palette.sand);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  private water(w: number, h: number, tMs: number): void {
    const { ctx } = this;
    const top = h * 0.5;
    const g = ctx.createLinearGradient(0, top, 0, h);
    g.addColorStop(0, palette.powder);
    g.addColorStop(0.45, palette.denim);
    g.addColorStop(1, palette.slateDeep);
    ctx.fillStyle = g;
    ctx.fillRect(0, top, w, h - top);

    // Gentle swell lines — warm, restrained, not cartoonish.
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = palette.mist;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const y = top + ((i + 1) / 7) * (h - top);
      const amp = 4 + i;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const yy = y + Math.sin(x / 36 + tMs / 900 + i) * amp * 0.4;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  private hud(view: EngineView, w: number): void {
    const { ctx } = this;
    ctx.fillStyle = palette.slate;
    ctx.textBaseline = 'top';

    ctx.font = `600 28px ${fonts.headline}`;
    ctx.textAlign = 'left';
    ctx.fillText(String(view.score), 18, 16);

    ctx.font = `500 14px ${fonts.body}`;
    ctx.fillText('score', 18, 50);

    // Combo chip.
    if (view.combo > 1) {
      ctx.textAlign = 'center';
      ctx.font = `600 18px ${fonts.headline}`;
      ctx.fillStyle = palette.denim;
      ctx.fillText(`combo ×${view.combo.toFixed(1)}`, w / 2, 18);
    }

    // Timer.
    ctx.textAlign = 'right';
    ctx.fillStyle = palette.slate;
    ctx.font = `600 18px ${fonts.headline}`;
    ctx.fillText(`${Math.ceil(view.timeLeftMs / 1000)}s`, w - 18, 18);
  }

  private castMeter(view: EngineView, w: number, h: number): void {
    const { ctx } = this;
    const barW = Math.min(300, w * 0.74);
    const barH = 18;
    const x = (w - barW) / 2;
    const y = h * 0.78;

    // Track.
    roundRect(ctx, x, y, barW, barH, 9);
    ctx.fillStyle = palette.mist;
    ctx.fill();

    // Sweet-spot zone near the top of the sweep (rewards a strong cast).
    const zoneStart = x + barW * 0.72;
    const zoneW = barW * 0.28;
    ctx.fillStyle = palette.sand;
    ctx.fillRect(zoneStart, y, zoneW, barH);

    // Power fill up to the indicator.
    const px = x + barW * view.meter;
    ctx.fillStyle = palette.denim;
    roundRect(ctx, x, y, px - x, barH, 9);
    ctx.fill();

    // Indicator.
    ctx.fillStyle = palette.slate;
    ctx.fillRect(px - 2, y - 6, 4, barH + 12);

    this.prompt(w, h, 'Tap at full power to cast', y - 44);
  }

  private line(w: number, h: number, tMs: number, taut: boolean): void {
    const { ctx } = this;
    ctx.strokeStyle = taut ? palette.slate : palette.powder;
    ctx.lineWidth = 2;
    const sx = w / 2;
    const wobble = taut ? Math.sin(tMs / 60) * 6 : Math.sin(tMs / 300) * 2;
    ctx.beginPath();
    ctx.moveTo(sx, h * 0.18);
    ctx.quadraticCurveTo(sx + wobble, h * 0.55, sx + wobble, h * 0.66);
    ctx.stroke();
  }

  private biteTarget(view: EngineView, w: number, h: number, tMs: number): void {
    const { ctx } = this;
    const cx = w / 2;
    const cy = h * 0.66;
    const pulse = 1 + Math.sin(tMs / 90) * 0.08;
    const outer = 56 * pulse;
    // Closing ring shows the window shrinking.
    const remaining = 1 - view.biteProgress;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineWidth = 6;
    ctx.strokeStyle = palette.mist;
    ctx.beginPath();
    ctx.arc(0, 0, outer, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = palette.salmon; // reaction urgency — sparing salmon use
    ctx.beginPath();
    ctx.arc(0, 0, outer, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remaining);
    ctx.stroke();
    ctx.restore();

    this.prompt(w, h, 'Tap — it bites!', cy - outer - 38);
  }

  private reveal(view: EngineView, w: number, h: number): void {
    const { ctx } = this;
    if (view.lastCatch) {
      const { def, points } = view.lastCatch;
      ctx.textAlign = 'center';
      ctx.fillStyle = palette.slate;
      ctx.font = `600 26px ${fonts.headline}`;
      ctx.fillText(def.label, w / 2, h * 0.34);

      ctx.fillStyle = palette.denim;
      ctx.font = `600 20px ${fonts.headline}`;
      ctx.fillText(`+${points}`, w / 2, h * 0.4);

      ctx.fillStyle = palette.slate;
      ctx.font = `400 15px ${fonts.body}`;
      wrapText(ctx, def.proofFact, w / 2, h * 0.46, w * 0.78, 21);
    } else if (view.lastMiss) {
      ctx.textAlign = 'center';
      ctx.fillStyle = palette.slate;
      ctx.font = `400 18px ${fonts.body}`;
      const msg =
        view.lastMiss === 'missed-bite'
          ? 'It slipped the hook. Cast again.'
          : view.lastMiss === 'false-start'
            ? 'Too eager — wait for the bite.'
            : 'A loose cast. Aim for full power.';
      ctx.fillText(msg, w / 2, h * 0.4);
    }
  }

  private prompt(w: number, _h: number, text: string, y?: number): void {
    const { ctx } = this;
    ctx.textAlign = 'center';
    ctx.fillStyle = palette.slate;
    ctx.font = `400 16px ${fonts.body}`;
    ctx.fillText(text, w / 2, y ?? _h * 0.88);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, cx, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, cx, yy);
}
