import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Two build modes:
//  - default: a small static dev/host bundle (the reference hub host harness) for local play.
//  - `--mode lib`: an ES module that the betterhomes hub loads as a game module
//    (exposes the GameModule factory from src/index.ts).
export default defineConfig(({ mode }) => {
  const alias = {
    '@hub': resolve(__dirname, 'src/hub'),
    '@game': resolve(__dirname, 'src/game'),
    '@content': resolve(__dirname, 'src/content'),
    '@shared': resolve(__dirname, 'src/shared'),
  };

  if (mode === 'lib') {
    return {
      resolve: { alias },
      build: {
        target: 'es2020',
        lib: {
          entry: resolve(__dirname, 'src/index.ts'),
          formats: ['es'],
          fileName: () => 'cast-for-the-catch.js',
        },
        sourcemap: true,
        // The hub provides shared services via injection — nothing external to bundle.
        rollupOptions: {},
      },
    };
  }

  return {
    resolve: { alias },
    build: {
      target: 'es2020',
      outDir: 'dist-host',
      sourcemap: true,
    },
  };
});
