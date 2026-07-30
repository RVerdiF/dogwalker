import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';

const run = promisify(exec);

export interface FloorHooks {
  setup?: string;
  run?: string;
  teardown?: string;
}

export interface HookContext {
  floorName: string;
  branch: string;
  floorPath: string;
  rootPath: string;
}

export interface HookResult {
  ran: boolean;
  ok: boolean;
  output: string;
}

/**
 * Floor lifecycle hooks (PRODUCT.md §10). Commands live in the project's
 * `.dogwalker/hooks.json` at the ground root (versionable), as shell strings:
 * `{ "setup": "npm install", "run": "npm run dev", "teardown": "rm -rf node_modules" }`.
 * Each runs in the floor's worktree with `DOGWALKER_*` env, so setup can install
 * deps or copy an `.env` that worktrees don't inherit.
 */
export class HookService {
  /** Read the project hooks; missing/malformed file → no hooks. */
  readHooks(rootPath: string): FloorHooks {
    try {
      const raw = fs.readFileSync(path.join(rootPath, '.dogwalker', 'hooks.json'), 'utf8');
      const parsed = JSON.parse(raw) as FloorHooks;
      return {
        setup: typeof parsed.setup === 'string' ? parsed.setup : undefined,
        run: typeof parsed.run === 'string' ? parsed.run : undefined,
        teardown: typeof parsed.teardown === 'string' ? parsed.teardown : undefined,
      };
    } catch {
      return {};
    }
  }

  private env(ctx: HookContext): NodeJS.ProcessEnv {
    return {
      ...process.env,
      DOGWALKER_FLOOR_NAME: ctx.floorName,
      DOGWALKER_BRANCH_NAME: ctx.branch,
      DOGWALKER_FLOOR_PATH: ctx.floorPath,
      DOGWALKER_ROOT_PATH: ctx.rootPath,
      DOGWALKER_PROJECT_NAME: path.basename(ctx.rootPath),
    };
  }

  /** Run one hook command in the floor dir; no command → not run. */
  async runCommand(command: string | undefined, ctx: HookContext): Promise<HookResult> {
    if (!command || !command.trim()) return { ran: false, ok: true, output: '' };
    try {
      const { stdout, stderr } = await run(command, {
        cwd: ctx.floorPath,
        env: this.env(ctx),
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
      });
      return { ran: true, ok: true, output: (stdout + stderr).trim() };
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      return {
        ran: true,
        ok: false,
        output: (err.stdout ?? '') + (err.stderr ?? err.message ?? 'hook failed'),
      };
    }
  }

  /** Convenience: read + run a named hook for a floor. */
  async runHook(kind: keyof FloorHooks, ctx: HookContext): Promise<HookResult> {
    const hooks = this.readHooks(ctx.rootPath);
    return this.runCommand(hooks[kind], ctx);
  }
}
