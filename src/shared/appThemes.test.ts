// @vitest-environment jsdom
// applyAppTheme writes to document.documentElement, so this shared-module test
// opts into a DOM environment even though src/shared runs in node by default.
import { describe, it, expect } from 'vitest';
import { APP_THEMES, DEFAULT_APP_THEME, findAppTheme, applyAppTheme } from './appThemes';

describe('appThemes', () => {
  it('exposes at least one light and one dark named theme', () => {
    expect(APP_THEMES.some((t) => t.appearance === 'light')).toBe(true);
    expect(APP_THEMES.some((t) => t.appearance === 'dark')).toBe(true);
  });

  it('every theme defines the core surface and text tokens', () => {
    for (const t of APP_THEMES) {
      expect(t.tokens['--dw-bg']).toBeTruthy();
      expect(t.tokens['--dw-text']).toBeTruthy();
      expect(t.tokens['--dw-leash']).toBeTruthy();
    }
  });

  it('falls back to the default theme for an unknown name', () => {
    expect(findAppTheme('nope').name).toBe(DEFAULT_APP_THEME);
  });

  it('applies token overrides and the appearance flag to the document root', () => {
    applyAppTheme('Dogwalker Light');
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--dw-bg')).toBe(findAppTheme('Dogwalker Light').tokens['--dw-bg']);
    expect(root.dataset.appTheme).toBe('light');

    applyAppTheme('Dogwalker Dark');
    expect(root.dataset.appTheme).toBe('dark');
    expect(root.style.getPropertyValue('--dw-bg')).toBe(findAppTheme('Dogwalker Dark').tokens['--dw-bg']);
  });
});
