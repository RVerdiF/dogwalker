<div align="center">

# Dogwalker

**Walk all your agents at once.**

An infinite canvas for AI coding agents: real terminals as nodes on a zoomable 2D surface. Put them on a leash — wire terminals together and your agents talk to each other through a structured protocol. Cross-platform. Local. Free.

*macOS · Windows · Linux — status: pre-alpha (design phase)*

[Product](PRODUCT.md) · [Architecture](ARCHITECTURE.md) · [Agent guide](AGENTS.md)

</div>

---

## Why

Running multiple AI coding agents today means a pile of terminal tabs: no spatial context, no way for agents to cooperate, no view of the whole operation. Existing "agent canvas" tools are single-platform and paid.

Dogwalker gives you one infinite canvas per project where every terminal is a live node. Zoom out and watch your team of agents work; zoom in and talk to one. Connect two terminals and their agents can message each other, review each other's code, and share notes — through a real request/reply protocol, not screen scraping.

```
        ┌──────────┐  ask/reply   ┌──────────┐
        │  Claude   │◄────────────►│  Codex    │
        │  (Lead)   │              │  (Coder)  │
        └────┬─────┘              └────┬─────┘
             │ reads/writes            │ check
        ┌────▼─────┐              ┌────▼─────┐
        │ SPEC.md   │              │ dev server│
        │ (note)    │              │ (terminal)│
        └──────────┘              └──────────┘
```

## Features

- **Infinite canvas** — Figma-style pan/zoom, groups, snapping, align/tidy, minimap, freehand drawing for architecture sketches.
- **Real terminals** — actual PTYs with GPU-accelerated rendering, 1–9 quick-jump, themes, per-terminal memory limits. Terminals stay visibly alive at every zoom level.
- **Agents as launch configs** — an agent is just a command auto-run in a terminal. Ships with presets for Claude Code, Codex, Gemini CLI, OpenCode, and aider; add any command you want.
- **Inter-agent messaging** — wire terminals and agents use the `dogwalker` CLI (alias: `walk`) to `ask` each other questions and `reply` with byte-exact answers. Click any leash to see the full message history.
- **`check` anything** — agents can read the live screen of *any* connected terminal: another agent, a build, a dev server, a log tail.
- **Walker mode** — promote an agent to manager: it recruits, wires, re-roles, and dismisses its own team via CLI.
- **Notes** — markdown files on disk rendered as sticky notes; agents read and edit connected notes; chain notes into mind-maps.
- **Prompt Composer** — floating rich-text input with @-mentions of terminals/notes/portals and image paste (delivered to agents as file paths — works with every major agent CLI).
- **File Tree** — embedded file manager with list/grid/git-diff/git-graph views, drag-to-agent, and a built-in code editor.
- **Portals** — isolated embedded browsers agents can drive: navigate, click, type, screenshot, run JS, read DOM and console. Link portals to share sessions.
- **Floors** — parallel isolated copies of your repo via git worktrees, each with its own canvas layer and terminals; "Land" merges back when done. Setup/teardown hooks included.
- **Routines** — scheduled prompts (single or `&&`-chained) on any agent, for recurring tests, health checks, review sweeps.
- **Workspaces** — per-project canvases with saved layouts, background operation, and one-click hibernation.

## Install

> Dogwalker is in the design/spike phase — there are no releases yet. The instructions below describe the intended flow.

**Requirements:** Node.js 20+, git (for Floors and git views).

```bash
git clone https://github.com/<you>/dogwalker
cd dogwalker
npm install
npm start
```

Packaged builds (dmg / exe / AppImage) will ship once the core stabilizes.

## Quick start

1. **Create a workspace** — point it at a project directory.
2. **Draw a terminal** — pick the Terminal tool, drag a rectangle, choose an agent preset (or a plain shell).
3. **Draw a second terminal**, then **connect them** — select one, press the connection shortcut, click the other.
4. **Ask across the wire** — in terminal A's agent, type: *"use dogwalker to ask Reviewer to look at auth.ts"*. The agent runs `dogwalker ask reviewer "…"` and blocks until the reviewer replies with `dogwalker reply <id> --stdin`.
5. **Watch** — zoom out; attention dots light up when an agent finishes and waits for you.

## Compatibility

### AI agents

Any tool launchable as a command works. Tested presets:

| Agent | Messaging (`ask`/`reply`) | Images via composer | Notes/Portals via CLI |
|---|---|---|---|
| Claude Code | ✅ | ✅ (file path) | ✅ |
| Codex CLI | ✅ | ✅ (file path) | ✅ |
| Gemini CLI | ✅ | ✅ (file path) | ✅ |
| OpenCode | ✅ | — | ✅ |
| aider | ✅ | ✅ (file path) | ✅ |
| Any script / plain shell | Connected AI agents can watch this terminal's live screen via `check` (builds, dev servers, log tails); the script itself can also call the CLI | — | ✅ |

Agents learn the CLI through a skill installed in your agent-skills folder — no per-vendor integration, no MCP configuration.

### Platforms & terminals

| | macOS 13+ | Windows 10/11 | Linux |
|---|---|---|---|
| PTY backend | node-pty (forkpty) | node-pty (ConPTY) | node-pty (forkpty) |
| Shells | zsh, bash, fish | PowerShell, WSL | bash, zsh, fish |
| GPU terminal rendering | ✅ | ✅ | ✅ |
| Floors (git worktree) | ✅ | ✅ | ✅ |

## Architecture at a glance

Electron app, two halves: a **host daemon** (main process) owning PTYs, the IPC socket, the message broker, portals (CDP), floors, and routines — and a **canvas UI** (renderer) built on tldraw with xterm.js terminal nodes. The `dogwalker` CLI available inside canvas terminals is a thin shim over the daemon's socket; **all** agent-facing capability flows through one broker, gated by the connection graph.

Highlights worth reading about:

- [Terminal rendering degradation ladder](ARCHITECTURE.md#4-terminal-rendering-the-degradation-ladder) — how dozens of live terminals stay smooth on a zoomable canvas.
- [The ask/reply protocol](ARCHITECTURE.md#5-the-ipc-bus--dogwalker-cli) — structured messaging with atomic bracketed-paste injection.
- [Attention detection](ARCHITECTURE.md#6-attention-detection) — OSC 133 shell integration instead of vendor heuristics.
- [Floors on git worktrees](ARCHITECTURE.md#8-floors-git-worktrees) — cross-platform parallel workspaces.

Full docs: [PRODUCT.md](PRODUCT.md) (what & why) · [ARCHITECTURE.md](ARCHITECTURE.md) (how) · [AGENTS.md](AGENTS.md) (for AI agents working on this codebase).

## Privacy

Everything runs locally. No accounts, no telemetry, no cloud services. Notes are plain markdown on your disk; workspace layouts are plain JSON.

## License

Free and open source. License file to be added (MIT intended).

## Status & roadmap

- [ ] **Spike** — 15 live agent terminals on a tldraw canvas with renderer hot-swap (validates the whole architecture)
- [ ] Broker + `dogwalker` CLI (`ask` / `reply` / `check`) + agent skill
- [ ] Workspaces, notes, composer, connections UI
- [ ] File tree, portals, floors, routines, Walker mode
- [ ] Packaged releases

Contributions and issue reports are welcome once the spike lands.
