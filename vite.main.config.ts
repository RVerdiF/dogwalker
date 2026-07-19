import path from 'node:path';
import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      // @xterm/headless 6.0.0 ships a broken "module" field (lib/xterm.mjs
      // does not exist; the real file lives in lib-headless/). Point straight
      // at the shipped ESM build until upstream fixes the package.
      '@xterm/headless': path.resolve(
        __dirname,
        'node_modules/@xterm/headless/lib-headless/xterm-headless.mjs',
      ),
    },
  },
  build: {
    rollupOptions: {
      // node-pty is a native module: resolved from node_modules at runtime,
      // never bundled (forge's auto-unpack-natives handles packaging).
      external: ['node-pty'],
    },
  },
});
