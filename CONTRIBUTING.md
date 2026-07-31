# Contributing to Dogwalker

Thanks for helping. Dogwalker is a free, local, cross-platform canvas for AI
coding agents — read [PRODUCT.md](PRODUCT.md) for what it is and
[ARCHITECTURE.md](ARCHITECTURE.md) for how it's built.

## Run from source

```bash
git clone https://github.com/caribeedu/dogwalker
cd dogwalker
npm install
npm start      # launch the app
npm run typecheck
npm run lint
```

`git` must be on your PATH (Floors and the git views shell out to it).

## How this codebase is tested

There is no unit-test runner. Behavior is verified with **in-app harnesses**:
setting a `DW_*TEST=1` env var makes `npm start` run a scenario in the main or
renderer process and print a single `NAME RESULT {...}` line, then the run is
inspected. Examples: `DW_BROKERTEST`, `DW_FLOORTEST`, `DW_WALKERTEST`,
`DW_RECOVERYTEST`, `DW_V06BDD`. When you add behavior, add or extend a harness
and keep it green. Pure logic (layout, snapping, git-graph lanes, fuzzy, diff)
lives in side-effect-free helpers so it can be asserted directly.

## Ground rules

- **Invariants**: the ten in [AGENTS.md](AGENTS.md#invariants--do-not-violate-without-explicit-human-sign-off)
  are deliberate. Don't violate them without explicit sign-off.
- **Scope**: respect the non-goals (no command palette / built-in LLM / remote
  execution / MCP / i18n).
- **Vendor-agnostic**: agents are launch configs driven only via PTY + the CLI.
  No per-vendor code paths or model-provider API calls.

## Pull requests

Branch off `main`, keep the change focused, ensure typecheck + lint pass and the
relevant harness is green, and fill in the PR template. Commits that touch agent
behavior should say which harness proves it.
