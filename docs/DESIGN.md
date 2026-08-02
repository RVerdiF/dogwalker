# Dogwalker — Design System

The visual language for Dogwalker: a calm, dark **"night canvas"** where the
color comes from the metaphor — a **golden-retriever** coat on the nodes and a
**red leash** on the connections. Modern, geometric, low-chrome — the UI recedes
so the agents and their leashes are what you see.

The source of truth for color/spacing is the CSS custom-property block at the top
of [`src/index.css`](../src/index.css) (`:root`). This doc explains the intent.

## Brand

- **Name:** Dogwalker · **Tagline:** *Walk all your agents at once.*
- **Metaphor:** terminals are nodes; a **leash** wires two together so their
  agents talk. The logo is that metaphor — a terminal node, a leash curve, and
  the agent on the end of it.
- **Personality:** technical but friendly; precise, not sterile; playful accent,
  serious surface.

Assets in [`assets/`](../assets): `logo.svg` (mark / favicon),
`hero.svg` (README banner).

## Color

Dark, layered surfaces + one warm brand gradient + semantic pops. Tokens:

| Token | Hex | Use |
|---|---|---|
| `--dw-bg` | `#0E0F13` | canvas / app background (deepest) |
| `--dw-surface-1` | `#131319` | rails, bars |
| `--dw-surface-2` | `#16181F` | panels, cards, node bodies |
| `--dw-surface-3` | `#1B1E26` | raised (headers, menus) |
| `--dw-border` | `#262A33` | hairlines |
| `--dw-border-strong` | `#333A47` | inputs, emphasis |
| `--dw-text` | `#E6E8EE` | primary text |
| `--dw-text-dim` | `#CFD3DC` | body |
| `--dw-text-muted` | `#8B90A0` | labels |
| `--dw-text-faint` | `#6F7686` | hints, gutters |
| `--dw-accent` | `#E8B565` | golden — primary interactive (selection, focus, links, active) |
| `--dw-brand-1 → 2` | `#EEC079 → #C87F3C` | golden-coat gradient (logo, primary CTA) |
| `--dw-leash` | `#E6533C` | red — connections / leashes / attention |
| `--dw-success` | `#7EE0A8` · **warn** `#E0A35A` · **danger** `#F0A0A0` · **note** `#E0CF7A` | status |

The identity is literal: **golden = the dog/terminal (nodes, interaction)**,
**red = the leash (connections, attention)**. Leash edges on the canvas render in
`--dw-leash`; node selection and focus in `--dw-accent`.

**Rules**
- One accent per view. `--dw-accent` for interaction; the brand **gradient** only
  for identity + the primary call-to-action (never body text).
- Leash red (`--dw-leash`) means *connection/attention*, not decoration.
- Never put text below `--dw-text-muted` on `--dw-bg` (contrast floor).

## Type

- **UI:** `--dw-sans` = `'Segoe UI', system-ui, -apple-system, sans-serif`.
- **Code / terminals / paths:** `--dw-mono` = `ui-monospace, 'Cascadia Code', 'Fira Code', monospace`.
- Scale (px): 11 micro · 12 label · 13 body · 15 section · headings 800-weight,
  tight letter-spacing (the wordmark is `-1.5`).

## Shape & depth

- Radii: `--dw-r-sm 6` (chips/inputs) · `--dw-r-md 8` (cards/nodes) ·
  `--dw-r-lg 12` (dialogs/rail) · `--dw-r-pill 999`.
- Elevation: one shadow token `--dw-shadow` = `0 10px 30px rgba(0,0,0,.45)` for
  floating surfaces (menus, dialogs). Flat surfaces use borders, not shadows.
- Focus: `--dw-ring` = `0 0 0 2px rgba(232,181,101,.28)` on the accent.

## Components

- **Buttons** — `.dw-btn-small` (ghost, hairline) for inline actions;
  `.dw-btn-primary` carries the **brand gradient** (the one place it appears in
  chrome). `.dw-btn-danger` tints text `--dw-danger`.
- **Nodes** — `--dw-surface-2` body, `--dw-surface-3` header (the drag handle),
  `--dw-r-md` corners; selected = accent border + `--dw-ring`.
- **Leashes** — always `--dw-leash` (red); selected leashes brighten.
- **Chips / pills** — `--dw-r-pill`, `--dw-surface-2`, hairline border; active
  chips take the accent border + ring.
- **Menus / dialogs** — `--dw-surface-3`/`2`, `--dw-border-strong`, `--dw-shadow`.

## Iconography

Emoji as functional glyphs (fast, cross-platform, on-brand-playful): 🐕 brand ·
🧱 floor · 👑 Walker · 🌐 portal · 🗂 file tree · 📝 note · ⏱️ routine. Line
actions (`×` close, `⟳` refresh, `↻` restart, `⤒` land, `⧉` link) stay in
`--dw-text-muted`, brightening on hover.
