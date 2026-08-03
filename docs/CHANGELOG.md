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

First public release — the full [PRODUCT.md](PRODUCT.md) shape, built and
audited. Cumulative feature set:

- Infinite React Flow canvas: terminal (xterm.js), note, file-tree and portal
  nodes; leashes, minimap, pan/zoom, create/move/resize/duplicate/delete, grid +
  magnetic snapping, align/distribute/tidy, groups.
- Terminals: rendering degradation ladder (WebGL → DOM → suspended) with
  per-terminal hot-swap and a headless mirror per PTY; five agent presets +
  shell, names/badges, dark/light + custom themes, attention (OSC 133 + output
  quiescence), per-terminal memory limits.
- Broker + `dogwalker`/`walk` shim: `ask` (capture-based, no `reply`), `check`,
  `list`, `connect`/`disconnect`, `note read|append|write`, `portal`, Walker
  `recruit`/`dismiss`/`assign` — all authorized strictly by the connection graph.
  Floating Prompt Composer with per-terminal drafts, image paste and @-mentions.
- File Tree: list view, file ops, drag-to-terminal / drag-to-canvas, git diff +
  branch-lane graph, embedded CodeMirror 6 editor with send-to-agent, fuzzy
  filename + `>`-content search.
- Portals: one isolated `WebContentsView` per portal, the CDP-backed `portal`
  CLI, linked portals sharing a session, agent-created portals.
- Floors: git-worktree layers with create/switch/delete, Land (merge + safe
  conflict abort), setup/run/teardown hooks with `DOGWALKER_*` env, floor-aware
  `list` and cross-floor `ask`.
- Automation: Routines (scheduled `&&`-chained prompts that wait on agent turns)
  and Walker mode.
- Workspaces: sidebar with dividers and a mini/expanded rail, background
  operation + hibernate, open-in-editor, CLAUDE.md↔AGENTS.md sync.
- Release: failure recovery (orphan-worktree reconcile, fast-fail to dead
  targets, terminal restart, portal-crash reload), per-OS installers
  (electron-forge), MIT license, versioned skill with mismatch warning, and
  GitHub Actions CI (PR checks + tag build matrix).
