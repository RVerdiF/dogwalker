import * as fs from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';

/**
 * Materializes the shim directory that gets prepended to every terminal's PATH
 * (ARCHITECTURE.md §3, §5.1). Contains the shim script plus `dogwalker` and
 * `walk` wrappers that invoke it under the system `node`. Because it is only on
 * the PATH of Dogwalker-spawned terminals, the CLI "exists only inside the
 * canvas".
 */
export function createShimDir(): string {
  const dir = path.join(app.getPath('userData'), 'shim');
  fs.mkdirSync(dir, { recursive: true });

  const shimSrc = path.join(app.getAppPath(), 'src', 'shim', 'shim.mjs');
  const shimDest = path.join(dir, 'shim.mjs');
  fs.copyFileSync(shimSrc, shimDest);

  if (process.platform === 'win32') {
    const cmd = `@echo off\r\nnode "${shimDest}" %*\r\n`;
    fs.writeFileSync(path.join(dir, 'dogwalker.cmd'), cmd);
    fs.writeFileSync(path.join(dir, 'walk.cmd'), cmd);
  } else {
    const sh = `#!/bin/sh\nexec node "${shimDest}" "$@"\n`;
    for (const name of ['dogwalker', 'walk']) {
      const p = path.join(dir, name);
      fs.writeFileSync(p, sh);
      fs.chmodSync(p, 0o755);
    }
  }
  return dir;
}
