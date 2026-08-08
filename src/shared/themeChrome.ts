/**
 * One theme drives everything. A ThemeSpec carries a terminal palette; the app
 * chrome (background, surfaces, sidebar, menus, notes, leashes, buttons, text,
 * icons) is *derived* from that palette here, as a set of `--dw-*` design tokens.
 * So selecting a theme recolors the terminals AND the whole interface together,
 * and any theme — built-in or a user's custom `.json` — themes the chrome for
 * free, with contrast that holds because surfaces/text are mixes toward the
 * palette's own foreground/background.
 */
import type { ThemeSpec } from './themes';

type RGB = [number, number, number];

const clamp = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));

function parse(hex: string): RGB {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
}

function toHex(rgb: RGB): string {
  return '#' + rgb.map((n) => clamp(n).toString(16).padStart(2, '0')).join('');
}

/** Linear blend from `a` to `b` by `t` in [0,1]. */
export function mix(a: string, b: string, t: string | number): string {
  const w = typeof t === 'number' ? t : parseFloat(t);
  const A = parse(a);
  const B = parse(b);
  return toHex([A[0] + (B[0] - A[0]) * w, A[1] + (B[1] - A[1]) * w, A[2] + (B[2] - A[2]) * w]);
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = parse(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function luminance(hex: string): number {
  const [r, g, b] = parse(hex).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** A readable ink color to place on top of `hex` (dark ink on light, light on dark). */
function ink(hex: string): string {
  return luminance(hex) > 0.5 ? '#15151b' : '#f4f5f8';
}

/** Derive the full chrome token set from a theme's terminal palette. */
export function chromeTokensFromTheme(spec: ThemeSpec): Record<string, string> {
  const t = spec.theme;
  const light = spec.appearance === 'light';
  const bg = t.background;
  const fg = t.foreground;
  const accent = t.brightYellow || t.yellow;
  const yellow = t.yellow;
  const red = t.red || t.brightRed;
  const green = t.green || t.brightGreen;
  const brand2 = mix(accent, bg, 0.28);

  return {
    '--dw-bg': bg,
    '--dw-surface-1': mix(bg, fg, 0.05),
    '--dw-surface-2': mix(bg, fg, 0.09),
    '--dw-surface-3': mix(bg, fg, 0.14),
    '--dw-border': mix(bg, fg, 0.2),
    '--dw-border-strong': mix(bg, fg, 0.34),
    '--dw-text': fg,
    '--dw-text-dim': mix(fg, bg, 0.14),
    '--dw-text-muted': mix(fg, bg, 0.4),
    '--dw-text-faint': mix(fg, bg, 0.56),
    '--dw-accent': accent,
    '--dw-brand-1': accent,
    '--dw-brand-2': brand2,
    '--dw-brand-grad': `linear-gradient(135deg, ${accent}, ${brand2})`,
    '--dw-leash': red,
    '--dw-success': green,
    '--dw-warn': yellow,
    '--dw-danger': red,
    '--dw-note': yellow,
    '--dw-shadow': light ? '0 10px 30px rgba(30, 35, 45, 0.14)' : '0 10px 30px rgba(0, 0, 0, 0.45)',
    '--dw-ring': `0 0 0 2px ${rgba(accent, 0.3)}`,
    '--dw-glass': rgba(mix(bg, fg, 0.06), light ? 0.92 : 0.88),
    '--dw-glass-border': rgba(fg, 0.14),
    '--dw-note-bg': mix(bg, yellow, light ? 0.18 : 0.12),
    '--dw-note-border': mix(bg, yellow, light ? 0.36 : 0.3),
    '--dw-note-text': mix(yellow, fg, 0.32),
    '--dw-success-bg': mix(bg, green, 0.16),
    '--dw-danger-bg': mix(bg, red, 0.16),
    '--dw-on-accent': ink(accent),
  };
}

/** Apply a theme's derived chrome tokens to the document root (renderer only). */
export function applyThemeChrome(spec: ThemeSpec): void {
  const tokens = chromeTokensFromTheme(spec);
  const root = document.documentElement;
  for (const [key, value] of Object.entries(tokens)) root.style.setProperty(key, value);
  root.dataset.appTheme = spec.appearance;
}
