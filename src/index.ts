/**
 * Module entry point. The betterhomes hub imports this to register the game.
 *
 *   import castForTheCatch from '@betterhomes/cast-for-the-catch';
 *   hub.register(castForTheCatch);
 *
 * The hub reads the manifest, lazy-creates the module via `create()`, then drives
 * it through init → start → onScore → teardown.
 */
import { registerModule, type GameModuleManifest } from '@hub/registry';
import { CastForTheCatchModule, GAME_ID } from './game/module';

export const manifest: GameModuleManifest = registerModule({
  id: GAME_ID,
  title: 'Cast for the catch',
  blurb: 'Every broker has a ceiling. We know how to break it — fish for your next better.',
  slug: 'cast-for-the-catch',
  orientation: 'portrait',
  create: () => new CastForTheCatchModule(),
  contentConfig: 'src/content/catches.config.json',
});

export default manifest;

// Re-exports for the hub and for server-side validation reuse.
export { CastForTheCatchModule, GAME_ID } from './game/module';
export type { GameModule, GameModuleFactory, HubContext } from '@hub/types';
export { catchConfig, validateCatchConfig } from '@content/catches';
