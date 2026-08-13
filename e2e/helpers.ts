import { _electron as electron, type ElectronApplication } from '@playwright/test';

/**
 * Shared Electron launch for the e2e specs.
 *
 * CI hardening: GitHub Actions runners execute as root inside a container,
 * where Chromium's SUID sandbox, GPU stack and /dev/shm behave differently
 * from a desktop. `--no-sandbox`, `--disable-gpu` and `--disable-dev-shm-usage`
 * are the standard flags for that environment and are applied only when
 * `process.env.CI` is set — local runs keep the full sandbox.
 */
export async function launchApp(): Promise<ElectronApplication> {
  const args = ['.vite/build/main.js'];
  if (process.env.CI) {
    args.push('--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage');
  }
  const app = await electron.launch({ args });
  // Surface the app process's own output so a boot failure is diagnosable in
  // CI logs instead of a silent firstWindow timeout.
  const proc = app.process();
  proc.stdout?.on('data', (d) => console.log('[electron stdout]', String(d).trimEnd()));
  proc.stderr?.on('data', (d) => console.error('[electron stderr]', String(d).trimEnd()));
  proc.on('exit', (code) => console.error('[electron exit]', code));
  return app;
}
