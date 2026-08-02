# Dogwalker — Roadmap

The path from empty repo to public release, one version at a time. Each version has an **expectation** (what it proves or unlocks), **outputs** (the concrete deliverables), and **exit criteria** (measured, not felt). Scope references [PRODUCT.md](PRODUCT.md) and [ARCHITECTURE.md](ARCHITECTURE.md) instead of restating them; **anything not listed for a version is deferred by default**. The non-goals in [PRODUCT.md §1](PRODUCT.md#non-goals-explicitly-out-of-scope) are out of scope at every version.

| Version | Theme | One-line gate |
|---|---|---|
| [v0.0.1](#v001--alpha-the-spike) | Alpha: stack validation | Perf numbers hit, or the stack decision reopens |
| [v0.1](#v01--the-core-loop) | The core loop (canvas + terminals + messaging + notes) | Dogfooding starts: Dogwalker is developed inside Dogwalker |
| [v0.2](#v02--daily-driver-comfort) | Daily-driver comfort (canvas & shell completion) | A full workday inside Dogwalker with no reason to leave |
| [v0.3](#v03--file-tree--visual-context) | File Tree & visual context | Code browsing/editing/git without leaving the canvas |
| [v0.4](#v04--portals) | Portals (embedded automatable browsers) | An agent completes a browser task end-to-end |
| [v0.5](#v05--floors) | Floors (parallel worktrees) | A real feature developed and landed entirely on a floor |
| [v0.6](#v06--automation-routines--walker-mode) | Automation: Routines & Walker mode | A Walker assembles a team; routines run for a week unattended |
| [v0.7](#v07--hardening-beta) | Hardening (beta, feature freeze) | Stable at 2× target scale on all three OSes |
| [v0.8](#v08--release-engineering) | Release engineering (RC) | A stranger can install from an artifact, not from source |
| [v1.0](#v10--launch) | Launch | PRODUCT.md is true, installers public, release tagged |
| [v1.1.0](#v110--roles-presets--brand-polish) | Roles, Presets & brand polish | An agent can be launched or reassigned from reusable, persisted team configuration |
| [v1.2.0](#v120--team-operations--response-contracts) | Team Operations & response contracts | An authorized team loop returns concise, contract-validated output |
| [v1.2.1](#v121--contract-result-ergonomics--documentation-consolidation) | Contract result ergonomics & documentation consolidation | Contract results are loop-ready and public docs are coherent |

---

## v0.0.1 — Alpha: the spike

**Status: PASSED (2026-07-19, Windows)** — results and one consciously
accepted deviation (memory measured in dev mode) in
[ARCHITECTURE.md §13](ARCHITECTURE.md#13-spike-findings-v001--passed-2026-07-19-windows-11).

**Expectation:** falsify the architecture as cheaply as possible ([ARCHITECTURE.md §12](ARCHITECTURE.md#12-validation-order-the-spike)). Every risky bet — React Flow hosting live terminals, the renderer degradation ladder, the headless mirror — is exercised before any product feature exists. Code from this phase is allowed to be throwaway; the *conclusions* are the deliverable.

**Outputs**
1. Electron + TypeScript (strict) scaffold with the main/renderer split of [ARCHITECTURE.md §2](ARCHITECTURE.md#2-process-model); one hardcoded workspace, no persistence.
2. React Flow canvas with a custom terminal shape (pan/zoom, move/resize only).
3. Terminal pipeline: node-pty in main ↔ xterm.js in renderer over a dedicated byte channel; agent presets as auto-executed commands; `DOGWALKER_*` spawn env already injected ([ARCHITECTURE.md §3](ARCHITECTURE.md#3-terminal-subsystem)).
4. Headless mirror (xterm-headless per PTY) proving screen serialization works while the renderer instance is suspended.
5. Degradation ladder tiers 1–3 with **per-terminal renderer hot-swap at runtime** and the WebGL context budget ([ARCHITECTURE.md §4](ARCHITECTURE.md#4-terminal-rendering-the-degradation-ladder)). Tier 4 is intentionally not built.
6. Perf HUD: fps, per-tier terminal counts, live WebGL contexts, main/renderer CPU & RAM.
7. A short findings note appended to ARCHITECTURE.md (what held, what surprised, what was tuned).

**Exit criteria**
- 15 terminals running **real agents** (Claude Code + at least one other preset) producing output concurrently.
- Sustained ≥ 55 fps while panning/zooming; typing echo in the focused terminal < ~50 ms.
- Tier transitions cause no lost scrollback, no reflow glitches, no terminal restarts.
- ≤ 8 WebGL contexts ever live; zero context-loss events in a 30-minute session.
- Dogwalker's own processes ≤ ~500 MB with 15 quiet terminals (agents excluded).
- Verified on Windows (macOS and Linux deliberately deferred to the v0.7 cross-OS QA matrix).

**Failure protocol:** if the criteria can't be met after honest optimization, findings go into ARCHITECTURE.md and the stack decision reopens *before* v0.1. That is the spike doing its job.

---

## v0.1 — The core loop

**Expectation:** the differentiating loop — *watch agents on a canvas, wire them, they talk* — works end to end and is reliable enough that Dogwalker development moves inside Dogwalker permanently. This is the largest single version; everything after it is incremental.

**Outputs**
1. **Workspaces**: create/edit/switch, working directory + icon, full sidebar, JSON persistence, load-only-active on startup ([PRODUCT.md §12](PRODUCT.md#12-workspaces--shell), [ARCHITECTURE.md §10](ARCHITECTURE.md#10-persistence--hibernation)).
2. **Canvas, working set**: node create/move/resize/duplicate/delete, grid snapping, focus/zoom-to-selection, keyboard navigation, undo/redo ([PRODUCT.md §3.1–3.2](PRODUCT.md#31-node-creation--manipulation)).
3. **Terminals & agents**: the five shipped presets + custom ([PRODUCT.md §4.2](PRODUCT.md#42-agents--launch-configs)), names/icons, number badges, one dark + one light theme. Attention system with OSC 133, dot + cycle shortcut + system notifications ([PRODUCT.md §4.4](PRODUCT.md#44-attention-system), [ARCHITECTURE.md §6](ARCHITECTURE.md#6-attention-detection)).
4. **Broker + CLI + skill**: all of [ARCHITECTURE.md §5](ARCHITECTURE.md#5-the-ipc-bus--dogwalker-cli) for `ask` / `check` / `list` / `connect` / `disconnect`; atomic bracketed-paste injection; timeouts; JSONL message history; the skill teaching agents the contract; roles as instruction files ([PRODUCT.md §4.3](PRODUCT.md#43-roles)).
5. **Connections**: leash + circuit visuals, tool/shortcut creation, connections popover, per-leash message history view ([PRODUCT.md §5](PRODUCT.md#5-connections--the-dogwalker-cli)).
6. **Notes**: markdown on disk, raw/formatted modes, rename, drag-in external files, delete-with-file, note chaining, `note read|append|write` verbs ([PRODUCT.md §6](PRODUCT.md#6-notes)); image paste landed in v0.3.
7. **Prompt Composer**: floating editor, per-terminal persistent drafts, send/newline/passthrough keys, image paste via temp-file path, @-mentions of connected terminals and notes ([PRODUCT.md §7](PRODUCT.md#7-prompt-composer)).
8. `npm start` works on the three OSes.

**Exit criteria**
- Dogfooding is real: multiple wired agents, daily, in a Dogwalker workspace.
- The README quick start works exactly as written.
- An unattended `ask`→work→captured-output round-trip completes while the user clicks around, focuses the target terminal, and types elsewhere.
- Any leash's history view reconstructs a full conversation accurately.
- A 10+ node workspace restores byte-identical layout after restart; drafts survive restart.
- Attention fires correctly for all five presets; no false positives mid-interaction.

---

## v0.2 — Daily-driver comfort

**Expectation:** dogfooding (started in v0.1) exposes friction; this version removes it. Nothing conceptually new — the canvas and workspace shell reach their full PRODUCT.md shape, so living in Dogwalker all day feels good rather than merely possible.

**Outputs**
1. **Canvas completion**: groups (create/ungroup/rename/move-by-header), align/distribute, tidy, magnetic snapping, minimap, tool auto-revert ([PRODUCT.md §3.3](PRODUCT.md#33-organization)).
2. **Workspace shell completion**: folders and group dividers in the sidebar, mini sidebar, per-workspace number shortcuts, prev/next switching, hibernation (manual + load-only-active), open-in-editor button ([PRODUCT.md §12](PRODUCT.md#12-workspaces--shell)).
3. **Terminal completion**: theme gallery + user-supplied custom themes + follow-system toggle, per-terminal memory limits ([PRODUCT.md §4.1](PRODUCT.md#41-terminals)).
4. First-run experience: sensible empty state, a seeded example workspace.

**Exit criteria**
- A full workday inside Dogwalker with zero "I had to leave for X" notes.
- Hibernate/resume cycle on a 15-node workspace loses nothing and resumes in seconds.
- A custom theme file loads and renders correctly; memory limit demonstrably kills a runaway process while the shell survives.
- Groups survive copy/paste and undo/redo (the PRODUCT.md contract).

---

## v0.3 — File Tree & visual context

**Expectation:** code stops requiring an external editor for everyday browsing, quick edits, and git operations; agents gain richer visual context. This is the last "single-player" feature block — everything after touches agent capabilities.

**Outputs**
1. **File Tree node**, multiple independent instances: list view, icon grid with previews, git diff view, git graph view ([PRODUCT.md §8](PRODUCT.md#8-file-tree)).
2. File ops (create/rename/move/delete), drag-to-terminal (paths to agents), drag-to-canvas (preview nodes).
3. Git branch menu: commit, pull/push, checkout, branch, merge, fetch, stash — via system `git` ([ARCHITECTURE.md §1](ARCHITECTURE.md#1-stack--rationale)).
4. **Embedded CodeMirror 6 editor**: syntax highlighting, find & replace, multi-cursor, send-selection-to-agent.
5. Fuzzy file-name search per node + `>`-prefixed content search with jump-to-line.
6. **Notes image paste** (deferred from v0.1): stored alongside the note, rendered in formatted view, readable by connected agents ([PRODUCT.md §6](PRODUCT.md#6-notes)).

**Exit criteria**
- A day's git workflow (branch, commit, push, diff review) completed entirely in Dogwalker on a real repo.
- Diff and graph views correct on a repository with 1,000+ commits and multiple branches.
- Editor round-trip: open file → multi-cursor edit → save → agent sees the change; send-to-agent injects the selection with file/line reference.
- An agent describes an image pasted into a connected note (proves the read path).

---

## v0.4 — Portals

**Expectation:** agents gain eyes and hands on the web without any external browser-automation dependency. The broker's verb surface grows for the first time since v0.1, proving the "CLI is the entire API" design scales ([PRODUCT.md §5.3](PRODUCT.md#53-the-cli-is-the-entire-api)).

**Outputs**
1. **Portal node**: isolated `WebContentsView` per portal with its own session partition; URL bar, back/forward, reload ([ARCHITECTURE.md §9](ARCHITECTURE.md#9-portals)).
2. Linked portals sharing a session partition (multi-account testing) ([PRODUCT.md §9](PRODUCT.md#9-portals)).
3. **`portal` CLI verbs** over CDP: navigate, click, type, scroll, screenshot (returned as temp-file path), js, dom, console — broker-gated by the connection graph.
4. Agent-created portals (`@New Portal` in the composer + CLI creation).
5. Skill updated to teach the portal contract.

**Exit criteria**
- An agent completes an end-to-end browser task unattended: navigate → interact with a form → screenshot → reason about the screenshot — via CLI only.
- Two linked portals hold two simultaneous logged-in sessions of the same site; two *unlinked* portals hold different accounts without leakage.
- Portal automation works while the portal is offscreen (canvas scrolled away).
- CDP session survives page navigations and reloads without re-attachment bugs.

---

## v0.5 — Floors

**Expectation:** parallel work stops requiring stash/branch juggling. The git-worktree design ([ARCHITECTURE.md §8](ARCHITECTURE.md#8-floors-git-worktrees)) proves itself cross-platform — the feature the macOS-only incumbent ties to APFS, Dogwalker does everywhere.

**Outputs**
1. Floor create/rename/delete over `git worktree add/remove`; branch pick-or-create; per-floor canvas layer (clone ground or start empty) and terminals rooted in the worktree ([PRODUCT.md §10](PRODUCT.md#10-floors)).
2. **Land flow**: clean-tree check → target branch selection → merge → worktree removal → branch-delete checkbox; diff stats and conflict surfacing (resolution stays in the user's tools).
3. **Hooks**: setup (with auto-run), run, teardown; `DOGWALKER_FLOOR_NAME` / `BRANCH_NAME` / `FLOOR_PATH` / `ROOT_PATH` / `PROJECT_NAME` env.
4. Worktree constraints surfaced in UI (one checkout per branch; untracked files need setup hooks — the documented trade-offs).
5. Broker/CLI aware of floors (`list` shows floor context; `ask` reaches cross-floor targets when wired).

**Exit criteria**
- A real feature: floor created → setup hook installs deps → agents work on it → committed → landed → teardown — while the ground floor runs its own dev server, no collisions.
- Two floors run two dev servers on different ports simultaneously.
- Land with a deliberate conflict surfaces it clearly and aborts safely (no half-merged state).
- Full lifecycle verified on Windows, macOS, and Linux.

---

## v0.6 — Automation: Routines & Walker mode

**Expectation:** Dogwalker graduates from a place where you drive agents to a place where agent work drives itself. Both features are thin layers over machinery that already exists — routines reuse the attention lifecycle signals, Walker mode reuses broker verbs — which is the payoff of the v0.1 architecture.

**Outputs**
1. **Routines**: prompt + interval + target agent; `&&`-chained steps waiting on turn completion; pause/resume/edit/delete; live status indicator ([PRODUCT.md §11](PRODUCT.md#11-routines)).
2. **Walker mode**: the Walker flag on terminal creation; `recruit --agent --role [--floor]` / `dismiss` / `assign` broker verbs; recruits auto-position near their Walker; `@Walker` in the composer ([PRODUCT.md §5.4](PRODUCT.md#54-walker-mode-manager-agents)).
3. Skill updated: Walker instructions (team assembly, wiring recruits to notes, dismissal etiquette).

**Exit criteria**
- A natural-language instruction to a Walker ("assemble a coder + reviewer + tester team sharing the SPEC note") produces the wired team without manual canvas work.
- A routine chain (build && test && summarize-to-note) runs on schedule for a week of dogfooding without zombie states.
- Dismissing a recruit cleans up its node, connections, and history references correctly.
- A recruited agent on another floor completes an `ask` round-trip with its Walker.

---

## v0.7 — Hardening (beta, feature freeze)

**Expectation:** no new features — the version where Dogwalker becomes trustworthy. Scale margins, failure recovery, and cross-OS consistency get systematic attention; the docs get a truth pass so PRODUCT.md and reality converge before packaging.

**Outputs**
1. **Scale pass**: profiling at 30+ terminals / 3 workspaces; tier-4 snapshot rendering built *only if* this profiling demands it ([ARCHITECTURE.md §4](ARCHITECTURE.md#4-terminal-rendering-the-degradation-ladder)).
2. **Failure recovery**: crashed agent process, killed PTY, broker restart, stale msg-ids, orphaned worktrees, portal renderer crash — each detected and recovered or cleanly surfaced.
3. **Cross-OS QA matrix**: full feature checklist executed on Windows, macOS, Linux (X11 + Wayland); ConPTY quirks addressed.
4. `CLAUDE.md`/`AGENTS.md` sync toggle ([PRODUCT.md §12](PRODUCT.md#12-workspaces--shell)) — last deferred feature, lands before the freeze.
5. **Docs truth pass**: every PRODUCT.md statement verified against the build or consciously amended; ARCHITECTURE.md updated with as-built reality.
6. Bug backlog triaged to zero known data-loss or corruption issues.

**Exit criteria**
- One week of daily use at 2× normal scale with zero crashes and zero data loss.
- Kill -9 on the app mid-session: restart restores every workspace, note, draft, and history intact.
- The cross-OS matrix passes 100% (or failures are documented as known limitations in README).
- All ten [AGENTS.md invariants](../AGENTS.md#invariants--do-not-violate-without-explicit-human-sign-off) audited against the code and holding.

---

## v0.8 — Release engineering (RC)

**Expectation:** Dogwalker becomes installable by someone who has never seen the repo. Everything here is distribution mechanics; the app itself only changes for RC-blocking bugs.

**Outputs**
1. Packaged installers: dmg (macOS), exe/msi (Windows), AppImage (Linux); reproducible build scripts.
2. Code signing + macOS notarization where feasible (documented gaps where not).
3. MIT `LICENSE` file; README flipped from "intended flow" to actual install instructions.
4. Public GitHub repo under the author's personal account; issue templates; CONTRIBUTING notes; CI building all three artifacts per tag.
5. Versioned skill: the installed skill carries a version and the broker warns on mismatch.
6. RC builds (v0.8.x) cut from CI and installed fresh on clean machines/VMs.

**Exit criteria**
- Fresh-machine test on each OS: download artifact → install → two-agent `ask` working in under 10 minutes using only the README.
- No OS security theater beyond the expected (documented Gatekeeper/SmartScreen behavior for unsigned pieces, if any).
- CI produces all three artifacts from a clean tag with no manual steps.

---

## v1.0 — Launch

**Expectation:** the public release. By this point the work is verification and announcement, not construction.

**Outputs**
1. Final parity audit: PRODUCT.md is true of the shipped build — zero silent gaps.
2. v1.0.0 tag + GitHub Release with the three artifacts and release notes (written from this roadmap's trail).
3. README screenshots/GIF of a real multi-agent session (the dogfooding workspace).
4. Launch post/announcement wherever the author chooses.

**Exit criteria**
- A stranger on each OS reaches a working wired-agents session from the release page alone.
- Issues are open, labeled, and the contribution path in README is honest.
- The author ships the next Dogwalker feature *using* Dogwalker v1.0.

---

## v1.1.0 — Roles, Presets & brand polish

**Status: complete (2026-08-01).** The first post-launch feature release completes the
configuration layer that the v1.0 canvas already exposes: reusable agent launch
presets and reusable role instructions. It does not add a provider integration:
agents remain vendor-agnostic commands driven only through the PTY and the
Dogwalker CLI.

**Expectation:** setting up a repeatable team becomes configuration rather than
retyping commands and instructions per terminal. A user can define a role once,
pair it with a preset when recruiting, and see exactly who each terminal is
meant to be.

**Outputs**
1. **Preset library:** ship the existing built-in shell/agent presets as
   read-only defaults; add persisted custom presets with display name, icon and
   command. The Presets panel supports create, edit, duplicate and delete for
   custom entries, validates required fields, and never hardcodes behavior for
   a particular agent vendor.
2. **Role library:** persisted, reusable roles with a name and Markdown
   instruction body. The Roles panel supports create, edit, duplicate, delete
   and a readable empty state. Role files are stored locally in an open format,
   as with notes and layouts.
3. **Terminal assignment:** creation and duplicate flows can select a preset and
   a role. The terminal header/context controls show the current role and allow
   reassignment without respawning the PTY or dropping its graph connections.
4. **Agent context delivery:** assigning a role materializes its instruction
   file in the terminal's working context and gives the running agent a stable,
   vendor-neutral reference to it. Reassignment refreshes that reference; it
   must not depend on parsing a vendor TUI or calling a provider API.
5. **Walker integration:** recruit with an agent preset and role resolves names
   from the same preset/role libraries as the UI. Invalid or deleted
   configuration returns a clear broker error; recruits preserve their chosen
   role in the persisted layout and across floor boundaries.
6. **Persistence and migration:** terminal specs persist preset and role ids
   rather than display labels. Existing workspaces migrate safely to built-in
   presets with no role, and a missing custom preset/role remains visible as a
   recoverable configuration warning instead of preventing a workspace from
   opening.
7. **Brand polish:** move the public logo and README banner into assets,
   refresh the README reference, and refine both SVGs. The hero mirrors the
   final logo and presents the terminal, note and connection vocabulary with
   consistent, scale-independent vector artwork.
8. **Validation:** add focused in-app harness coverage for preset/role CRUD,
   persistence/migration, terminal reassignment, role-context delivery and
   Walker recruitment; retain typecheck and lint as release gates. Update
   PRODUCT.md, ARCHITECTURE.md and README.md whenever the shipped role delivery
   or preset surface differs from the current documentation.

**Exit criteria**
- A custom preset and a custom role survive app restart and are selectable when
  creating a terminal.
- A role assigned to a live terminal changes its available instruction context
  without terminating the process or changing any leashes.
- A Walker recruits a terminal by named custom preset and role on both ground
  and a floor; the CLI list and the canvas show the expected labels.
- Deleting a role or preset that is still referenced never corrupts a workspace
  and leaves the user a direct repair path.
- The README banner and logo render crisply at their documented sizes in the
  repository, release page and packaged-app surfaces.

---

## v1.2.0 — Team Operations & response contracts

**Status: complete (2026-08-01).** This version makes the existing connection graph useful
for deliberate multi-agent loops: fan a task out to authorized teammates, get
machine-readable outcomes back, and let a Walker choose the next action without
repeating or screen-scraping noisy transcripts. It remains entirely local and
vendor-neutral: Dogwalker only injects PTY text and validates captured output.

**Expectation:** a team lead can ask several reviewers for the same decision,
receive compact validated results, and continue the loop using the existing
CLI, roles, floors and message history.

**Outputs**
1. **Targeted team asks:** `dogwalker ask --all`, explicit comma-separated
   terminal targets, and exclusions for directly connected terminals. Each
   recipient is independently authorized; partial timeout/failure returns the
   successful peers instead of failing the whole round.
2. **Stable automation envelopes:** `--json` on `ask`, with documented `ok`,
   `data` and `error` fields. Broadcast output is deterministic
   and contains a result per target (name, stable id, status, output/error).
3. **Response-contract library:** persisted local named contracts containing a
   description and a constrained object schema (required fields and scalar/array
   types). The Panel creates, adjusts required fields, duplicates and deletes
   entries with a readable
   empty state; deleted contracts fail clearly but never corrupt history.
4. **Broker validation:** `ask --contract <name>` injects exact output guidance,
   extracts one JSON value from the captured response, validates it in the host,
   and exposes `valid`, parsed value and validation errors. `--strict` gives a
   non-zero result for an invalid answer; raw output remains inspectable.
5. **History and Walker loop:** a broadcast id groups its per-leash history
   entries in the UI. Walkers can broadcast review/research requests on ground
   or floors and consume contract results in a follow-up command.
6. **Validation and truth pass:** focused harnesses cover graph authorization,
   partial failure, output ordering, JSON envelopes, contract CRUD/persistence,
   JSON extraction/validation and cross-floor Walker broadcasts. PRODUCT.md,
   ARCHITECTURE.md and README.md describe the shipped behavior exactly.

**Exit criteria**
- A terminal can broadcast only to its directly connected peers; an unconnected
  target is denied even when another target in the same round succeeds.
- A timed-out or malformed response leaves the valid results of other peers
  available in a deterministic JSON envelope.
- A custom response contract survives restart, validates a live agent answer,
  and returns actionable errors for a malformed answer without hiding raw
  history.
- A Walker can consume a contract-backed broadcast result without parsing
  terminal decorations.
- No vendor-specific adapter, provider call, ambient authority, silent retry or
  renderer snapshot is introduced.

---

## v1.2.1 — Contract result ergonomics & documentation consolidation

**Status: complete (2026-08-02).** A patch release that makes single contract
results ready for the next orchestration step and consolidates Dogwalker's public
documentation under `docs/`.

**Outputs**
1. Public reference documents live in `docs/`; the repository `README.md`
   remains the GitHub landing page and `AGENTS.md` remains the contributor guide.
2. Internal links, release links and version references point to their current
   locations and v1.2.1 development status.
3. A focused truth pass corrects only statements that no longer match shipped
   behavior.
4. A single `ask --contract` prints only its validated result object. On a
   strict rejection it prints that same object and exits non-zero.
5. Contracts persist an optional post-rejection prompt. The broker injects it
   with validation errors but does not await or capture an implicit retry.

**Exit criteria**
- All documentation links resolve from their new locations.
- User-facing documents describe the implemented product without stale
  release-era claims.
- Valid and rejected contract asks, direct shim output, and post-rejection
  delivery are covered by the broker harness.

---

## After v1 (parked, unscheduled)

**Scheduling note:** Presets and roles are no longer parked; they are the
v1.1.0 scope above. The remaining ideas follow.

Recurring ideas deliberately not on the path: community preset/skill sharing,
`--json` on every remaining verb, automatic contract-repair retries, and tier-4
rendering if profiling demands it. New scope enters [PRODUCT.md](PRODUCT.md)
first, then lands here — never the other way around.
