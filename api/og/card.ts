/**
 * Serverless endpoint: GET /api/og/card?score=4200&catch=better%20progression&name=…
 *
 * Server-rendered Open Graph "catch of the day/week" score card. Shared links
 * (built by the hub's OgCardService) point their og:image at this endpoint, so
 * the player's haul, top catch and the betterhomes mark render in the unfurl.
 *
 * Returns SVG — light, cacheable, and renderable to PNG by an upstream image
 * resizer if a platform needs raster. Pure brand tokens, no external assets.
 */
import { palette, fonts } from '../../src/brand/theme';

export interface OgCardParams {
  score: number;
  topCatchLabel: string;
  name?: string;
  challenge?: boolean;
}

/** Pure SVG builder — unit-testable without an HTTP layer. */
export function renderOgCardSvg(p: OgCardParams): string {
  const w = 1200;
  const h = 630;
  const score = Math.max(0, Math.floor(p.score)).toLocaleString();
  const who = p.name ? esc(p.name) : 'A future betterhomes broker';
  const headline = p.challenge ? 'Beat my catch' : 'Catch of the week';
  const catchLabel = esc(p.topCatchLabel);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${palette.mist}"/>
      <stop offset="1" stop-color="${palette.sand}"/>
    </linearGradient>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${palette.powder}"/>
      <stop offset="0.5" stop-color="${palette.denim}"/>
      <stop offset="1" stop-color="${palette.slateDeep}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#sky)"/>
  <rect y="${h * 0.46}" width="${w}" height="${h * 0.54}" fill="url(#sea)"/>
  <text x="72" y="120" font-family="${svgFont(fonts.headline)}" font-size="34" fill="${palette.slate}" letter-spacing="1">betterhomes</text>
  <text x="72" y="168" font-family="${svgFont(fonts.body)}" font-size="22" fill="${palette.denim}">Trust better. Get better.</text>

  <text x="72" y="300" font-family="${svgFont(fonts.headline)}" font-size="40" fill="${palette.slate}">${headline}</text>
  <text x="72" y="430" font-family="${svgFont(fonts.headline)}" font-size="150" font-weight="700" fill="#ffffff">${score}</text>
  <text x="72" y="492" font-family="${svgFont(fonts.body)}" font-size="30" fill="${palette.mist}">${who} · best catch: ${catchLabel}</text>

  <!-- Salmon diamond CTA mark (CTA-only colour) -->
  <g transform="translate(980 470)">
    <rect x="-150" y="-34" width="300" height="68" rx="10" fill="${palette.salmon}" transform="skewX(-8)"/>
    <text x="0" y="10" text-anchor="middle" font-family="${svgFont(fonts.headline)}" font-size="28" fill="#ffffff">Cast for the catch</text>
  </g>
</svg>`;
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const score = Number(url.searchParams.get('score') ?? '0');
  const topCatchLabel = url.searchParams.get('catch') ?? 'a better catch';
  const name = url.searchParams.get('name') ?? undefined;
  const challenge = url.searchParams.get('challenge') === '1';

  const svg = renderOgCardSvg({
    score: Number.isFinite(score) ? score : 0,
    topCatchLabel,
    challenge,
    ...(name ? { name } : {}),
  });

  return new Response(svg, {
    status: 200,
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      // Cache at the edge; cards are deterministic for a given haul.
      'cache-control': 'public, max-age=300, s-maxage=86400',
    },
  });
}

function esc(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`).slice(0, 80);
}

/** SVG font-family wants a plain comma list without the JS quoting. */
function svgFont(stack: string): string {
  return stack.replace(/'/g, '');
}

export const config = { runtime: 'edge' };
