/**
 * Modern line-style icon set (24×24, stroke = currentColor) used across the
 * canvas chrome so buttons and labels carry crisp vector glyphs instead of
 * emoji/text. Each icon inherits color from its parent and scales with `size`.
 * `DogwalkerLogo` is the app brand mark; it too draws from theme tokens so it
 * recolors with the theme (from assets/logo.svg).
 */
import type { ReactNode, SVGProps } from 'react';

type IconProps = { size?: number } & SVGProps<SVGSVGElement>;

function Svg({ size = 16, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** A disclosure chevron (points right; add class "open" to rotate it down). */
export function ChevronIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

/** A terminal window with a prompt caret and a command line. */
export function TerminalIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.75" y="4.25" width="18.5" height="15.5" rx="2.75" />
      <path d="M6.5 9.25 9.5 12l-3 2.75" />
      <path d="M12.75 15h4.75" />
    </Svg>
  );
}

/** A sticky note / document with a folded corner and text lines. */
export function NoteIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 3.25h7.5L19 8.75V19a1.75 1.75 0 0 1-1.75 1.75H6A1.75 1.75 0 0 1 4.25 19V5A1.75 1.75 0 0 1 6 3.25Z" />
      <path d="M13.25 3.5V9h5.25" />
      <path d="M8 13h6.5" />
      <path d="M8 16.25h6.5" />
    </Svg>
  );
}

/** A folder, for the File Tree node. */
export function FilesIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.25 6.5A1.75 1.75 0 0 1 5 4.75h3.4a1.75 1.75 0 0 1 1.4.7l1.05 1.4h7.4A1.75 1.75 0 0 1 21 8.6v8.65A1.75 1.75 0 0 1 19.25 19H5A1.75 1.75 0 0 1 3.25 17.25Z" />
    </Svg>
  );
}

/** A globe, for the Portal (embedded browser) node. */
export function PortalIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.6 12h16.8" />
      <path d="M12 3.5c2.6 2.5 3.9 5.4 3.9 8.5S14.6 18 12 20.5C9.4 18 8.1 15.1 8.1 12S9.4 6 12 3.5Z" />
    </Svg>
  );
}

/** A crown, for Walker (manager) terminals. */
export function CrownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 8l4 3.5 4-6 4 6 4-3.5-1.5 10.5h-13z" />
      <path d="M6.25 18.5h11.5" />
    </Svg>
  );
}

/** A picture, for image previews and placeholders. */
export function ImageIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.25" y="4.75" width="17.5" height="14.5" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.75" />
      <path d="m4 17 5-5 4 3.5 3-2.5 4 4" />
    </Svg>
  );
}

/** A cog, for settings / the menu. */
export function GearIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="6.4" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M12 2.75V5.4M12 18.6V21.25M2.75 12H5.4M18.6 12H21.25M5.28 5.28 7.15 7.15M16.85 16.85 18.72 18.72M18.72 5.28 16.85 7.15M7.15 16.85 5.28 18.72" />
    </Svg>
  );
}

/** A house, for the Ground layer of a workspace. */
export function GroundIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 9.25V19h12V9.25" />
    </Svg>
  );
}

/** Stacked layers, for a Floor (git-worktree layer). */
export function FloorIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3 3 7.5 12 12l9-4.5z" />
      <path d="m3 12 9 4.5L21 12" />
      <path d="m3 16.5 9 4.5 9-4.5" />
    </Svg>
  );
}

/** A paper plane, for the composer send button. */
export function SendIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20.5 3.5 2.75 11l7 2.75 2.75 7z" />
      <path d="M20.5 3.5 9.75 13.75" />
    </Svg>
  );
}

/** A magnifier, for search inputs. */
export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-3.6-3.6" />
    </Svg>
  );
}

/** A pencil, for rename actions. */
export function PencilIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20h4L18.5 9.5a2 2 0 0 0-2.83-2.83L5 17.25z" />
      <path d="m14.5 8 2.5 2.5" />
    </Svg>
  );
}

