/**
 * betterhomes brand tokens — campaign: "Trust better. Get better."
 *
 * Brand name is always lowercase "betterhomes".
 * Palette is warm Sand/Slate coastal, not cartoonish. Salmon is reserved for
 * CTA buttons only (rendered as diamonds).
 */
export const palette = {
  slate: '#1F343F',
  denim: '#2C537A',
  powder: '#7BA0B2',
  sand: '#D9B9A0',
  mist: '#EDE8E4',
  /** CTA only — diamond buttons. Never for large fills. */
  salmon: '#FF787A',
  // Derived tonal steps used for water/coast gradients (warm Sand→Slate range).
  slateDeep: '#15242C',
  denimDeep: '#1E3C59',
  sandLight: '#E7D2C1',
} as const;

export const fonts = {
  /** Headlines — Georgia/Ivy Mode. */
  headline: "'Ivy Mode', Georgia, 'Times New Roman', serif",
  /** Body — Segoe UI/Ivy Epic. */
  body: "'Ivy Epic', 'Segoe UI', system-ui, -apple-system, sans-serif",
} as const;

/**
 * Copy rules enforced across the module: sentence case, no ALL CAPS body copy,
 * no exclamation-heavy copy. Tone: intelligent, witty, confident.
 */
export const copy = {
  brand: 'betterhomes',
  campaign: 'Trust better. Get better.',
  tagline: 'Every broker has a ceiling. We know how to break it.',
} as const;

export type Palette = typeof palette;
