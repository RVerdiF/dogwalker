/**
 * Modern line-style icon set (24×24, stroke = currentColor) used across the
 * canvas chrome so buttons carry crisp vector glyphs instead of emoji/text.
 * Each icon inherits color from its button and scales with `size`.
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