/** A trash can, for delete actions. */
export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 7h15" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M6.75 7 7.6 18.6a1.6 1.6 0 0 0 1.6 1.4h5.6a1.6 1.6 0 0 0 1.6-1.4L17.25 7" />
      <path d="M10 11v5.5M14 11v5.5" />
    </Svg>
  );
}

/** A warning triangle, for error/warning lines. */
export function WarningIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4 2.75 20h18.5z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.4h.01" />
    </Svg>
  );
}

/** A checkmark. */
export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12.5 10 17.5 19.5 7" />
    </Svg>
  );
}

/** An X, for cancel/close/failure. */
export function CrossIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </Svg>
  );
}

/** A generic document, for text files. */
export function DocIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 3.25h7.5L19 8.75V19a1.75 1.75 0 0 1-1.75 1.75H6A1.75 1.75 0 0 1 4.25 19V5A1.75 1.75 0 0 1 6 3.25Z" />
      <path d="M13.25 3.5V9h5.25" />
    </Svg>
  );
}

/** A document with angle brackets, for code files. */
export function CodeFileIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 3.25h7.5L19 8.75V19a1.75 1.75 0 0 1-1.75 1.75H6A1.75 1.75 0 0 1 4.25 19V5A1.75 1.75 0 0 1 6 3.25Z" />
      <path d="M13.25 3.5V9h5.25" />
      <path d="m10 12.75-1.75 1.75L10 16.25" />
      <path d="m13.5 12.75 1.75 1.75-1.75 1.75" />
    </Svg>
  );
}

/** A box, for archives. */
export function ArchiveIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.25 7 12 3.5 20.75 7 12 10.5z" />
      <path d="M3.25 7v9.5L12 20.5l8.75-4V7" />
      <path d="M12 10.5v10" />
    </Svg>
  );
}

/** A 2×2 grid of cards, for Workspaces. */
export function WorkspacesIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="4.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="4.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="6" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="6" rx="1.5" />
    </Svg>
  );
}

/** A stopwatch, for Routines. */
export function RoutinesIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="13.25" r="7.25" />
      <path d="M12 9.5v3.75l2.5 1.5" />
      <path d="M9.75 3.5h4.5" />
    </Svg>
  );
}

/** A lightning bolt, for Presets. */
export function BoltIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13 3 5 13.25h5.5l-1 7.75L18.5 10.5H12.5z" />
    </Svg>
  );
}

/** A person, for Roles. */
export function RoleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8.5" r="3.75" />
      <path d="M5.25 19.5a6.75 6.75 0 0 1 13.5 0" />
    </Svg>
  );
}

/** A checklist document, for Contracts. */
export function ContractIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4.25" y="3.5" width="15.5" height="17" rx="2" />
      <path d="m7.75 8.5 1.25 1.25 2.25-2.25" />
      <path d="M13.5 8.5h3" />
      <path d="m7.75 14.5 1.25 1.25 2.25-2.25" />
      <path d="M13.5 14.5h3" />
    </Svg>
  );
}

/** A leash/link between two nodes, for connection history. */
export function LinkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M8 11 5.75 13.25a3.18 3.18 0 0 0 4.5 4.5L12.5 15.5" />
      <path d="M16 13 18.25 10.75a3.18 3.18 0 0 0-4.5-4.5L11.5 8.5" />
    </Svg>
  );
}

/** Align selected nodes to their left edges. */
export function AlignLeftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 4v16" />
      <rect x="7" y="6.5" width="11" height="4" rx="1" />
      <rect x="7" y="13.5" width="7" height="4" rx="1" />
    </Svg>
  );
}

/** Align selected nodes to their horizontal centers. */
export function AlignCenterHIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4v16" />
      <rect x="3.5" y="6.5" width="17" height="4" rx="1" />
      <rect x="7" y="13.5" width="10" height="4" rx="1" />
    </Svg>
  );
}

