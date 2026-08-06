import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AgentDocsSync } from './agentDocsSync';

describe('AgentDocsSync', () => {
  let cwd: string;
  const sync = new AgentDocsSync();
  const claude = () => path.join(cwd, 'CLAUDE.md');
  const agents = () => path.join(cwd, 'AGENTS.md');
  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-docsync-'));
  });
  afterEach(() => {
    sync.disable(cwd);
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('seeds the missing counterpart on reconcile', () => {
    fs.writeFileSync(claude(), 'shared guidance');
    sync.reconcile(cwd);
    expect(fs.readFileSync(agents(), 'utf8')).toBe('shared guidance');
  });

  it('lets the newer file win when both exist', () => {
    fs.writeFileSync(agents(), 'old');
    fs.writeFileSync(claude(), 'new');
    // Make CLAUDE.md unambiguously newer than AGENTS.md.
    const past = new Date(Date.now() - 10_000);
    fs.utimesSync(agents(), past, past);
    sync.reconcile(cwd);
    expect(fs.readFileSync(agents(), 'utf8')).toBe('new');
  });

  it('mirrors an edit from either side', () => {
    fs.writeFileSync(claude(), 'a');
    fs.writeFileSync(agents(), 'a');
    fs.writeFileSync(claude(), 'edited in claude');
    sync.syncFrom(cwd, 'claude');
    expect(fs.readFileSync(agents(), 'utf8')).toBe('edited in claude');
    fs.writeFileSync(agents(), 'edited in agents');
    sync.syncFrom(cwd, 'agents');
    expect(fs.readFileSync(claude(), 'utf8')).toBe('edited in agents');
  });

  it('reconciles immediately when enabled', () => {
    fs.writeFileSync(agents(), 'from agents');
    sync.enable(cwd);
    expect(fs.readFileSync(claude(), 'utf8')).toBe('from agents');
  });
});
