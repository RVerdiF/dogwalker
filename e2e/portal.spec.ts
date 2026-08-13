import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';

// Agent-created portal e2e: a terminal running `dogwalker portal new <url>` over
// the real broker materializes a portal (WebContentsView) as a canvas node.
// Run against the built app: `npm run package` then `npm run test:e2e`.
//
// The deeper portal CLI verbs (navigate/dom/type/click/js/screenshot) and linked
// sessions are covered by the portalCliTest Electron integration, since driving
// them needs CDP + reading terminal output (WebGL) that doesn't map to UI e2e.
let app: ElectronApplication;

test.afterEach(async () => {
  await app?.close();
});

test('a terminal can create a portal over the CLI', async () => {
  const args = ['.vite/build/main.js'];
  // GitHub Actions runners run as root in a container; Chromium's SUID
  // sandbox is unavailable there. CI-only flag, never used locally.
  if (process.env.CI) args.push('--no-sandbox');
  app = await electron.launch({ args });
  const page = await app.firstWindow();
  await expect(page.locator('.dw-rail')).toBeVisible({ timeout: 30_000 });

  // Spawn a plain shell terminal from the palette.
  await page.getByRole('button', { name: 'Terminal' }).click();
  await page.getByRole('button', { name: 'Create terminal' }).click();
  const term = page.locator('.dw-term-body').first();
  await expect(term).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(3000); // let the shell finish initializing

  // Drive the real `dogwalker` shim inside the terminal to create a portal.
  await term.click();
  await page.keyboard.type('dogwalker portal new "data:text/html,<h1>hi</h1>"');
  await page.keyboard.press('Enter');

  // The agent-created portal reconciles onto the canvas as a portal node.
  await expect(page.locator('.dw-portal').first()).toBeVisible({ timeout: 20_000 });
});
