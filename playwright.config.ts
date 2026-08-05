import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests drive the real Electron app (broker over its socket, real
 * PTYs, portals) — the behavior the old `DW_*TEST` in-app harnesses covered.
 * Specs live in `e2e/*.spec.ts` and launch the built main bundle, so run a
 * build first: `npm run package` (or `npm start` once) to produce
 * `.vite/build/main.js`. Unit and component tests run on Vitest instead.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
});
