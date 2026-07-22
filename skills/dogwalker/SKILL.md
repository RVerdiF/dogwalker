---
name: dogwalker
description: Talk to other agents and read their terminals from inside a Dogwalker canvas. Use whenever you need to ask a connected teammate to do something, answer a message another agent sent you, check what another terminal is doing, or list who you are connected to.
---

# Dogwalker CLI

You are running in a terminal on a **Dogwalker** canvas. The `dogwalker` command
(alias `walk`) lets you talk to the other terminals you are **connected** to by a
leash. It only works inside a Dogwalker terminal.

You can only reach terminals you are wired to. Run `dogwalker list` to see them.

## Commands

- `dogwalker list` — names of the terminals you are connected to.
- `dogwalker ask <name> <message>` — send a message to a connected terminal and
  **block until it replies**. The reply is printed to your stdout. Use this to
  delegate work or request a review.
- `dogwalker check <name>` — print a connected terminal's current screen. Read
  only; does not interrupt them. Works on any terminal — another agent, a build,
  a dev server, a log tail.
- `dogwalker reply <msg-id> --stdin` — answer a message that was sent to you (see
  below). `<msg-id>` comes from the incoming message.
- `dogwalker note read <name>` — print a connected note's markdown.
- `dogwalker note append <name> --stdin` / `dogwalker note write <name> --stdin`
  — append to, or replace, a connected note's contents. Notes are shared context
  that persists across sessions; use them to leave findings, specs, or TODOs the
  user and other agents can see.
- `dogwalker connect <name>` / `dogwalker disconnect <name>` — manage leashes.

## When another agent asks you something

You will receive, in your terminal, a message like:

```
[dogwalker] message from lead (id 4f2a1c). When done, reply with:
dogwalker reply 4f2a1c --stdin  (end with a line containing only EOF)
<their message>
```

Do what they asked, then send your answer back with the id they gave you.
**Always reply through the CLI** — that is the only way they receive it. Use the
heredoc form so multi-line and quote-heavy answers survive shell quoting:

```
dogwalker reply 4f2a1c --stdin <<'EOF'
Reviewed auth.ts. Two issues:
1. token expiry is compared in seconds vs ms.
2. missing null check on the refresh path.
EOF
```

For a short one-line answer you may instead write:
`dogwalker reply 4f2a1c "looks good, shipping it"`

## Notes

- `ask` blocks until the peer replies or it times out — that is expected.
- Names are the labels shown on each terminal's header; ids also work.
- If a command says "not running inside a Dogwalker terminal", you are not on the
  canvas and these commands are unavailable.
