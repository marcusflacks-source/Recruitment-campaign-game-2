import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Two build modes:
//  - default: the static dev/host bundle (the reference hub host harness) for
//    local play AND the deployable demo. Output goes to `dist` so Vercel's Vite
//    preset finds it without extra config.
//  - `--mode lib`: an ES module the betterhomes hub loads as a game module
//    (exposes the GameModule factory from src/index.ts). Output: `dist-lib`,
//    kept separate so it never collides with the host build.
export default defineConfig(({ mode }) => {
  if (mode === 'lib') {
    return {
      build: {
        target: 'es2020',
        outDir: 'dist-lib',
        emptyOutDir: true,
        lib: {
          entry: resolve(__dirname, 'src/index.ts'),
          formats: ['es'],
          fileName: () => 'cast-for-the-catch.js',
        },
        sourcemap: true,
        rollupOptions: {},
      },
    };
  }

  return {
    build: {
      target: 'es2020',
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
    },
  };
});