/** Align selected nodes to their right edges. */
export function AlignRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 4v16" />
      <rect x="6" y="6.5" width="11" height="4" rx="1" />
      <rect x="10" y="13.5" width="7" height="4" rx="1" />
    </Svg>
  );
}

/** Align selected nodes to their top edges. */
export function AlignTopIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 4h16" />
      <rect x="6.5" y="7" width="4" height="11" rx="1" />
      <rect x="13.5" y="7" width="4" height="7" rx="1" />
    </Svg>
  );
}

/** Align selected nodes to their vertical centers. */
export function AlignMiddleVIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 12h16" />
      <rect x="6.5" y="3.5" width="4" height="17" rx="1" />
      <rect x="13.5" y="7" width="4" height="10" rx="1" />
    </Svg>
  );
}

/** Align selected nodes to their bottom edges. */
export function AlignBottomIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20h16" />
      <rect x="6.5" y="6" width="4" height="11" rx="1" />
      <rect x="13.5" y="10" width="4" height="7" rx="1" />
    </Svg>
  );
}

/** Distribute selected nodes evenly along the horizontal axis. */
export function DistributeHIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 5v14M21 5v14" />
      <rect x="10.5" y="7" width="3" height="10" rx="1" />
    </Svg>
  );
}

/** Distribute selected nodes evenly along the vertical axis. */
export function DistributeVIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 3h14M5 21h14" />
      <rect x="7" y="10.5" width="10" height="3" rx="1" />
    </Svg>
  );
}

/** Tidy a selection into an aligned grid. */
export function TidyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="4" width="16" height="16" rx="1.75" />
      <path d="M4 12h16M12 4v16" />
    </Svg>
  );
}

/**
 * Selectable preset glyphs. A preset stores an icon *id* (a key here) instead of
 * a free-form emoji; the picker in the Presets panel offers this fixed set.
 * Several read as generic AI-assistant marks (sparkle, spark, robot, brain,
 * chat, atom) — original, not reproductions of any vendor's trademark — the rest
 * are neutral shapes. Unknown/legacy ids fall back to the terminal glyph.
 */
