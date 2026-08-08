/**
 * App (UI chrome) themes — distinct from terminal themes (which recolor xterm).
 * An app theme is a set of design-token overrides applied to the document root,
 * so the whole chrome — background, surfaces, sidebar, menus, buttons, notes,
 * leashes, icons and the wordmark — recolors at once. Tokens live here (not only
 * in CSS) so the settings menu can render an accurate swatch per theme and so
 * applying one is a single `documentElement.style` write.
 */

export interface AppThemeSpec {
  name: string;
  appearance: 'dark' | 'light';
  /** CSS custom properties (full `--dw-*` names) applied to the document root. */
  tokens: Record<string, string>;
}

const DARK_TOKENS: Record<string, string> = {
  '--dw-bg': '#0e0f13',
  '--dw-surface-1': '#131319',
  '--dw-surface-2': '#16181f',
  '--dw-surface-3': '#1b1e26',
  '--dw-border': '#262a33',
  '--dw-border-strong': '#333a47',
  '--dw-text': '#e6e8ee',
  '--dw-text-dim': '#cfd3dc',
  '--dw-text-muted': '#8b90a0',
  '--dw-text-faint': '#6f7686',
  '--dw-accent': '#e8b565',
  '--dw-brand-1': '#eec079',
  '--dw-brand-2': '#c87f3c',
  '--dw-brand-grad': 'linear-gradient(135deg, #eec079, #c87f3c)',
  '--dw-leash': '#e6533c',
  '--dw-success': '#7ee0a8',
  '--dw-warn': '#e0a35a',
  '--dw-danger': '#f0a0a0',
  '--dw-note': '#e0cf7a',
  '--dw-shadow': '0 10px 30px rgba(0, 0, 0, 0.45)',
  '--dw-ring': '0 0 0 2px rgba(232, 181, 101, 0.28)',
};

const DIM_TOKENS: Record<string, string> = {
  ...DARK_TOKENS,
  '--dw-bg': '#14161c',
  '--dw-surface-1': '#191c24',
  '--dw-surface-2': '#1e222b',
  '--dw-surface-3': '#242a35',
  '--dw-border': '#2c3240',
  '--dw-border-strong': '#3a4150',
  '--dw-text': '#dfe3ec',
  '--dw-text-dim': '#c3c8d4',
  '--dw-text-muted': '#8890a0',
  '--dw-text-faint': '#6b7284',
  '--dw-shadow': '0 10px 30px rgba(0, 0, 0, 0.40)',
};

const LIGHT_TOKENS: Record<string, string> = {
  '--dw-bg': '#f4f5f8',
  '--dw-surface-1': '#ffffff',
  '--dw-surface-2': '#eef0f4',
  '--dw-surface-3': '#e4e7ee',
  '--dw-border': '#d6dae2',
  '--dw-border-strong': '#c1c7d2',
  '--dw-text': '#1b1e26',
  '--dw-text-dim': '#2c313c',
  '--dw-text-muted': '#5c6472',
  '--dw-text-faint': '#828a98',
  '--dw-accent': '#bd7a2c',
  '--dw-brand-1': '#d99a44',
  '--dw-brand-2': '#a5641f',
  '--dw-brand-grad': 'linear-gradient(135deg, #d99a44, #a5641f)',
  '--dw-leash': '#d1402a',
  '--dw-success': '#2f9e63',
  '--dw-warn': '#b0761d',
  '--dw-danger': '#c23f2e',
  '--dw-note': '#a5801d',
  '--dw-shadow': '0 10px 30px rgba(30, 35, 45, 0.14)',
  '--dw-ring': '0 0 0 2px rgba(189, 122, 44, 0.30)',
};

export const APP_THEMES: AppThemeSpec[] = [
  { name: 'Dogwalker Dark', appearance: 'dark', tokens: DARK_TOKENS },
  { name: 'Dim', appearance: 'dark', tokens: DIM_TOKENS },
  { name: 'Dogwalker Light', appearance: 'light', tokens: LIGHT_TOKENS },
];

export const DEFAULT_APP_THEME = APP_THEMES[0].name;

export function findAppTheme(name: string): AppThemeSpec {
  return APP_THEMES.find((t) => t.name === name) ?? APP_THEMES[0];
}

/** Apply an app theme's tokens to the document root (renderer only). */
export function applyAppTheme(name: string): void {
  const theme = findAppTheme(name);
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.tokens)) {
    root.style.setProperty(key, value);
  }
  root.dataset.appTheme = theme.appearance;
}
