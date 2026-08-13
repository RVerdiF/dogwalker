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
  return electron.launch({ args });
}
