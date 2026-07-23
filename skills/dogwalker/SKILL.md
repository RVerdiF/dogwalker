---
name: dogwalker
description: Talk to other agents and read their terminals from inside a Dogwalker canvas. Use whenever you need to ask a connected teammate to do something, check what another terminal is doing, read or write a shared note, or list who you are connected to.
---

# Dogwalker CLI

You are running in a terminal on a **Dogwalker** canvas. The `dogwalker` command
(alias `walk`) lets you talk to the other terminals you are **connected** to by a
leash. It only works inside a Dogwalker terminal.

You can only reach terminals you are wired to. Run `dogwalker list` to see them.

## Commands

- `dogwalker list` — names of the terminals you are connected to.
- `dogwalker ask <name> <message>` — send a message to a connected terminal and
  **wait for its answer**. The message is delivered to that terminal as if typed
  there; Dogwalker waits until it finishes responding, then prints back whatever
  it produced. Use this to delegate work or request a review, e.g.
  `dogwalker ask reviewer "review auth.ts, focus on token expiry"`.
- `dogwalker check <name>` — print a connected terminal's current screen without
  interrupting it. Works on any terminal — another agent, a build, a dev server,
  a log tail.
- `dogwalker note read <name>` — print a connected note's markdown. Add
  `--chain` to also pull every note linked to it (a chain/mind-map of notes):
  `dogwalker note read spec --chain`.
- `dogwalker note append <name> --stdin` / `dogwalker note write <name> --stdin`
  — append to, or replace, a connected note's contents. Notes are shared context
  that persists across sessions; use them to leave findings, specs, or TODOs the
  user and other agents can see.
- `dogwalker connect <name>` / `dogwalker disconnect <name>` — manage leashes.

## When another agent asks you something

An agent that runs `dogwalker ask <you> "…"` delivers its message straight into
your terminal, as if the user had typed it. **Just respond normally** — do your
work and answer in your terminal the way you always do. Dogwalker captures what
you produce and hands it back to the asker automatically. You do **not** run any
command to reply.

## Notes

- `ask` waits until the target stops producing output (or times out), then
  returns that output — so give the target a moment; it is not stuck.
- Names are the labels shown on each terminal's header; ids also work.
- If a command says "not running inside a Dogwalker terminal", you are not on the
  canvas and these commands are unavailable.
