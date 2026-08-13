import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';

// Smoke E2E: the real app boots and paints its shell. This is the pattern the
// richer scenarios (broker `ask`/`contract`, Walker teams, floors, portals)
// migrate onto from the old in-app harnesses — each drives the built Electron
// app end to end instead of poking internals.
let app: ElectronApplication;

test.afterEach(async () => {
  await app?.close();
});

test('the app boots and paints its shell', async () => {
  const args = ['.vite/build/main.js'];
  // GitHub Actions runners run as root in a container; Chromium's SUID
  // sandbox is unavailable there. CI-only flag, never used locally.
  if (process.env.CI) args.push('--no-sandbox');
  app = await electron.launch({ args });
  const window = await app.firstWindow();
  await expect(window.locator('.dw-rail')).toBeVisible({ timeout: 30_000 });
});
