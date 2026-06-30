/**
 * Catch content loader + schema (TypeScript view of catches.config.json).
 *
 * Marketing edits the JSON; this module validates it at load so a typo fails
 * loudly in dev/CI rather than silently breaking the game. The TypeScript types
 * here are the authoritative runtime contract; catches.schema.json is the
 * editor-facing JSON Schema that mirrors them.
 */
import rawConfig from './catches.config.json';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface CatchReward {
  type: string;
  label: string;
  /** If true, landing this catch opens the shared lead-capture form. */
  triggersLeadCapture: boolean;
  ctaLabel?: string;
}

export interface CatchDef {
  id: string;
  /** The "better" — e.g. "better progression". */
  label: string;
  rarity: Rarity;
  baseValue: number;
  proofFact: string;
  optionalReward?: CatchReward;
}

export interface CatchConfig {
  version: number;
  gameId: 'cast-for-the-catch';
  catches: CatchDef[];
}

/** Relative drop weight per rarity tier. Rarer tiers are less likely. */
export const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 100,
  uncommon: 55,
  rare: 28,
  epic: 12,
  legendary: 3,
};

/** Higher tiers demand a tighter cast to land — used by the engine + validator. */
export const RARITY_DIFFICULTY: Record<Rarity, number> = {
  common: 0,
  uncommon: 0.15,
  rare: 0.3,
  epic: 0.5,
  legendary: 0.72,
};

const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export class CatchConfigError extends Error {}

/** Validate untrusted/edited config. Pure — reused by the dev loader and tests. */
export function validateCatchConfig(input: unknown): CatchConfig {
  if (typeof input !== 'object' || input === null) {
    throw new CatchConfigError('config must be an object');
  }
  const cfg = input as Record<string, unknown>;
  if (cfg.gameId !== 'cast-for-the-catch') {
    throw new CatchConfigError(`unexpected gameId: ${String(cfg.gameId)}`);
  }
  if (typeof cfg.version !== 'number' || cfg.version < 1) {
    throw new CatchConfigError('version must be a positive integer');
  }
  if (!Array.isArray(cfg.catches) || cfg.catches.length < 2) {
    throw new CatchConfigError('catches must have at least 2 entries');
  }

  const ids = new Set<string>();
  const catches: CatchDef[] = cfg.catches.map((c, i) => {
    const where = `catches[${i}]`;
    if (typeof c !== 'object' || c === null) throw new CatchConfigError(`${where} not an object`);
    const o = c as Record<string, unknown>;

    if (typeof o.id !== 'string' || !/^[a-z0-9-]+$/.test(o.id)) {
      throw new CatchConfigError(`${where}.id invalid (lowercase, digits, hyphens)`);
    }
    if (ids.has(o.id)) throw new CatchConfigError(`${where}.id duplicate: ${o.id}`);
    ids.add(o.id);

    if (typeof o.label !== 'string' || o.label.length === 0 || o.label.length > 40) {
      throw new CatchConfigError(`${where}.label must be 1..40 chars`);
    }
    if (o.label === o.label.toUpperCase() && /[A-Z]{4,}/.test(o.label)) {
      throw new CatchConfigError(`${where}.label must be sentence case (no ALL CAPS)`);
    }
    if (typeof o.rarity !== 'string' || !RARITIES.includes(o.rarity as Rarity)) {
      throw new CatchConfigError(`${where}.rarity must be one of ${RARITIES.join(', ')}`);
    }
    if (typeof o.baseValue !== 'number' || o.baseValue < 1 || o.baseValue > 5000) {
      throw new CatchConfigError(`${where}.baseValue must be 1..5000`);
    }
    if (typeof o.proofFact !== 'string' || o.proofFact.length === 0 || o.proofFact.length > 160) {
      throw new CatchConfigError(`${where}.proofFact must be 1..160 chars`);
    }

    let optionalReward: CatchReward | undefined;
    if (o.optionalReward !== undefined) {
      const r = o.optionalReward as Record<string, unknown>;
      if (typeof r.type !== 'string' || typeof r.label !== 'string' || typeof r.triggersLeadCapture !== 'boolean') {
        throw new CatchConfigError(`${where}.optionalReward malformed`);
      }
      optionalReward = {
        type: r.type,
        label: r.label,
        triggersLeadCapture: r.triggersLeadCapture,
        ...(typeof r.ctaLabel === 'string' ? { ctaLabel: r.ctaLabel } : {}),
      };
    }

    return {
      id: o.id,
      label: o.label,
      rarity: o.rarity as Rarity,
      baseValue: o.baseValue,
      proofFact: o.proofFact,
      ...(optionalReward ? { optionalReward } : {}),
    };
  });

  return { version: cfg.version, gameId: 'cast-for-the-catch', catches };
}

/** The validated, in-app catch config (built from the bundled JSON). */
export const catchConfig: CatchConfig = validateCatchConfig(rawConfig);

/** Lookup map by id (telemetry/analytics joins). */
export const catchById: Map<string, CatchDef> = new Map(
  catchConfig.catches.map((c) => [c.id, c]),
);

/** The rarest catch is the lead-capture trigger ("an interview fast-track"). */
export function findFastTrackCatch(cfg: CatchConfig = catchConfig): CatchDef | undefined {
  return cfg.catches.find((c) => c.optionalReward?.triggersLeadCapture);
}
