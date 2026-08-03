# AGENTS.md — Guide for AI agents working on Dogwalker

You are working on **Dogwalker**: a free, cross-platform (macOS/Windows/Linux) Electron app that puts real terminals on an infinite canvas so AI coding agents can be orchestrated visually and talk to each other through a structured CLI protocol.

## Project status

v1.3.0 is in development.

## Invariants — do not violate without explicit human sign-off

These were deliberate decisions with reasoning behind them (see ARCHITECTURE.md for full context):

1. **Terminals are never static screenshots at working zoom levels.** The rendering degradation ladder (WebGL → throttled DOM renderer → suspended-offscreen) is the mechanism; per-terminal **renderer hot-swap at runtime** is a required capability of the terminal node component. ([§4](docs/ARCHITECTURE.md#4-terminal-rendering-the-degradation-ladder))
2. **`ask` captures the target's output; it needs no cooperation from the target.** The broker injects the message, waits for the target to go quiet (the focus-independent quiescence detector, §6), and returns the plain-text output it produced. There is no `reply` command — requiring the target to run one was fragile (plain shells and uncooperative agents never replied; `--stdin` deadlocked) so it was removed. This reverses the earlier "screen is not transport" rule after real-world testing; capturing is robust and works with any agent, shell, or process. ([§5.2](docs/ARCHITECTURE.md#52-ask--structured-messaging-via-captured-output))
3. **PTY injection is one atomic write**: bracketed-paste open + body + close + CR in a single `write()`. Never split it, never sleep between paste and Enter (splitting causes a visible flash in the target TUI). Wrap in bracketed paste only if the target has DEC mode 2004 active (tracked by the headless mirror). ([§5.2](docs/ARCHITECTURE.md#52-ask--structured-messaging-via-captured-output))
4. **No logic in the CLI shim.** Authorization, routing, and state live in the host broker; the shim parses argv, sends one JSON request with `DOGWALKER_TERMINAL_ID`, streams the response. ([§5.1](docs/ARCHITECTURE.md#51-transport))
5. **Authorization = the connection graph.** A terminal's CLI requests can only reach nodes it is wired to; Walker verbs additionally require the Walker flag. No ambient authority. ([§11](docs/ARCHITECTURE.md#11-security-posture))
6. **Agents are vendor-agnostic launch configs.** Dogwalker talks to agents only via PTY writes and the CLI protocol. Never add per-vendor code paths, API calls to model providers, or TUI-specific parsing. Images go to agents as temp-file paths in the prompt — the single uniform mechanism.
7. **Floors are git worktrees.** No filesystem-specific tricks (no APFS/CoW dependencies). Worktree constraints (one checkout per branch; untracked files need setup hooks) are surfaced to the user, not worked around.
8. **Attention detection uses OSC 133** (fallback: output quiescence), running on the headless mirror. UI focus suppresses the *notification only*, never the detection.
9. **Everything local, zero telemetry, open file formats** (markdown notes, JSON layouts, JSONL message history). The product is 100% free: no license checks, no tiers, no payment code.
10. **Out of scope — do not add:** command palette / full-text search, built-in local LLM assistant, remote execution environments (SSH/Docker provisioning), MCP server, i18n. Rationale in [PRODUCT.md §1 non-goals](docs/PRODUCT.md#non-goals-explicitly-out-of-scope) and [§5.3](docs/PRODUCT.md#53-the-cli-is-the-entire-api).

## Conventions

- **Language:** TypeScript throughout; strict mode.
- **Naming:** the product/CLI/env-var prefix is `dogwalker` / `DOGWALKER_*`. Dogwalker is a clean-room product: never reference other products in this category — their names, branding, or documentation text — in code, UI, or docs.
- **Process placement:** capability → main-process broker; presentation → renderer. If a feature is reachable by both the UI and the CLI, there is exactly one implementation (in the broker) and two thin callers.
- **Docs stay truthful:** when behavior lands or changes, update `docs\*.md` (just where necessary) in the same change.
