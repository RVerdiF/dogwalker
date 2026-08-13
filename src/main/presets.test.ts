import { describe, it, expect, afterEach, vi } from 'vitest';
import { presetCommand, defaultShell } from './presets';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('presetCommand', () => {
  it('returns null for the plain shell preset', () => {
    expect(presetCommand('shell')).toBeNull();
  });

  it('maps each built-in agent preset to its bare command', () => {
    expect(presetCommand('claude')).toBe('claude');
    expect(presetCommand('codex')).toBe('codex');
    expect(presetCommand('gemini')).toBe('gemini');
    expect(presetCommand('opencode')).toBe('opencode');
    expect(presetCommand('aider')).toBe('aider');
  });

  it('returns null for an unknown preset id', () => {
    expect(presetCommand('totally-not-a-preset')).toBeNull();
  });

  it('builds the long-running stress command for posix shells', () => {
    const cmd = presetCommand('stress');
    expect(cmd).not.toBeNull();
    expect(cmd).toContain('while true');
    expect(cmd).toContain('seq 40');
    expect(cmd).toContain('$RANDOM');
    expect(cmd).toContain('sleep 0.05');
  });
  // The win32 branch of `stress` (and `defaultShell`'s powershell.exe) is
  // deliberately not covered: `isWin` is computed from process.platform at
  // module load, and process.platform is a non-configurable getter on the
  // process object — it cannot be reassigned or vi.spyOn'd, and replacing the
  // whole `process` global (vi.stubGlobal) would break env access for the rest
  // of the suite. These tests run on Linux/posix CI, so only the posix branch
  // is characterized here.
});

describe('defaultShell (posix)', () => {
  it('returns $SHELL when it is set', () => {
    vi.stubEnv('SHELL', '/bin/zsh');
    expect(defaultShell()).toBe('/bin/zsh');
  });

  it('falls back to bash when $SHELL is unset/empty', () => {
    vi.stubEnv('SHELL', '');
    expect(defaultShell()).toBe('bash');
  });
});
