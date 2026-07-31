import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { app } from 'electron';
import { installSkillTo, parseSkillVersion } from './skillInstall';

/**
 * Versioned skill (DW_SKILLVERTEST=1): parse the frontmatter version, install
 * fresh (no upgrade), detect an upgrade when a different version was installed,
 * and no-op when the versions match. Also confirms the shipped skill parses.
 */
export function runSkillVerTest(): void {
  const results: Record<string, unknown> = {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-skillver-'));
  try {
    results.parseVersion =
      parseSkillVersion('---\nname: x\nversion: 7\n---\nbody') === 7 &&
      parseSkillVersion('---\nname: x\n---\n') === 0;

    const src = path.join(dir, 'src.md');
    const destDir = path.join(dir, 'dest');

    // Fresh install: no previous version, not an upgrade.
    fs.writeFileSync(src, '---\nname: dogwalker\nversion: 2\n---\nhello');
    const fresh = installSkillTo(src, destDir);
    results.freshInstall =
      fresh.version === 2 && fresh.previousVersion === null && !fresh.upgraded;
    results.freshWrote =
      fs.readFileSync(path.join(destDir, 'SKILL.md'), 'utf8').includes('hello');

    // Upgrade: dest is v2, ship v3 → upgraded from 2.
    fs.writeFileSync(src, '---\nname: dogwalker\nversion: 3\n---\nnewer');
    const up = installSkillTo(src, destDir);
    results.upgradeDetected =
      up.upgraded && up.previousVersion === 2 && up.version === 3;
    results.upgradeWrote =
      parseSkillVersion(fs.readFileSync(path.join(destDir, 'SKILL.md'), 'utf8')) === 3;

    // Same version reinstall: not an upgrade.
    const same = installSkillTo(src, destDir);
    results.sameNoUpgrade = !same.upgraded && same.previousVersion === 3;

    // The shipped skill parses to a real version.
    const shipped = path.join(app.getAppPath(), 'skills', 'dogwalker', 'SKILL.md');
    results.shippedHasVersion = fs.existsSync(shipped)
      ? parseSkillVersion(fs.readFileSync(shipped, 'utf8')) >= 1
      : false;
  } catch (e) {
    results.threw = (e as Error).message;
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  console.log('SKILLVERTEST RESULT ' + JSON.stringify(results));
}
