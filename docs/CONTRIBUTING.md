# Contributing to Dogwalker

Thanks for helping. Start with the docs that already cover the shared context, so
this guide only has to add what's specific to contributing:

- [PRODUCT.md](PRODUCT.md) — what Dogwalker is and its non-goals (respect them:
  no command palette / built-in LLM / remote execution / MCP / i18n).
- [ARCHITECTURE.md](ARCHITECTURE.md) — how it's built.
- [AGENTS.md](../AGENTS.md) — the invariants and conventions every change must
  hold to. Don't violate an invariant without explicit sign-off.
- [README.md](../README.md#from-source) — running from source (`git clone` →
  `npm install` → `npm start`; `git` must be on your PATH).

## How this codebase is tested

There is no unit-test runner. Behavior is verified with **in-app harnesses**:
setting a `DW_*TEST=1` env var makes `npm start` run a scenario in the main or
renderer process and print a single `NAME RESULT {...}` line to inspect. Examples:
`DW_BROKERTEST`, `DW_FLOORTEST`, `DW_WALKERTEST`, `DW_RECOVERYTEST`, `DW_V06BDD`.
When you add behavior, add or extend a harness and keep it green. Pure logic
(layout, snapping, git-graph lanes, fuzzy, diff) lives in side-effect-free helpers
so it can be asserted directly.

`npm run typecheck` and `npm run lint` are the standing correctness gates.

## Pull requests

Branch off `main`, keep the change focused, and ensure typecheck + lint pass and
the relevant harness is green. Fill in the PR template; commits that touch agent
behavior should say which harness proves it. When behavior lands or changes,
update the affected `docs/*.md` in the same change.
