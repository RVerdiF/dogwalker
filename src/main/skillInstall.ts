import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { app } from 'electron';

/**
 * Installs the Dogwalker agent skill so agents discover the CLI
 * (ARCHITECTURE.md §5.5). Without this, the shim is on PATH but no agent knows
 * `dogwalker`/`walk` exists. Copied on startup (idempotent) into each supported
 * agent's user skills folder.
 *
 * The skill is **versioned** (its frontmatter `version:`). On startup we compare
 * the shipped version against whatever is already installed; a change means an
 * agent that started before the upgrade may be running against a stale contract,
 * so the broker logs a mismatch warning before refreshing the file (v0.8).
 */

/** Read `version:` from a skill's frontmatter; 0 if absent/unreadable. */
export function parseSkillVersion(md: string): number {
  const m = /^version:\s*(\d+)/m.exec(md);
  return m ? Number(m[1]) : 0;
}

export interface SkillInstallResult {
  version: number;
  /** The version previously installed, or null if this is a fresh install. */
  previousVersion: number | null;
  /** True when a different version was already installed (a contract change). */
  upgraded: boolean;
}

/** Install `srcPath` into `destDir` (testable with explicit paths). */
export function installSkillTo(srcPath: string, destDir: string): SkillInstallResult {
  const src = fs.readFileSync(srcPath, 'utf8');
  const version = parseSkillVersion(src);
  const destFile = path.join(destDir, 'SKILL.md');
  let previousVersion: number | null = null;
  if (fs.existsSync(destFile)) {
    previousVersion = parseSkillVersion(fs.readFileSync(destFile, 'utf8'));
  }
  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(destFile, src);
  return {
    version,
    previousVersion,
    upgraded: previousVersion !== null && previousVersion !== version,
  };
}

export function installSkill(): void {
  const src = path.join(app.getAppPath(), 'skills', 'dogwalker', 'SKILL.md');
  if (!fs.existsSync(src)) return;
  // v0.1 targets Claude Code; other agents' skill folders arrive with presets.
  const targets = [path.join(os.homedir(), '.claude', 'skills', 'dogwalker')];
  for (const dir of targets) {
    try {
      const res = installSkillTo(src, dir);
      if (res.upgraded) {
        console.log(
          `[dogwalker] skill contract changed v${res.previousVersion} → v${res.version}; ` +
            'agents started before this upgrade should re-read the skill.',
        );
      }
    } catch {
      /* best-effort; a missing agent home is not fatal */
    }
  }
}
