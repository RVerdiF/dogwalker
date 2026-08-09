# Dogwalker — Product Definition

> An infinite canvas where AI coding agents live in real terminals, talk to each other, and you hold every leash. Cross-platform. Free.

This document defines **what** Dogwalker is and every feature in detail. For **how** it is built, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 1. Vision

Developers increasingly run several AI coding agents at once — Claude Code reviewing what Codex wrote, a tester agent hammering what a coder agent produced. Today that means a pile of disconnected terminal tabs with no spatial context, no inter-agent communication, and no way to see the whole operation at a glance.

Dogwalker replaces the tab pile with a single **infinite 2D canvas** where each terminal is a node. Terminals can be wired together so agents communicate directly through a first-class CLI protocol. Notes, file trees, and embedded browsers live on the same canvas. You zoom out to see your agent team working; you zoom in to interact with one of them.

### Positioning

Existing tools in the "agent orchestration canvas" category are single-platform (recent-macOS/Apple-Silicon-only) and paid. Dogwalker differentiates on:

| | Dogwalker |
|---|---|
| **Platforms** | macOS, Windows, Linux |
| **Price** | 100% free. No license keys, no tiers, no telemetry. |
| **Agent messaging** | Structured `ask` protocol with captured output and per-connection message history — not screen scraping. |
| **Agent model** | An "agent" is any command auto-executed in a terminal. No hardcoded vendor list. |

### Non-goals (explicitly out of scope)

- **Command palette / global full-text search** — not needed; navigation is spatial.
- **Built-in local LLM assistant** — agents in terminals *are* the assistants.
- **Remote execution environments** (SSH / Docker provisioning, bridges, tokens) — terminals run locally. A user can still `ssh` or `docker exec` manually inside any terminal.
- **MCP server** — the CLI is the single, universal API surface (see §5.3 for why).
- **Licensing, payments, auto-update infrastructure, i18n** — free product, English-first.

---

## 2. Core concepts

| Concept | Definition |
|---|---|
| **Workspace** | A project container: working directory, icon, saved canvas layout, terminal configs. Multiple workspaces run simultaneously; inactive ones can hibernate. |
| **Canvas** | The infinite 2D space of a workspace. Hosts all nodes. Pan/zoom follows design-tool conventions (Figma-style). |
| **Node** | Anything placed on the canvas: Terminal, Note, File Tree, Portal. |
| **Terminal** | A real local PTY rendered on the canvas. May run a plain shell or an **agent**. |
| **Agent** | A terminal launch configuration: a command that is auto-executed when the terminal spawns (e.g. `claude`, `codex`, `aider`, or any script). Dogwalker interacts with it exclusively as simulated user input — no vendor-specific integration. |
| **Connection** | An animated leash between two nodes. Defines who can talk to whom via the CLI. |
| **Role** | A named instruction set (e.g. Lead, Coder, Reviewer, Tester) attachable to a terminal, delivered to the agent as context. |
| **Contract** | A named, local record binding an agent turn to a JSON Schema. Used with `ask --contract`, the broker re-asks the peer until its JSON answer validates (up to a configured attempt budget), then returns it — or a configured fallback value once attempts run out. Also holds a per-attempt timeout and a rejection prompt. |
| **Floor** | An isolated working copy of the repository (git worktree) with its own canvas layer, for parallel branches of work. |
| **Portal** | An embedded, automatable browser window on the canvas. |
| **Routine** | A prompt (or chain of prompts) scheduled to run on an agent at an interval. |

---

## 3. The Canvas

The heart of the product. An infinite 2D surface per workspace floor.

### 3.1 Node creation & manipulation
- Toolbar tools: Select, Terminal, Note, File Tree, Portal, Connection.
- Click-drag to draw a node rectangle; sizes snap to a grid.
- Move (drag header), resize (edges/corners), duplicate (alt-drag / context menu), delete (shortcut / context menu).
- Focus shortcut centers the viewport on the selected node; with multiple nodes selected, zooms to fit selection.

### 3.2 Navigation
- Trackpad: two-finger pan, pinch zoom. Mouse: wheel/middle-drag pan, ctrl+wheel zoom, space+drag pan.
- Keyboard: zoom in/out, arrow-step between connected nodes, cycle through terminals needing attention, toggle minimap.

### 3.3 Organization
- **Groups**: labeled frames binding nodes; move together, survive copy/paste and undo/redo.
- **Align / distribute / tidy**: right-click alignment ops; "tidy" arranges a selection into an aligned grid.
- **Magnetic snapping** to adjacent node edges and gaps.

