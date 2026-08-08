// @vitest-environment jsdom
// applyThemeChrome writes to document.documentElement, so this shared-module test
// opts into a DOM environment even though src/shared runs in node by default.
import { describe, it, expect } from 'vitest';
import { mix, rgba, chromeTokensFromTheme, applyThemeChrome } from './themeChrome';
import { BUILTIN_THEMES } from './themes';

const dark = BUILTIN_THEMES.find((t) => t.appearance === 'dark')!;
const light = BUILTIN_THEMES.find((t) => t.appearance === 'light')!;
const githubLight = BUILTIN_THEMES.find((t) => t.name === 'GitHub Light')!;

describe('color helpers', () => {
  it('mixes two colors', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff');
  });
  it('formats rgba', () => {
    expect(rgba('#ff8000', 0.5)).toBe('rgba(255, 128, 0, 0.5)');
  });
});

describe('chromeTokensFromTheme', () => {
  it('uses the palette background and foreground for bg/text', () => {
    const tk = chromeTokensFromTheme(dark);
    expect(tk['--dw-bg']).toBe(dark.theme.background);
    expect(tk['--dw-text']).toBe(dark.theme.foreground);
    expect(tk['--dw-leash']).toBe(dark.theme.red);
  });

  it('derives every core token for both dark and light themes', () => {
    for (const spec of [dark, light]) {
      const tk = chromeTokensFromTheme(spec);
      for (const key of ['--dw-surface-1', '--dw-border', '--dw-text-muted', '--dw-accent', '--dw-note-bg', '--dw-on-accent', '--dw-success-bg', '--dw-lane-1', '--dw-lane-7']) {
        expect(tk[key], `${spec.name} ${key}`).toBeTruthy();
      }
    }
  });

  it('picks a dark ink on a golden accent for readable buttons', () => {
    // GitHub Light's accent is a gold (#b08800); dark ink reads on it.
    expect(chromeTokensFromTheme(githubLight)['--dw-on-accent']).toBe('#15151b');
  });
});

describe('applyThemeChrome', () => {
  it('writes derived tokens and the appearance flag to the document root', () => {
    applyThemeChrome(light);
    const root = document.documentElement;
    expect(root.dataset.appTheme).toBe('light');
    expect(root.style.getPropertyValue('--dw-bg')).toBe(light.theme.background);

    applyThemeChrome(dark);
    expect(root.dataset.appTheme).toBe('dark');
    expect(root.style.getPropertyValue('--dw-bg')).toBe(dark.theme.background);
  });
});
