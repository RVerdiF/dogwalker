import * as fs from 'node:fs';
import * as path from 'node:path';

const NAMES = { claude: 'CLAUDE.md', agents: 'AGENTS.md' } as const;
const DEBOUNCE_MS = 150;

/**
 * CLAUDE.md ↔ AGENTS.md sync (PRODUCT.md §12): a per-workspace helper for
 * mixed-agent projects, so every agent reads the same guidance. When enabled for
 * a workspace's cwd it keeps the two files identical — editing either mirrors to
 * the other. A content-equality guard makes the mirror write a no-op on the way
 * back, so there is no watch loop.
 */
export class AgentDocsSync {
  private watchers = new Map<string, fs.FSWatcher>();
  private timers = new Map<string, NodeJS.Timeout>();

  private paths(cwd: string): { claude: string; agents: string } {
    return {
      claude: path.join(cwd, NAMES.claude),
      agents: path.join(cwd, NAMES.agents),
    };
  }

  /** Make both files match the newer one (or seed the missing one). */
  reconcile(cwd: string): void {
    const { claude, agents } = this.paths(cwd);
    const cEx = fs.existsSync(claude);
    const aEx = fs.existsSync(agents);
    try {
      if (cEx && aEx) {
        const newer =
          fs.statSync(claude).mtimeMs >= fs.statSync(agents).mtimeMs ? claude : agents;
        const older = newer === claude ? agents : claude;
        const content = fs.readFileSync(newer, 'utf8');
        if (fs.readFileSync(older, 'utf8') !== content) fs.writeFileSync(older, content);
      } else if (cEx) {
        fs.writeFileSync(agents, fs.readFileSync(claude, 'utf8'));
      } else if (aEx) {
        fs.writeFileSync(claude, fs.readFileSync(agents, 'utf8'));
      }
    } catch {
      /* best-effort */
    }
  }

  /** Copy one side to the other (only if it changed) — the mirror step. */
  syncFrom(cwd: string, which: 'claude' | 'agents'): void {
    const { claude, agents } = this.paths(cwd);
    const src = which === 'claude' ? claude : agents;
    const dst = which === 'claude' ? agents : claude;
    try {
      if (!fs.existsSync(src)) return;
      const content = fs.readFileSync(src, 'utf8');
      if (!fs.existsSync(dst) || fs.readFileSync(dst, 'utf8') !== content) {
        fs.writeFileSync(dst, content);
      }
    } catch {
      /* best-effort */
    }
  }

  enable(cwd: string): void {
    if (!cwd || this.watchers.has(cwd) || !fs.existsSync(cwd)) {
      if (cwd && fs.existsSync(cwd)) this.reconcile(cwd);
      return;
    }
    this.reconcile(cwd);
    try {
      const watcher = fs.watch(cwd, (_event, filename) => {
        if (filename !== NAMES.claude && filename !== NAMES.agents) return;
        const which = filename === NAMES.claude ? 'claude' : 'agents';
        const prev = this.timers.get(cwd);
        if (prev) clearTimeout(prev);
        this.timers.set(
          cwd,
          setTimeout(() => this.syncFrom(cwd, which), DEBOUNCE_MS),
        );
      });
      this.watchers.set(cwd, watcher);
    } catch {
      /* directory not watchable — reconcile-on-enable still ran */
    }
  }

  disable(cwd: string): void {
    this.watchers.get(cwd)?.close();
    this.watchers.delete(cwd);
    const t = this.timers.get(cwd);
    if (t) clearTimeout(t);
    this.timers.delete(cwd);
  }

  disposeAll(): void {
    for (const cwd of [...this.watchers.keys()]) this.disable(cwd);
  }
}
