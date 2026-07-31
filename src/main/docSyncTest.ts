import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AgentDocsSync } from './agentDocsSync';

/**
 * CLAUDE.md ↔ AGENTS.md sync (DW_DOCSYNCTEST=1): seeding a missing file,
 * mirroring an edit either way, the newer file winning a reconcile, and the live
 * watcher propagating a change.
 */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runDocSyncTest(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-docsync-'));
  const C = path.join(dir, 'CLAUDE.md');
  const A = path.join(dir, 'AGENTS.md');
  const read = (p: string) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
  const sync = new AgentDocsSync();
  const results: Record<string, unknown> = {};
  try {
    // Seed the missing counterpart.
    fs.writeFileSync(C, 'CLAUDE ONE');
    sync.reconcile(dir);
    results.seededMissing = read(A) === 'CLAUDE ONE';

    // Mirror an AGENTS edit to CLAUDE, and vice versa.
    fs.writeFileSync(A, 'AGENTS TWO');
    sync.syncFrom(dir, 'agents');
    results.mirrorAgentsToClaude = read(C) === 'AGENTS TWO';
    fs.writeFileSync(C, 'CLAUDE THREE');
    sync.syncFrom(dir, 'claude');
    results.mirrorClaudeToAgents = read(A) === 'CLAUDE THREE';

    // Live watcher propagates a change.
    sync.enable(dir);
    await wait(300);
    fs.writeFileSync(C, 'LIVE EDIT');
    await wait(1000);
    results.liveWatch = read(A) === 'LIVE EDIT';
    sync.disable(dir);

    // Reconcile: the newer file wins.
    fs.writeFileSync(C, 'older-claude');
    await wait(60);
    fs.writeFileSync(A, 'newer-agents');
    sync.reconcile(dir);
    results.reconcileNewerWins = read(C) === 'newer-agents';
  } catch (e) {
    results.threw = (e as Error).message;
  } finally {
    sync.disposeAll();
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* leave for the OS */
    }
  }
  console.log('DOCSYNCTEST RESULT ' + JSON.stringify(results));
}