### 3.4 Always-alive terminals
Terminals on the canvas are never replaced by static screenshots at normal working scales. At low zoom they keep animating at a reduced refresh rate — you must always be able to *see the team working*. (This is a product requirement with direct architectural consequences; see [ARCHITECTURE.md §4](ARCHITECTURE.md#4-terminal-rendering-the-degradation-ladder).)

---

## 4. Terminals & Agents

### 4.1 Terminals
- Real local PTYs (zsh/bash/fish on macOS & Linux, PowerShell/WSL via ConPTY on Windows).
- Named, with icons, for quick identification.
- Themeable: built-in color schemes + user-supplied custom themes, with a follow-system light/dark toggle. **One theme colors everything** — selecting it recolors the terminals *and* the whole interface chrome (the chrome tokens are derived from the theme's palette), so any theme, built-in or custom, themes the app too.
- Per-terminal memory limit (a per-terminal setting, off by default): if the foreground process tree exceeds it, Dogwalker kills the offender and preserves the shell.
- Number badges (hold modifier) for quick jump to terminals 1–9.

### 4.2 Agents = launch configs
Creating a terminal offers **agent presets**: a preset is a display name, an icon, and a command line to auto-execute on spawn. The creation palette can pair its selected preset with an optional role. Dogwalker ships presets for Claude Code, Codex, Gemini CLI, OpenCode, and aider — and users define arbitrary ones. There is no deeper vendor coupling: from spawn onward, everything Dogwalker sends to the agent is indistinguishable from user keystrokes.

### 4.3 Roles
- Preset and role libraries are persisted locally. The terminal header stores a
  preset for its next restart and applies a role immediately to its live PTY.
- Role delivery writes `.dogwalker/roles/<terminal-stable-id>.md` in the
  terminal working directory, then atomically injects a vendor-neutral prompt
  asking the agent to read it.
- A missing deleted preset or role is visibly recoverable in the terminal
  header: select a replacement; a preset replacement is used on restart.
- A role is a reusable instruction file assigned at terminal creation or later.
- Delivered to the agent as readable context (installed into the working directory and referenced by the skill).
- Reassignable at runtime without moving the node or dropping connections.
- Presets and roles are managed locally from the Panel; custom entries can be
  created, edited, duplicated and removed. A deleted role stays visibly
  recoverable on a referencing terminal until a replacement is selected.

### 4.4 Attention system
- When an agent finishes its current command / goes idle waiting for input, the terminal shows an attention dot and fires a system notification (a user-toggleable setting).
- Detection is based on shell/command lifecycle signals, not vendor heuristics (see [ARCHITECTURE.md §6](ARCHITECTURE.md#6-attention-detection)).
- If the user is actively focused on that terminal, the **notification** is suppressed (you're already looking at it) — detection itself keeps running.

---

## 5. Connections & the Dogwalker CLI

The differentiating feature. Wiring two nodes creates a real communication channel.

### 5.1 Wiring
- Create: select a node, use the Connection tool or shortcut, click the target.
- Visual styles: **leash** (default — a physics-animated cable that sways as nodes move) or **circuit** (axis-aligned traces with 90° turns).
- A badge on connected nodes opens a popover listing connections, with navigation and removal.

### 5.2 What connections enable
| Link | Capability |
|---|---|
| Terminal ↔ Terminal | Agents exchange structured messages (`ask` / `check`). |
| Terminal → Note | Agent reads/edits the note via CLI; persistent shared context. |
| Terminal → Portal | Agent drives the browser: navigate, click, type, screenshot, run JS, read DOM, read console. |
| Note → Note | Chains/mind-maps; an agent connected to the entry note can traverse the whole chain. |
| Portal ↔ Portal | Shared browser storage/session between portals. |

### 5.3 The CLI is the entire API
Inside every Dogwalker terminal (and only there), a `dogwalker` command is available (with `walk` as a short alias — same binary, same verbs). It is **the** way agents interact with the canvas — messaging, notes, portals, connections, recruiting. Agents learn it through a **skill** installed in the user's skills folder.

Core verbs:

```
dogwalker ask <node> "message"          # inject a message and return captured target output
dogwalker ask --all "message"            # ask every directly connected terminal
dogwalker ask <node> "message" --contract <name>  # loop until the answer matches the contract's JSON Schema
dogwalker contract list|inspect|create|edit|delete # manage saved contracts (schema, attempts, fallback)
dogwalker check <node>                  # read-only snapshot of a connected terminal's screen
dogwalker note read|append|write <note> # operate on a connected note
dogwalker portal <verb> ...             # drive a connected portal (navigate/click/type/screenshot/js/dom/console)
dogwalker connect <a> <b> / disconnect  # manage wiring
dogwalker list                          # nodes visible to this terminal: names, roles, connections
dogwalker <verb> ... --json             # any verb: machine-readable { ok, data } envelope
```

Design points:
- **`--json` on every verb.** Appending `--json` to any command returns a
  `{ "ok": true, "data": ... }` envelope instead of human text, so agents and
  scripts can parse results reliably; without it, output stays terminal-friendly.
- **`ask` captures output without target cooperation.** The broker injects the
  message, waits for target quiescence, and returns the output it produced; no
  `reply` command or cooperative TUI is required.
- **`check` works on non-agent terminals too.** An agent can watch a build, a dev server, a log tail — any process — because `check` just serializes the target's screen.
- **Every message is logged.** Click a connection cable to see the structured message history between those two nodes (who, what, when, captured output). This is only possible because messages flow through the host, and it is a capability screen-scraping designs cannot offer.
- **Why no MCP:** the CLI already covers every capability, works with *any* agent or script (or a human typing), needs zero per-vendor configuration, composes in pipelines (`dogwalker check builder | grep -i error`), and is trivially debuggable by hand. An MCP server would duplicate the whole surface for a subset of clients.

### 5.4 Team operations and contracts

An agent can ask one directly connected terminal, an explicit comma-separated
set, or every directly connected terminal (`ask --all`). Every target is still
authorized separately by the connection graph. A broadcast is a collection of
ordinary asks: one timeout or malformed response never discards the useful
responses from the others, and each connection retains its own history entry.

A **contract** is a persisted local record that makes an agent turn predictable
without adding a model-provider API. It holds a name, a **JSON Schema** the answer
must validate against, a **max-attempts** budget, a **timeout**, a **rejection
prompt**, and a **fallback value**. All of that lives on the contract — the only
thing the CLI passes is the message, the peer, and the contract name.

When an agent runs `dogwalker ask <peer> "message" --contract <name>`, contract
rules take over: the broker delivers the message, captures the peer's answer,
extracts a JSON object and validates it against the schema. If it doesn't match,
the broker re-asks the peer with the contract's rejection prompt and the specific
validation errors, and repeats — **up to the contract's attempt budget**. The
asker receives the validated JSON object as soon as one passes; once the attempts
run out, the asker receives the contract's **fallback value** instead (no error,
no hang). Every attempt is logged to the leash's history.

Contracts are created, edited (schema, attempts, timeout, rejection prompt,
fallback), duplicated and deleted locally from the Panel — or by an agent from
the CLI with `dogwalker contract list|inspect|create|edit|delete`. Deleting one
never breaks history or a running terminal; a later command simply reports that
the requested contract no longer exists.

### 5.5 Walker mode (manager agents)
A terminal flagged as **Walker** gains extra CLI verbs to manage a team:

```
dogwalker recruit --agent <preset> --role <role> [--floor <floor>]   # spawn a connected terminal
dogwalker dismiss <node>                                             # remove a recruit
dogwalker assign <node> --role <role>                                # reassign role in place
```

Recruits auto-position near their Walker. The broker resolves preset and role
names (or ids) from the same persisted libraries as the Panel; an invalid or
deleted entry returns a clear error. A recruited or reassigned role is
materialized and delivered immediately, while the recruit keeps its role id in
the persisted canvas layout, including on floors. Mention the Walker in the
Prompt Composer and instruct it in natural language: *"assemble a team: one coder on the API, one reviewer, one tester; share the SPEC note with all of them."*

---

## 6. Notes

Markdown files on disk, rendered as sticky notes on the canvas.

- **Editing:** two modes — raw (plain text) and formatted (live-rendered headings, tables, code blocks).
- **Images:** paste directly; stored alongside the note, rendered inline, readable by connected agents.
- **Naming:** auto-named from the first line; renameable to a stable name.
- **Storage:** in the workspace's notes folder by default; movable; external `.md`/`.txt` files can be dragged in from the OS file manager.
- **Chaining:** wire note↔note to build mind-maps; an agent connected to the entry note can traverse the whole chain.
- **Deletion:** deleting the node deletes the file (with confirmation).

## 7. Prompt Composer

A floating input that is an open chat, not bound to the selected terminal.

- **@-mentions address recipients:** type `@<name>` to mention one or more live terminals. On send, the full text — mentions included, never split — is delivered verbatim to each mentioned terminal, so addressing several at once lets each agent see what the others were told. Send is disabled until at least one terminal is mentioned.
- **Images:** paste screenshots/files; delivered to agents as a temp-file path injected into the prompt (uniform across Claude Code, Codex, Gemini CLI — anything that reads image paths). Temp files are cleaned up on session end.
- **Draft:** a single shared draft, persisted across workspace/floor switches and app restarts.

## 8. File Tree

An embedded file manager node; multiple independent instances per canvas.

- **Views:** list (hierarchical), icon grid (with previews), git diff (uncommitted changes side-by-side), git graph (commit history with branch lanes).
- **Ops:** create/rename/move/delete via context menu; drag files onto a terminal to hand paths to an agent; drag onto the canvas for a preview node.
- **Git:** branch indicator with commit, pull/push, checkout, branch, merge, fetch, stash.
- **Editor:** embedded code editor (syntax highlighting, find & replace, multi-cursor); selecting text offers "send to agent".
- **Search:** fuzzy file-name search within the node; `>`-prefixed content search with jump-to-line.

## 9. Portals

Embedded, automatable browser windows on the canvas.

- **Sessions:** each portal is an isolated browser session (own cookies/storage); portals can be linked to share a session (multi-account testing of the same site is a first-class use case).
- **Automation:** connected agents drive them through `dogwalker portal ...` — navigate, click, type, scroll, screenshot, execute JS, inspect DOM, read console — with no external browser-automation dependency, designed for token efficiency.
- **Agent-created:** agents can create portals themselves (`@New Portal` / CLI).

## 10. Floors

Parallel, isolated working copies of the project — context-switching without stashing.

- **Backing:** git worktrees — creating a floor runs `git worktree add` on a chosen/new branch. Near-instant, cross-platform, disk-cheap. Requires an initialized git repository; no filesystem-specific tricks (no APFS dependency).
- **Layers:** each floor gets its own canvas layer — the create dialog offers cloning the ground layout or starting empty — and its own terminals; dev servers and builds on different floors never collide.
- **Land:** commit, pick target branch, Dogwalker merges and removes the worktree. Diff stats and conflict detection shown; conflict *resolution* happens in your tools.
- **Hooks:** setup (on create — e.g. `npm install`, copy `.env`), run (on demand), teardown (on delete). Hooks receive env vars: floor name, branch, floor path, root path, project name.
- **Constraints** (inherent to worktrees, stated plainly in-app): a branch can be checked out in only one floor at a time; untracked files (deps, `.env`, build artifacts) don't come along — that's what setup hooks are for.

## 11. Routines

Scheduled prompts that run on an agent until paused or deleted.

- **Definition:** prompt text, interval, and target agent.
- **Chains:** `&&` lines chain steps; each step waits for the previous agent turn to complete.
- **Status:** a live indicator on active routines.
- **Use cases:** recurring test runs, health checks, periodic review sweeps, portal-based scraping into notes.

## 12. Workspaces & shell

Per-project containers with a saved canvas layout, switchable from a sidebar.

- **Sidebar:** workspaces, folders (same project, different directories) and group dividers; a compact icon-only mini sidebar.
- **Switching:** prev/next shortcuts and per-workspace number shortcuts.
- **Background & hibernate:** workspaces keep running in the background; right-click → hibernate releases all resources (terminals, agents, portals) and resumes on demand. On startup only the active workspace loads.
- **First run:** a fresh install seeds a friendly starting canvas (a welcome note) instead of a blank void.
- **Open in editor:** one-click open of the workspace directory (VS Code, etc.).
- **CLAUDE.md / AGENTS.md sync:** a per-workspace toggle for mixed-agent projects — mirrors edits both ways in the workspace directory; the newer file wins when enabled.

---

## 13. Compatibility targets

| Dimension | Support |
|---|---|
| OS | macOS 13+, Windows 10/11, mainstream Linux (X11/Wayland) |
| Agents | Anything launchable as a command. Presets: Claude Code, Codex, Gemini CLI, OpenCode, aider. |
| Shells | zsh, bash, fish; PowerShell & WSL on Windows |
| VCS | git (required only for Floors and File Tree git views) |

## 14. Principles

1. **Watchability.** The canvas must always show live activity; never freeze a working agent into a static image at working zoom levels.
2. **Vendor-agnostic by construction.** If it runs in a terminal, it's a first-class agent. Dogwalker speaks to agents only through the PTY and the CLI protocol.
3. **Structured over scraped.** Anything that can be a protocol message (replies, note edits, portal commands) must be one — the screen is presentation, not transport.
4. **Local and private.** Everything on-device, zero telemetry, files on disk in open formats (markdown notes, JSON layouts).
5. **Free forever.** No tiers, no keys, no upsell.
