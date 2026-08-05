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

- **Unit + component tests — Vitest.** Colocated next to the file under test as
  `<name>.test.ts[x]` (e.g. `fuzzy.ts` → `fuzzy.test.ts`). `src/main` and
  `src/shared` run in a node environment; `src/app` runs in jsdom with React
  Testing Library. Run them with `npm test` (`npm run test:watch` to iterate).
  Test **behavior, not implementation detail** — a component's behavior belongs
  in its own `Component.test.tsx`, not a separate ad-hoc file.
- **End-to-end tests — Playwright.** Specs in `e2e/*.spec.ts` launch the real
  Electron app (broker over its socket, real PTYs, portals). Build first
  (`npm run package`), then `npm run test:e2e`. This is where the app-level
  scenarios the older `DW_*TEST` in-app harnesses covered are being migrated.

`npm run typecheck`, `npm run lint` and `npm test` are the standing correctness
gates.

## Pull requests

Branch off `main`, keep the change focused, and ensure typecheck + lint pass and
the relevant harness is green. Fill in the PR template; commits that touch agent
behavior should say which harness proves it. When behavior lands or changes,
update the affected `docs/*.md` in the same change.
