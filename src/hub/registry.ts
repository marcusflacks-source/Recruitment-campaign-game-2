/**
 * How a module registers with the hub.
 *
 * The hub at /careers/play discovers game modules through a registry. A module
 * package exposes a `GameModuleManifest` (default export of its entry point);
 * the hub reads the manifest, lazy-loads the factory when the player opens the
 * game, then drives it through the `GameModule` lifecycle.
 *
 * This file defines the manifest shape and a tiny `registerModule` helper. It
 * does NOT contain hub internals — the real registry lives in the hub. Defining
 * the shape here lets the module ship a manifest the hub can consume as-is.
 */
import type { GameModuleFactory } from './types';

export interface GameModuleManifest {
  id: string;
  /** Player-facing title. Sentence case. */
  title: string;
  /** One-line pitch shown in the hub's game picker. */
  blurb: string;
  /** Route slug under /careers/play. */
  slug: string;
  /** Portrait, mobile-first. */
  orientation: 'portrait';
  /** Lazy factory — imported only when the player opens this game. */
  create: GameModuleFactory;
  /** Path (relative to package) to the marketing-editable catch config. */
  contentConfig: string;
}

export function registerModule(manifest: GameModuleManifest): GameModuleManifest {
  // Light validation so a misconfigured manifest fails fast at registration,
  // not mid-game. The hub may run the same checks; duplicating them is cheap.
  if (!manifest.id) throw new Error('module manifest missing id');
  if (manifest.orientation !== 'portrait') {
    throw new Error('cast for the catch is portrait, mobile-first');
  }
  if (typeof manifest.create !== 'function') {
    throw new Error('module manifest missing create() factory');
  }
  return manifest;
}
