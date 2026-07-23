// Terminal color themes (PRODUCT.md §4.1). Shared so main can validate custom
// themes read from disk and the renderer can render the gallery + apply them.

export interface TerminalTheme {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent?: string;
  selectionBackground?: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export interface ThemeSpec {
  name: string;
  appearance: 'dark' | 'light';
  builtin?: boolean;
  theme: TerminalTheme;
}

export const BUILTIN_THEMES: ThemeSpec[] = [
  {
    name: 'Dogwalker Dark',
    appearance: 'dark',
    builtin: true,
    theme: {
      background: '#16161c',
      foreground: '#d6d6dd',
      cursor: '#8ab4ff',
      selectionBackground: '#2a3350',
      black: '#20202a', red: '#ff7a7a', green: '#7fd79a', yellow: '#e0cf7a',
      blue: '#8ab4ff', magenta: '#b98aff', cyan: '#7ad6d6', white: '#d6d6dd',
      brightBlack: '#4a4a58', brightRed: '#ff9a9a', brightGreen: '#9ce7b2',
      brightYellow: '#f0e29a', brightBlue: '#a3c4ff', brightMagenta: '#cfa8ff',
      brightCyan: '#9ce7e7', brightWhite: '#f0f0f5',
    },
  },
  {
    name: 'Dracula',
    appearance: 'dark',
    builtin: true,
    theme: {
      background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2',
      selectionBackground: '#44475a',
      black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
      blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
      brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94',
      brightYellow: '#ffffa5', brightBlue: '#d6acff', brightMagenta: '#ff92df',
      brightCyan: '#a4ffff', brightWhite: '#ffffff',
    },
  },
  {
    name: 'Nord',
    appearance: 'dark',
    builtin: true,
    theme: {
      background: '#2e3440', foreground: '#d8dee9', cursor: '#d8dee9',
      selectionBackground: '#434c5e',
      black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b',
      blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
      brightBlack: '#4c566a', brightRed: '#bf616a', brightGreen: '#a3be8c',
      brightYellow: '#ebcb8b', brightBlue: '#81a1c1', brightMagenta: '#b48ead',
      brightCyan: '#8fbcbb', brightWhite: '#eceff4',
    },
  },
  {
    name: 'Catppuccin Mocha',
    appearance: 'dark',
    builtin: true,
    theme: {
      background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc',
      selectionBackground: '#414356',
      black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
      blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de',
      brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1',
      brightYellow: '#f9e2af', brightBlue: '#89b4fa', brightMagenta: '#f5c2e7',
      brightCyan: '#94e2d5', brightWhite: '#a6adc8',
    },
  },
  {
    name: 'Solarized Dark',
    appearance: 'dark',
    builtin: true,
    theme: {
      background: '#002b36', foreground: '#839496', cursor: '#839496',
      selectionBackground: '#073642',
      black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
      blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
      brightBlack: '#586e75', brightRed: '#cb4b16', brightGreen: '#586e75',
      brightYellow: '#657b83', brightBlue: '#839496', brightMagenta: '#6c71c4',
      brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
    },
  },
  {
    name: 'Solarized Light',
    appearance: 'light',
    builtin: true,
    theme: {
      background: '#fdf6e3', foreground: '#657b83', cursor: '#657b83',
      selectionBackground: '#eee8d5',
      black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
      blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
      brightBlack: '#002b36', brightRed: '#cb4b16', brightGreen: '#586e75',
      brightYellow: '#657b83', brightBlue: '#839496', brightMagenta: '#6c71c4',
      brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
    },
  },
  {
    name: 'GitHub Light',
    appearance: 'light',
    builtin: true,
    theme: {
      background: '#ffffff', foreground: '#24292e', cursor: '#24292e',
      selectionBackground: '#c8e1ff',
      black: '#24292e', red: '#d73a49', green: '#28a745', yellow: '#dbab09',
      blue: '#0366d6', magenta: '#5a32a3', cyan: '#0598bc', white: '#6a737d',
      brightBlack: '#959da5', brightRed: '#cb2431', brightGreen: '#22863a',
      brightYellow: '#b08800', brightBlue: '#005cc5', brightMagenta: '#5a32a3',
      brightCyan: '#3192aa', brightWhite: '#d1d5da',
    },
  },
];

const REQUIRED_KEYS: Array<keyof TerminalTheme> = [
  'background', 'foreground', 'cursor',
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow',
  'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
];

/** Validate a custom theme object read from disk. Returns null if malformed. */
export function validateTheme(raw: unknown): ThemeSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.name !== 'string') return null;
  const t = o.theme as Record<string, unknown> | undefined;
  if (!t) return null;
  for (const k of REQUIRED_KEYS) {
    if (typeof t[k] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(t[k] as string)) {
      return null;
    }
  }
  return {
    name: o.name,
    appearance: o.appearance === 'light' ? 'light' : 'dark',
    builtin: false,
    theme: t as unknown as TerminalTheme,
  };
}
