import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SettingsStore } from './settingsStore';
import type { ThemeSpec } from '../shared/themes';

/** Poll until `fn` is true (or throws), so async best-effort writes settle. */
function waitFor(fn: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      try {
        if (fn()) return resolve();
      } catch {
        /* fn threw (e.g. partial write) — keep polling */
      }
      if (Date.now() - start > timeoutMs) {
        return reject(new Error('waitFor: condition not met in time'));
      }
      setTimeout(tick, 5);
    };
    tick();
  });
}

/** A custom theme that passes validateTheme (every ANSI color present, #rrggbb). */
const VALID_THEME: ThemeSpec = {
  name: 'My Theme',
  appearance: 'dark',
  theme: {
    background: '#000000', foreground: '#ffffff', cursor: '#ffffff',
    black: '#000000', red: '#ff0000', green: '#00ff00', yellow: '#ffff00',
    blue: '#0000ff', magenta: '#ff00ff', cyan: '#00ffff', white: '#ffffff',
    brightBlack: '#000000', brightRed: '#ff0000', brightGreen: '#00ff00',
    brightYellow: '#ffff00', brightBlue: '#0000ff', brightMagenta: '#ff00ff',
    brightCyan: '#00ffff', brightWhite: '#ffffff',
  },
};

describe('SettingsStore', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-settings-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('starts with the defaults when no settings file exists', () => {
    const store = new SettingsStore(dir);
    expect(store.get()).toEqual({
      themeName: 'Dogwalker Dark',
      lightThemeName: 'GitHub Light',
      followSystem: false,
      notifyOnAttention: true,
      miniSidebar: false,
    });
  });

  it('starts with the defaults when settings.json is corrupted', () => {
    fs.writeFileSync(path.join(dir, 'settings.json'), 'not json{{');
    expect(new SettingsStore(dir).get()).toEqual({
      themeName: 'Dogwalker Dark',
      lightThemeName: 'GitHub Light',
      followSystem: false,
      notifyOnAttention: true,
      miniSidebar: false,
    });
  });

  it('merges a pre-existing settings file over the defaults', () => {
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ themeName: 'Nord' }));
    const store = new SettingsStore(dir);
    expect(store.get().themeName).toBe('Nord');
    expect(store.get().lightThemeName).toBe('GitHub Light');
    expect(store.get().followSystem).toBe(false);
  });

  it('returns a copy so callers cannot mutate internal state', () => {
    const store = new SettingsStore(dir);
    store.get().themeName = 'Hacked';
    expect(store.get().themeName).toBe('Dogwalker Dark');
  });

  it('merges a partial update, returns the merged settings, and persists them', async () => {
    const file = path.join(dir, 'settings.json');
    const store = new SettingsStore(dir);
    const result = store.set({ themeName: 'Dracula', followSystem: true });
    expect(result.themeName).toBe('Dracula');
    expect(result.followSystem).toBe(true);
    expect(result.notifyOnAttention).toBe(true); // untouched default survives
    await waitFor(() => {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
      return raw.themeName === 'Dracula' && raw.followSystem === true;
    });
    const reopened = new SettingsStore(dir);
    expect(reopened.get().themeName).toBe('Dracula');
    expect(reopened.get().followSystem).toBe(true);
  });

  it('lists only valid custom themes, skipping invalid and non-json files', () => {
    // The constructor creates terminal-themes; pre-seed it here so the files
    // exist before the store is instantiated.
    const themesDir = path.join(dir, 'terminal-themes');
    fs.mkdirSync(themesDir, { recursive: true });
    fs.writeFileSync(path.join(themesDir, 'good.json'), JSON.stringify(VALID_THEME));
    const invalidColor = {
      ...VALID_THEME,
      theme: { ...VALID_THEME.theme, brightWhite: 'not-a-color' },
    };
    fs.writeFileSync(path.join(themesDir, 'bad-color.json'), JSON.stringify(invalidColor));
    fs.writeFileSync(path.join(themesDir, 'malformed.json'), '{{ not json');
    fs.writeFileSync(path.join(themesDir, 'readme.txt'), 'not a theme');
    const themes = new SettingsStore(dir).listCustomThemes();
    expect(themes).toHaveLength(1);
    expect(themes[0].name).toBe('My Theme');
    expect(themes[0].appearance).toBe('dark');
    expect(themes[0].builtin).toBe(false);
  });

  it('returns an empty list when the themes directory is missing', () => {
    const store = new SettingsStore(dir);
    fs.rmSync(path.join(dir, 'terminal-themes'), { recursive: true, force: true });
    expect(store.listCustomThemes()).toEqual([]);
  });
});
