---
name: dogwalker
version: 5
description: Talk to other agents and read their terminals from inside a Dogwalker canvas. Use whenever you need to ask a connected teammate to do something, check what another terminal is doing, read or write a shared note, drive a connected browser portal, or list who you are connected to.
---

# Dogwalker CLI

You are running in a terminal on a **Dogwalker** canvas. The `dogwalker` command
(alias `walk`) lets you talk to the other terminals you are **connected** to by a
leash. It only works inside a Dogwalker terminal.

You can only reach terminals you are wired to. Run `dogwalker list` to see them.

## Commands

- `dogwalker list` — names of the terminals you are connected to. Each line is
  `name  id  [floor]` — the floor tag tells you which layer a teammate works on
  (`[ground]` or a floor name), so you can reach agents across floors you're
  wired to.
- `dogwalker ask <name> <message> [--timeout <seconds>]` — send a message to a
  connected terminal and **wait for its answer**. The message is delivered to
  that terminal as if typed there; Dogwalker waits until it finishes responding,
  then prints back whatever it produced. Use this to delegate work or request a
  review, e.g. `dogwalker ask reviewer "review auth.ts, focus on token expiry"`.
  `--timeout` sets how long to wait (default 180s); raise it for slow work,
  e.g. `dogwalker ask builder "run the full suite" --timeout 600`.
- `dogwalker ask --all <message> [--exclude <name>] --json` — ask every directly
  connected terminal and receive an ordered JSON result envelope. Each target is
  authorized independently, so one failure does not discard other results.
- `dogwalker ask <name> <message> --contract <name>` — ask under a saved contract
  and get back schema-validated JSON instead of prose. See **Contracts** below.
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

## Contracts (schema-checked answers)

A **contract** is a saved JSON Schema plus a retry budget, per-attempt timeout,
rejection prompt and fallback value — all configured by the user, not by you. Add
`--contract <name>` to an `ask` when you need the peer's answer as **structured
data you can parse and act on**, not free prose: a decision, a score, a list of
findings, a status object.

How it behaves: Dogwalker delivers your message, reads the peer's answer, and
validates its JSON against the contract's schema. If it doesn't match, it re-asks
the peer with the validation errors and tries again — up to the contract's attempt
budget. You always get back exactly one JSON object: the validated answer, or the
contract's fallback value if the peer never produced a valid one within the budget.
There is no error to handle and nothing to retry yourself.

- `dogwalker ask reviewer "does auth.ts handle token expiry safely?" --contract verdict`
  → prints e.g. `{"decision":"approve","risks":[]}` — ready to parse and branch on.

When to reach for it: you're going to consume the answer programmatically — gate a
step, drive a loop, or aggregate results across teammates. For a conversational
reply, use a plain `ask`. You pass only the message, the peer, and the contract
name; everything else lives on the contract.

You can create and manage contracts yourself (they're shared, local config):

- `dogwalker contract list` — names of all saved contracts.
- `dogwalker contract inspect <name>` — show a contract's schema, attempts,
  timeout, rejection prompt and fallback.
- `dogwalker contract create <name> --schema '<json-schema>' [--attempts <n>] [--timeout <seconds>] [--rejection '<text>'] [--fallback '<json>']`
  — create one. `--schema` is required and must be a valid JSON Schema (as a JSON
  string); `--fallback` is a JSON value; attempts default to 3 and timeout to 180s.
- `dogwalker contract edit <name> [--schema …] [--attempts …] [--timeout …] [--rejection …] [--fallback …] [--name <newname>]`
  — change only the fields you pass.
- `dogwalker contract delete <name>` — remove one.

Example: `dogwalker contract create verdict --schema '{"type":"object","required":["decision"],"properties":{"decision":{"type":"string"}}}' --fallback '{"decision":"unknown"}'`

## Walker mode (managing a team)

If your terminal is flagged as a **Walker** (a crown 👑 on its header), you can
assemble and manage a team of agents from the CLI. Recruits spawn already wired
to you, so you can `ask` them immediately.

- `dogwalker recruit --agent <preset> --role <role> [--floor <floor>]` — spawn a
  new agent connected to you, labeled by its role. Prints the recruit's name.
  E.g. `dogwalker recruit --agent claude --role reviewer`.
- `dogwalker dismiss <recruit>` — remove a recruit you no longer need (kills its
  terminal and cleans up its node and connections). Dismiss recruits when their
  work is done rather than leaving them idle.
- `dogwalker assign <recruit> --role <role>` — relabel a recruit's role in place.

Typical flow when the user asks you to assemble a team: `recruit` each member
with a clear role, wire shared context to them (e.g. `connect` them to a SPEC
note), `ask` each to do its part, and `dismiss` them when finished.

## Portals (embedded browsers)

A **portal** is a real browser window on the canvas. If you are connected to one,
you can drive it — navigate, read it, click, type, screenshot — entirely from the
CLI. You can also create your own.

- `dogwalker portal new [url]` — create a new portal wired to you, optionally at a
  starting URL. Prints its name; use that name in the commands below.
- `dogwalker portal navigate <portal> <url>` — load a URL.
- `dogwalker portal dom <portal> [selector]` — print the page's HTML (whole page,
  or just the element matching a CSS selector). Read this to find what to click or
  type into.
- `dogwalker portal click <portal> <selector>` — click the first element matching a
  CSS selector, e.g. `dogwalker portal click viewer "button#submit"`.
- `dogwalker portal type <portal> <selector> <text>` — focus a field and set its
  value, e.g. `dogwalker portal type viewer "input[name=q]" hello`.
- `dogwalker portal scroll <portal> <dx> <dy>` — scroll the page by an offset.
- `dogwalker portal js <portal> <code>` — evaluate JavaScript in the page and print
  the (JSON) result, e.g. `dogwalker portal js viewer "document.title"`.
- `dogwalker portal screenshot <portal>` — capture the page; prints a file path.
  **Read that image file** to see the page (it works even when the portal is
  scrolled off-screen).
- `dogwalker portal console <portal>` — print the page's recent console output.

A typical browser task: `portal new` → `portal navigate` → `portal dom` to find
selectors → `portal type` / `portal click` to interact → `portal screenshot` and
read the image to confirm the result.

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