const PRESET_GLYPHS: Record<string, ReactNode> = {
  terminal: (
    <>
      <rect x="2.75" y="4.25" width="18.5" height="15.5" rx="2.75" />
      <path d="M6.5 9.25 9.5 12l-3 2.75" />
      <path d="M12.75 15h4.75" />
    </>
  ),
  sparkle: (
    <>
      <path d="M11.5 4C12.1 8.4 13.1 9.4 17.5 10 13.1 10.6 12.1 11.6 11.5 16 10.9 11.6 9.9 10.6 5.5 10 9.9 9.4 10.9 8.4 11.5 4Z" />
      <path d="M18 14.5c.2 1.4.5 1.7 1.9 1.9-1.4.2-1.7.5-1.9 1.9-.2-1.4-.5-1.7-1.9-1.9 1.4-.2 1.7-.5 1.9-1.9z" />
    </>
  ),
  spark: <path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" />,
  robot: (
    <>
      <rect x="5" y="8" width="14" height="11" rx="3" />
      <path d="M9.25 13h.01M14.75 13h.01" />
      <circle cx="12" cy="4.25" r="1.35" />
      <path d="M12 5.6V8" />
      <path d="M4 12.5v3M20 12.5v3" />
    </>
  ),
  brain: (
    <>
      <path d="M12 6a2.75 2.75 0 0 0-5.2 1.4A2.6 2.6 0 0 0 5.5 12a2.6 2.6 0 0 0 1.9 4.3A2.75 2.75 0 0 0 12 17.4z" />
      <path d="M12 6a2.75 2.75 0 0 1 5.2 1.4A2.6 2.6 0 0 1 18.5 12a2.6 2.6 0 0 1-1.9 4.3A2.75 2.75 0 0 1 12 17.4z" />
      <path d="M12 6v11.4" />
    </>
  ),
  chat: (
    <>
      <path d="M4.5 6.5A2 2 0 0 1 6.5 4.5h11a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2H9l-4.5 4z" />
      <path d="M8.5 9h7M8.5 12h4.5" />
    </>
  ),
  atom: (
    <>
      <circle cx="12" cy="12" r="1.6" />
      <ellipse cx="12" cy="12" rx="9" ry="3.8" />
      <ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(120 12 12)" />
    </>
  ),
  hexagon: <path d="M12 3.25 20 7.75v8.5L12 20.75 4 16.25v-8.5z" />,
  chip: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
      <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
    </>
  ),
  bolt: <path d="M13 3 5 13.25h5.5l-1 7.75L18.5 10.5H12.5z" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M15.75 8.25 13 13l-4.75 2.75L11 11z" />
    </>
  ),
  rocket: (
    <>
      <path d="M12 3c3 1.6 4.5 4.6 4.5 8 0 2-.75 3.8-1.5 5h-6c-.75-1.2-1.5-3-1.5-5C7.5 7.6 9 4.6 12 3z" />
      <circle cx="12" cy="9.5" r="1.6" />
      <path d="M9 16.5 6.5 19.5M15 16.5 17.5 19.5M10.5 18.5h3" />
    </>
  ),
  flask: (
    <>
      <path d="M9.5 3.5h5M10 3.5v5L5.6 16.9A2 2 0 0 0 7.4 20h9.2a2 2 0 0 0 1.8-3.1L14 8.5v-5" />
      <path d="M8 14h8" />
    </>
  ),
  cube: (
    <>
      <path d="M12 3 20.5 8v8L12 21 3.5 16V8z" />
      <path d="M3.5 8 12 13l8.5-5M12 13v8" />
    </>
  ),
  gem: (
    <>
      <path d="M6.5 4h11l3 5-8.5 11L3.5 9z" />
      <path d="M3.5 9h17M9.5 4 6.5 9 12 20l5.5-11-3-5" />
    </>
  ),
  star: <path d="M12 3.5l2.6 5.55 6.1.7-4.5 4.1 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.1 6.1-.7z" />,
  wand: (
    <>
      <path d="M5 19 14.5 9.5" />
      <path d="M16 4.5l.85 2 2 .85-2 .85-.85 2-.85-2-2-.85 2-.85z" />
      <path d="M19 12l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 19 6v5c0 4.4-3 7.9-7 9.5-4-1.6-7-5.1-7-9.5V6z" />
      <path d="M9 12l2 2 4-4.25" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19C5 11 10 5 19 5c0 9-6 14-14 14z" />
      <path d="M9 15c2-3 5-5 8.5-6" />
    </>
  ),
  bug: (
    <>
      <rect x="8" y="8" width="8" height="10" rx="4" />
      <path d="M9 11.5h6M9 15h6" />
      <path d="M8.5 6 10 8M15.5 6 14 8M4 11h3M17 11h3M4 15.5h3.5M16.5 15.5H20M12 4v3" />
    </>
  ),
};

/** The stable list of selectable preset icon ids (for the picker). */
export const PRESET_ICON_IDS = Object.keys(PRESET_GLYPHS);

/** The default preset icon id, used when none is chosen. */
export const DEFAULT_PRESET_ICON = 'sparkle';

/** Render a preset's glyph by id; unknown/legacy ids fall back to a terminal. */
export function PresetGlyph({ id, size = 16 }: { id?: string; size?: number }) {
  return <Svg size={size}>{(id && PRESET_GLYPHS[id]) || PRESET_GLYPHS.terminal}</Svg>;
}

/** The Dogwalker brand mark — a golden terminal square + red leash, tinted from
 * the theme tokens (brand/leash/on-accent) so it recolors with the app theme. */
