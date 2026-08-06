# Dogwalker 1.0 — an infinite canvas for AI coding agents

---

Running several AI coding agents today means a wall of terminal tabs: no spatial
context, no way for the agents to cooperate, no view of the whole operation.

**Dogwalker** puts real terminals as nodes on an infinite, zoomable canvas — and
lets you **put them on a leash**. Wire two agents together and they talk through
a small, uniform CLI: `dogwalker ask reviewer "check auth.ts"` delivers the
message, waits for the reviewer to finish, and hands its answer straight back.
No per-vendor integrations, no MCP config — any agent that runs in a terminal
just works.

Currently:

- **Roles & presets** — reusable, persisted launch presets and Markdown
  role instructions. Define a role once, pair it with a preset when recruiting,
  and reassign a live terminal's role without dropping its leashes.
- **Team operations & contracts** — ask every directly connected teammate at
  once (`dogwalker ask --all`), each independently authorized, with results as a
  stable JSON envelope. A **contract** binds an answer to a JSON Schema:
  `ask --contract` re-asks the peer until its JSON validates (up to the contract's
  attempt budget), then hands back just that object — or a configured fallback
  once attempts run out. Machine-readable outcomes, no screen scraping.
- **Refined interface** — one line-style SVG icon set across the whole canvas
  chrome, the Dogwalker wordmark in the sidebar, and a built-in icon picker for
  terminal presets.
- **Canvas & terminals** — GPU-rendered xterm nodes with a degradation ladder so
  dozens stay smooth; attention dots when an agent needs you; groups, snapping,
  themes.
- **The CLI is the whole API** — `ask` / `check` / `list` / `note` / `portal` /
  `recruit`, every capability gated by what you've wired together. No ambient
  authority.
- **File Tree** — browse, edit (CodeMirror), review git diffs and a branch-lane
  graph, and hand files or selections to an agent, without leaving the canvas.
- **Portals** — embedded, automatable browsers an agent drives from the CLI
  (navigate, click, type, screenshot) — its eyes and hands on the web.
- **Floors** — git-worktree layers so parallel work never collides; Land merges a
  floor back with a safe conflict abort.
- **Automation** — Routines run scheduled agent chores; Walker agents recruit and
  manage a team of sub-agents.

**Local, zero telemetry, 100% free (MIT).** Notes are markdown, layouts are JSON,
history is JSONL — your data, open formats, on your disk.

Grab an installer for macOS, Windows, or Linux from the
[release page](https://github.com/caribeedu/dogwalker/releases/latest). Installers
are currently unsigned (first-launch Gatekeeper/SmartScreen warnings are expected
and documented); signing is on the way.

Built in the open — the whole thing was developed version-by-version with its own
roadmap; see [ROADMAP.md](ROADMAP.md) and [CHANGELOG.md](CHANGELOG.md).
