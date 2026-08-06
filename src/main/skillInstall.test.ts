import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseSkillVersion, installSkillTo } from './skillInstall';

describe('parseSkillVersion', () => {
  it('reads the version from frontmatter', () => {
    expect(parseSkillVersion('---\nname: dogwalker\nversion: 5\n---\n')).toBe(5);
  });

  it('defaults to 0 when there is no version line', () => {
    expect(parseSkillVersion('no frontmatter here')).toBe(0);
  });
});

describe('installSkillTo', () => {
  let dir: string;
  let src: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-skill-'));
    src = path.join(dir, 'SKILL.md');
    fs.writeFileSync(src, '---\nversion: 2\n---\nbody');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('installs fresh (no previous version) and copies the file', () => {
    const dest = path.join(dir, 'dest');
    const res = installSkillTo(src, dest);
    expect(res).toEqual({ version: 2, previousVersion: null, upgraded: false });
    expect(fs.readFileSync(path.join(dest, 'SKILL.md'), 'utf8')).toContain('version: 2');
  });

  it('flags an upgrade when the installed version differs', () => {
    const dest = path.join(dir, 'dest');
    installSkillTo(src, dest);
    fs.writeFileSync(src, '---\nversion: 3\n---\nnewer');
    const res = installSkillTo(src, dest);
    expect(res).toMatchObject({ version: 3, previousVersion: 2, upgraded: true });
  });

  it('does not flag an upgrade when the version is unchanged', () => {
    const dest = path.join(dir, 'dest');
    installSkillTo(src, dest);
    expect(installSkillTo(src, dest).upgraded).toBe(false);
  });
});
