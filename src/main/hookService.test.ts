import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { HookService } from './hookService';

describe('HookService', () => {
  let root: string;
  let floor: string;
  const hooks = new HookService();
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-hook-root-'));
    floor = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-hook-floor-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(floor, { recursive: true, force: true });
  });

  it('runs a hook in the floor dir with the DOGWALKER_* env', async () => {
    fs.mkdirSync(path.join(root, '.dogwalker'));
    fs.writeFileSync(
      path.join(root, '.dogwalker', 'hooks.json'),
      JSON.stringify({
        setup:
          "node -e \"require('fs').writeFileSync('marker.txt',[process.env.DOGWALKER_FLOOR_NAME,process.env.DOGWALKER_BRANCH_NAME,process.env.DOGWALKER_FLOOR_PATH,process.env.DOGWALKER_ROOT_PATH,process.env.DOGWALKER_PROJECT_NAME].join('|'))\"",
      }),
    );
    const ctx = { floorName: 'featA', branch: 'feat', floorPath: floor, rootPath: root };
    const res = await hooks.runHook('setup', ctx);
    expect(res).toMatchObject({ ran: true, ok: true });
    const marker = fs.readFileSync(path.join(floor, 'marker.txt'), 'utf8').split('|');
    expect(marker).toEqual(['featA', 'feat', floor, root, path.basename(root)]);
  });

  it('reports "not run" for a project without a hooks file', async () => {
    const res = await hooks.runHook('run', { floorName: 'f', branch: 'b', floorPath: floor, rootPath: root });
    expect(res.ran).toBe(false);
  });
});
