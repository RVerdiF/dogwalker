# Changelog

All notable changes, newest first. Dogwalker is a free, local, cross-platform
canvas for AI coding agents.

## 1.2.1 — Unreleased

- Single response-contract asks now emit only the validated result object;
  `--strict` preserves it while exiting non-zero on rejection.
- Contracts can persist a post-rejection prompt, injected with validation errors
  without an implicit retry.
- Public documentation moved to `docs/`; `README.md` remains the GitHub landing
  page and `AGENTS.md` remains at the repository root.

## 1.2.0 — Team Operations & response contracts

- Authorized team asks, JSON envelopes, grouped broadcast history and local
  response contracts with broker-side validation.

## 1.1.0 — Roles, Presets & brand polish

- Persistent preset and role libraries, role-context delivery, Walker
  integration and refreshed vector identity assets.

## 1.0.0 — Launch

First public release. The full [PRODUCT.md](PRODUCT.md) shape is built and
audited ([PARITY.md](PARITY.md)); known limitations (unsigned installers,
Windows-verified QA) are documented in the [README](../README.md).

Cumulative feature set:

### Canvas & terminals (v0.1–v0.2)
- Infinite React Flow canvas: terminal nodes (xterm.js), leashes, minimap,
  pan/zoom, node create/move/resize/duplicate/delete.
- Rendering degradation ladder (WebGL → DOM → suspended) with per-terminal
  hot-swap; headless mirror per PTY.
- Five agent presets + shell, names/badges, dark/light + custom themes,
  attention system (OSC 133 + output quiescence), per-terminal memory limits.
- Grid + magnetic snapping, align/distribute/tidy, groups; workspace sidebar
  with dividers and a mini/expanded rail; background workspaces + hibernate.

### Connections & the CLI (v0.1)
- The broker + `dogwalker`/`walk` shim: `ask` (capture-based, no `reply`),
  `check`, `list`, `connect`/`disconnect`, `note read|append|write`. Authorization
  is strictly the connection graph. Notes on disk; floating Prompt Composer with
  drafts, image paste, and @-mentions.

### File Tree & visual context (v0.3)
- File Tree node: list view, file ops, drag-to-terminal / drag-to-canvas, git
  diff + branch-lane graph, embedded CodeMirror 6 editor with send-to-agent,
  fuzzy filename + `>`-content search. Notes gained image paste.

### Portals (v0.4)
- Embedded, automatable browsers: one `WebContentsView` per portal; the `portal`
  CLI (navigate/click/type/scroll/js/dom/console/screenshot), gated by the graph;
  linked portals sharing a session; agent-created portals.

### Floors (v0.5)
- Git-worktree layers of a workspace: create/switch/delete, Land (merge + safe
  conflict abort), setup/run/teardown hooks with `DOGWALKER_*` env; floor-aware
  `list` and cross-floor `ask`.

### Automation (v0.6)
- Routines: scheduled `&&`-chained prompts that wait on agent turns, with live
  status. Walker mode: `recruit`/`dismiss`/`assign` manager verbs; recruits wired
  to their Walker, cross-floor recruiting.

### Hardening & release (v0.7–v0.8)
- Failure recovery (orphan-worktree reconcile, fast-fail to dead targets,
  terminal restart, portal-crash reload); CLAUDE.md↔AGENTS.md sync; invariant
  audit. Per-OS installers (electron-forge), MIT license, versioned skill with
  mismatch warning, GitHub Actions CI (PR checks + tag build matrix).
