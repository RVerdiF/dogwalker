import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';

// Terminal lifecycle e2e: the palette spawns a real PTY node on the canvas.
// Run against the built app: `npm run package` then `npm run test:e2e`.
let app: ElectronApplication;

test.afterEach(async () => {
  await app?.close();
});

test('creating a terminal from the palette adds a live terminal node', async () => {
  const args = ['.vite/build/main.js'];
  // GitHub Actions runners run as root in a container; Chromium's SUID
  // sandbox is unavailable there. CI-only flag, never used locally.
  if (process.env.CI) args.push('--no-sandbox');
  app = await electron.launch({ args });
  const page = await app.firstWindow();
  await expect(page.locator('.dw-rail')).toBeVisible({ timeout: 30_000 });

  // Palette → Terminal opens the preset modal; Create spawns the default shell.
  await page.getByRole('button', { name: 'Terminal' }).click();
  await expect(page.getByText('New terminal')).toBeVisible();
  await page.getByRole('button', { name: 'Create terminal' }).click();

  // A real terminal node mounts on the canvas (its xterm body).
  await expect(page.locator('.dw-term-body').first()).toBeVisible({ timeout: 15_000 });
});