export function DogwalkerLogo({ size = 24, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Dogwalker"
      {...rest}
    >
      <defs>
        <linearGradient id="dwFur" x1="8" y1="56" x2="34" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: 'var(--dw-brand-2)' }} />
          <stop offset="1" style={{ stopColor: 'var(--dw-brand-1)' }} />
        </linearGradient>
      </defs>
      <rect x="8" y="30" width="26" height="26" rx="8" fill="url(#dwFur)" />
      <rect x="8.75" y="30.75" width="24.5" height="24.5" rx="7.25" style={{ stroke: 'var(--dw-brand-1)' }} strokeOpacity=".18" strokeWidth="1.5" />
      <path d="M15 38l4 3.5-4 3.5" style={{ stroke: 'var(--dw-on-accent)' }} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M23 45.5h6" style={{ stroke: 'var(--dw-on-accent)' }} strokeWidth="2.8" strokeLinecap="round" />
      <path d="M33 33C41 22 44 20 49 18" style={{ stroke: 'var(--dw-leash)' }} strokeOpacity=".35" strokeWidth="5" strokeLinecap="round" />
      <path d="M33 33C41 22 44 20 49 18" style={{ stroke: 'var(--dw-leash)' }} strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="49" cy="16" r="8" style={{ fill: 'var(--dw-leash)' }} />
      <circle cx="49" cy="16" r="6.7" style={{ stroke: 'var(--dw-leash)' }} strokeWidth="1.3" opacity=".4" />
      <circle cx="49" cy="16" r="8" style={{ stroke: 'var(--dw-on-accent)' }} strokeWidth="2" opacity="0.22" />
    </svg>
  );
}

/** The brand mark + wordmark lockup (the banner logo), for the expanded sidebar. */
export function DogwalkerWordmark({ height = 34, ...rest }: { height?: number } & SVGProps<SVGSVGElement>) {
  const width = Math.round((height * 220) / 64);
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 220 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Dogwalker"
      {...rest}
    >
      <defs>
        <linearGradient id="dwFurWm" x1="8" y1="56" x2="34" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: 'var(--dw-brand-2)' }} />
          <stop offset="1" style={{ stopColor: 'var(--dw-brand-1)' }} />
        </linearGradient>
      </defs>
      <svg x="0" y="4" width="56" height="56" viewBox="5 5 54 54">
        <rect x="8" y="30" width="26" height="26" rx="8" fill="url(#dwFurWm)" />
        <rect x="8.75" y="30.75" width="24.5" height="24.5" rx="7.25" style={{ stroke: 'var(--dw-brand-1)' }} strokeOpacity=".18" strokeWidth="1.5" />
        <path d="M15 38l4 3.5-4 3.5" style={{ stroke: 'var(--dw-on-accent)' }} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M23 45.5h6" style={{ stroke: 'var(--dw-on-accent)' }} strokeWidth="2.8" strokeLinecap="round" />
        <path d="M33 33C41 22 44 20 49 18" style={{ stroke: 'var(--dw-leash)' }} strokeOpacity=".35" strokeWidth="5" strokeLinecap="round" />
        <path d="M33 33C41 22 44 20 49 18" style={{ stroke: 'var(--dw-leash)' }} strokeWidth="3.2" strokeLinecap="round" />
        <circle cx="49" cy="16" r="8" style={{ fill: 'var(--dw-leash)' }} />
        <circle cx="49" cy="16" r="6.7" style={{ stroke: 'var(--dw-leash)' }} strokeWidth="1.3" opacity=".4" />
        <circle cx="49" cy="16" r="8" style={{ stroke: 'var(--dw-on-accent)' }} strokeWidth="2" opacity="0.22" />
      </svg>
      <text
        x="64"
        y="42"
        fontFamily="'Segoe UI', system-ui, -apple-system, Arial, sans-serif"
        fontSize="30"
        fontWeight="800"
        letterSpacing="-1"
        fill="currentColor"
      >
        Dogwalker
      </text>
    </svg>
  );
}
