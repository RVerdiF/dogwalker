import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AppSettings } from '../shared/ipc';
import { validateTheme, type ThemeSpec } from '../shared/themes';

const DEFAULTS: AppSettings = {
  themeName: 'Dogwalker Dark',
  lightThemeName: 'GitHub Light',
  followSystem: false,
  notifyOnAttention: true,
  miniSidebar: false,
};

/**
 * App settings (terminal theming for now) persisted to settings.json, plus the
 * custom-theme folder (PRODUCT.md §4.1). Custom themes are `.json` files under
 * `userData/terminal-themes`, validated on read so a malformed file can't break
 * the gallery.
 */
export class SettingsStore {
  private file: string;
  private themesDir: string;
  private data: AppSettings;

  constructor(userData: string) {
    this.file = path.join(userData, 'settings.json');
    this.themesDir = path.join(userData, 'terminal-themes');
    fs.mkdirSync(this.themesDir, { recursive: true });
    try {
      this.data = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
    } catch {
      this.data = { ...DEFAULTS };
    }
  }

  get(): AppSettings {
    return { ...this.data };
  }

  set(partial: Partial<AppSettings>): AppSettings {
    this.data = { ...this.data, ...partial };
    fs.writeFile(this.file, JSON.stringify(this.data, null, 2), () => {
      /* best-effort */
    });
    return this.get();
  }

  listCustomThemes(): ThemeSpec[] {
    let files: string[] = [];
    try {
      files = fs.readdirSync(this.themesDir).filter((f) => f.endsWith('.json'));
    } catch {
      return [];
    }
    const out: ThemeSpec[] = [];
    for (const f of files) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(this.themesDir, f), 'utf8'));
        const spec = validateTheme(raw);
        if (spec) out.push(spec);
      } catch {
        /* skip malformed */
      }
    }
    return out;
  }
}
