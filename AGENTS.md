# AGENTS.md — Guide for AI agents working on Dogwalker

You are working on **Dogwalker**: a free, cross-platform (macOS/Windows/Linux) Electron app that puts real terminals on an infinite canvas so AI coding agents can be orchestrated visually and talk to each other through a structured CLI protocol.

## Read this first

| Doc | What it covers | Read when |
|---|---|---|
| [PRODUCT.md](PRODUCT.md) | What Dogwalker is: every feature in detail, core concepts (workspace, node, agent, connection, floor, portal, routine), compatibility targets, product principles, explicit non-goals. | Before designing or changing any user-facing behavior. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How it's built: stack (Electron + React Flow + xterm.js/node-pty), process model (host daemon vs renderer), terminal subsystem, rendering degradation ladder, the IPC broker and `dogwalker` CLI protocol (ask/reply/check), attention detection, floors, portals, persistence, security, build order. | Before writing or reviewing any code. |
| [README.md](README.md) | Public-facing overview: pitch, features, install/quick start, compatibility tables, architecture summary with deep links. | To understand how the project presents itself; keep it in sync when features land. |
| [ROADMAP.md](ROADMAP.md) | The version path v0.0.1 (alpha spike) → v0.1–v0.6 (feature versions) → v0.7 (hardening) → v0.8 (release engineering) → v1.0 (launch): per-version expectations, outputs, and measurable exit criteria. | Before starting any work, to know what belongs in the current version — anything not listed for the version is deferred by default. |

## Project status

v0.0.1 spike **PASSED** (2026-07-19; findings in [ARCHITECTURE.md §13](ARCHITECTURE.md#13-spike-findings-v001--passed-2026-07-19-windows-11)). The spike app lives in `src/` (Electron Forge + Vite; main: `src/main.ts` + `src/main/`, renderer: `src/renderer.tsx` + `src/app/`); automated self-check via `DW_SMOKE=1 npm start` (`DW_SOAK`, `DW_QUIET`, `DW_SOAK_MIN` refine it). Current milestone: **v0.1 — the core loop** ([ROADMAP.md](ROADMAP.md#v01--the-core-loop)); anything not listed there is deferred by default.

## Invariants — do not violate without explicit human sign-off

These were deliberate decisions with reasoning behind them (see ARCHITECTURE.md for full context):

1. **Terminals are never static screenshots at working zoom levels.** The rendering degradation ladder (WebGL → throttled DOM renderer → suspended-offscreen) is the mechanism; per-terminal **renderer hot-swap at runtime** is a required capability of the terminal node component. ([§4](ARCHITECTURE.md#4-terminal-rendering-the-degradation-ladder))
2. **The screen is presentation, not transport.** Agent replies travel through the broker (`dogwalker reply <id> --stdin`), never by scraping terminal output. `check` is the only screen-reading verb and it is read-only. ([§5.2](ARCHITECTURE.md#52-ask--reply--structured-messaging-not-screen-scraping))
3. **PTY injection is one atomic write**: bracketed-paste open + body + close + CR in a single `write()`. Never split it, never sleep between paste and Enter (splitting causes a visible flash in the target TUI). Wrap in bracketed paste only if the target has DEC mode 2004 active (tracked by the headless mirror). ([§5.2](ARCHITECTURE.md#52-ask--reply--structured-messaging-not-screen-scraping))
4. **No logic in the CLI shim.** Authorization, routing, and state live in the host broker; the shim parses argv, sends one JSON request with `DOGWALKER_TERMINAL_ID`, streams the response. ([§5.1](ARCHITECTURE.md#51-transport))
5. **Authorization = the connection graph.** A terminal's CLI requests can only reach nodes it is wired to; Walker verbs additionally require the Walker flag. No ambient authority. ([§11](ARCHITECTURE.md#11-security-posture))
6. **Agents are vendor-agnostic launch configs.** Dogwalker talks to agents only via PTY writes and the CLI protocol. Never add per-vendor code paths, API calls to model providers, or TUI-specific parsing. Images go to agents as temp-file paths in the prompt — the single uniform mechanism.
7. **Floors are git worktrees.** No filesystem-specific tricks (no APFS/CoW dependencies). Worktree constraints (one checkout per branch; untracked files need setup hooks) are surfaced to the user, not worked around.
8. **Attention detection uses OSC 133** (fallback: output quiescence), running on the headless mirror. UI focus suppresses the *notification only*, never the detection.
9. **Everything local, zero telemetry, open file formats** (markdown notes, JSON layouts, JSONL message history). The product is 100% free: no license checks, no tiers, no payment code.
10. **Out of scope — do not add:** command palette / full-text search, built-in local LLM assistant, remote execution environments (SSH/Docker provisioning), MCP server, i18n. Rationale in [PRODUCT.md §1 non-goals](PRODUCT.md#non-goals-explicitly-out-of-scope) and [§5.3](PRODUCT.md#53-the-cli-is-the-entire-api).

## Conventions

- **Language:** TypeScript throughout; strict mode.
- **Naming:** the product/CLI/env-var prefix is `dogwalker` / `DOGWALKER_*`. Dogwalker is a clean-room product: never reference other products in this category — their names, branding, or documentation text — in code, UI, or docs.
- **Process placement:** capability → main-process broker; presentation → renderer. If a feature is reachable by both the UI and the CLI, there is exactly one implementation (in the broker) and two thin callers.
- **Docs stay truthful:** when behavior lands or changes, update PRODUCT.md (behavior), ARCHITECTURE.md (mechanism), and README.md (public surface) in the same change.

## Key vocabulary (full definitions in [PRODUCT.md §2](PRODUCT.md#2-core-concepts))

Workspace · Canvas · Node · Terminal · Agent (a terminal launch config) · Connection · Role · Floor (git-worktree copy) · Portal (embedded automatable browser) · Routine (scheduled prompt) · Walker (manager agent) · Broker (host-side message/state authority) · Shim (`dogwalker` CLI binary) · Headless mirror (main-process xterm-headless per PTY).
