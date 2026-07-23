import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { app } from 'electron';

/**
 * Installs the Dogwalker agent skill so agents actually discover the CLI
 * (ARCHITECTURE.md §5.5). Without this, the shim is on PATH but no agent knows
 * `dogwalker`/`walk` exists or how to use it. Copied on startup (idempotent,
 * overwrites to stay current) into each supported agent's user skills folder.
 *
 * v0.1 targets Claude Code (`~/.claude/skills`). Other agents' skill conventions
 * come with their presets.
 */
export function installSkill(): void {
  const src = path.join(app.getAppPath(), 'skills', 'dogwalker', 'SKILL.md');
  if (!fs.existsSync(src)) return;

  const targets = [path.join(os.homedir(), '.claude', 'skills', 'dogwalker')];
  for (const dir of targets) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(src, path.join(dir, 'SKILL.md'));
    } catch {
      /* best-effort; a missing agent home is not fatal */
    }
  }
}
