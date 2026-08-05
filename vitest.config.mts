import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Unit + component tests run on Vitest (shares the project's Vite pipeline).
 * Two projects: main-process code in a node environment, renderer code in jsdom
 * with Testing Library. End-to-end tests that drive the real Electron app live
 * under `e2e/` and run on Playwright instead (`npm run test:e2e`).
 */
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'main',
          environment: 'node',
          include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'renderer',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/app/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});
