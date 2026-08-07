# Changelog

All notable changes, newest first. Dogwalker is a free, local, cross-platform
canvas for AI coding agents.

## 1.3.2

- Fix: opening a terminal that has both a preset and a role no longer injects the
  role before the agent launches. The preset command now starts the agent first,
  and the role is delivered only once the agent has booted and gone quiet — so it
  reads its role instead of the role landing in the bare shell.

## 1.3.1

- Release engineering: run CI on Node 24 (was 20). The v1.3.0 test/build
  dependencies (Vitest, jsdom, `@testing-library/jest-dom`, Electron 43) require
  Node 22+, and the lockfile is generated with the npm that ships with Node 24,
  so `npm ci` and `npm test`/`npm run make` now match locally and in CI.

## 1.3.0

- Contracts are now driven by a full **JSON Schema** (validated with Ajv). Using
  `ask --contract <name>` runs a bounded validate-until-valid loop: the broker
  re-asks the peer with the contract's rejection prompt and the validation errors
  until the answer matches, then returns just that JSON object — or the contract's
  configured fallback value once the attempt budget runs out. Attempts, timeout,
  rejection prompt and fallback all live on the contract; the CLI passes only the
  message, peer, and contract name. Removes `--strict` and the old required-fields
  model. Renamed "response contracts" to "contracts" throughout.
- New CLI verb: `dogwalker contract list|inspect|create|edit|delete`, so agents
  can manage the workspace's contracts (schema, attempts, timeout, rejection
  prompt, fallback) themselves. The agent skill is bumped accordingly.
- UI: the sidebar shows the Dogwalker wordmark; every emoji/character glyph in the
  chrome is now a line-style SVG icon (nodes, floors, composer, file tree, config
  menu, align menu). Presets pick from a set of built-in SVG icons instead of a
  free-form emoji field, and built-in presets can be deleted. Workspaces no longer
  carry an icon.
- Testing: adopt Vitest (unit + component, colocated `*.test.ts[x]`, node + jsdom
  with React Testing Library) and Playwright (`e2e/`), replacing the in-app
  `DW_*TEST` harnesses with behavior-focused tests on the files under test. `npm
  test` runs in CI.

## 1.2.1

- Single contract asks now emit only the validated result object;
  `--strict` preserves it while exiting non-zero on rejection.
- Contracts can persist a post-rejection prompt, injected with validation errors
  without an implicit retry.
- Public documentation moved to `docs/`; `README.md` remains the GitHub landing
  page and `AGENTS.md` remains at the repository root.

## 1.2.0 — Team Operations & contracts

- Authorized team asks, JSON envelopes, grouped broadcast history and local
  contracts with broker-side validation.

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
