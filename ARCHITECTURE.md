# Dogwalker — Architecture

How Dogwalker is built. For what it is and why, see [PRODUCT.md](PRODUCT.md).

---

## 1. Stack & rationale

| Layer | Choice | Why |
|---|---|---|
| App shell | **Electron + TypeScript** | The only stack where all three hard requirements are cheap at once: terminals (xterm.js + node-pty across macOS/Win/Linux), embedded automatable browsers (Chromium `WebContentsView` + CDP), and a mature canvas ecosystem. A native-per-OS approach multiplies every module by ~3. |
| Canvas | **React Flow (@xyflow/react)** (custom node & edge types) | MIT-licensed node-graph canvas: infinite pan/zoom, custom React nodes and edges, minimap, selection, and a viewport API out of the box — and its node+edge model is exactly Dogwalker's (terminals + leashes). Considered **tldraw**: richer whiteboard features (drawing, groups, align/tidy, undo/redo built in), but discarded because its SDK license (verified 2026-07) forbids production use without a commercial license — incompatible with a 100% free product ([PRODUCT.md principle 5](PRODUCT.md#14-principles)). The whiteboard features we still want (groups, align/distribute, undo/redo) are built on top of React Flow in their scheduled versions ([ROADMAP.md](ROADMAP.md)); freehand drawing/text tools are deliberately out of scope. |
| Terminal emulation | **xterm.js v6** (WebGL + DOM renderers) + **node-pty** | Battle-tested emulator; node-pty covers posix PTYs and Windows ConPTY. Note: xterm.js v6 (2025-12) removed the canvas renderer — the degradation ladder's tier 2 uses the DOM renderer. |
| Code editor | **CodeMirror 6** | Embedded editor in File Tree nodes. Considered **Monaco** (VS Code's editor): richer IDE features out of the box, but discarded because it is heavyweight per instance (multi-MB bundle plus worker setup), designed around a single full-window editor rather than several small ones, and has unreliable layout/hit-testing inside CSS-transformed containers — exactly what a zoomable canvas is. CodeMirror 6 is modular (~10× smaller core), cheap enough to run one instance per File Tree node, and behaves correctly in scaled DOM; its trade-off (IDE smarts require assembling extensions) is acceptable since agents, not the editor, provide the intelligence. |
| Git | Shell out to system `git` | Diff/graph/branch ops and worktrees without reimplementing git. |
| Portals | Electron `WebContentsView` + **Chrome DevTools Protocol** | Navigation, clicks, screenshots, JS eval, DOM/console access with zero external dependencies. |
| Persistence | JSON files per workspace + markdown notes on disk | Open formats, greppable, syncable. No database. |

## 2. Process model

```
┌────────────────────────── Electron main process ──────────────────────────┐
│  Host daemon:                                                             │
│   • PTY manager (node-pty spawn/kill, memory limits, env injection)       │
│   • IPC server  (unix socket / named pipe)  ←── dogwalker CLI shims          │
│   • Message broker (ask/reply correlation, timeouts, history log)         │
│   • Portal controller (CDP sessions)                                      │
│   • Floor manager (git worktree ops, hooks)                               │
│   • Routine scheduler                                                     │
│   • Workspace store (layout/config JSON, hibernation)                     │
└──────────────┬────────────────────────────────────────────────────────────┘
               │ Electron IPC (typed channels)
┌──────────────▼──────────────── Renderer process ──────────────────────────┐
│  Canvas UI (React Flow) · xterm.js instances · Prompt Composer · File Tree    │
│  · Note editor · connection cables · attention badges                     │
└───────────────────────────────────────────────────────────────────────────┘
   (Portals render in their own WebContentsViews, composited over the canvas)
```

One host daemon per app instance. The renderer is presentation; every capability an agent can invoke lives in the main process, so the CLI and the UI share one implementation.

## 3. Terminal subsystem

- Each terminal node = one node-pty instance in main + one xterm.js instance in renderer, joined by a dedicated IPC channel carrying raw bytes both ways.
- Spawn env for every PTY:
  - `DOGWALKER_SOCKET` — path of the host IPC socket,
  - `DOGWALKER_TERMINAL_ID` — this node's id,
  - `PATH` prepended with a shim dir containing the `dogwalker` binary.
  This is why the CLI "only exists inside the canvas": outside Dogwalker terminals the shim isn't on PATH and the socket env var is absent.
- Agent presets: after shell init, the configured command is written to the PTY (auto-executed). From then on Dogwalker interacts with the process exclusively via PTY writes — indistinguishable from user input.
- Per-terminal memory limit: main process polls the PTY's process tree; on breach, kill the offending child, keep the shell.
- The **screen buffer lives in the renderer** (xterm.js). The main process keeps a headless mirror terminal (xterm-headless) per PTY fed with the same byte stream, so `check`, attention detection, and hibernated/offscreen parsing never depend on the UI.

## 4. Terminal rendering: the degradation ladder

**Product rule: terminals are never frozen into static images at working zoom levels.** The constraint that forces a ladder at all: Chromium caps live WebGL contexts (~16) — WebGL-for-everyone cannot scale, and unthrottled repaint of dozens of verbose agents wastes CPU on unreadable pixels.

| Tier | Condition | Renderer | Refresh |
|---|---|---|---|
| 1 | Visible & readable size (focused or high zoom) | xterm.js WebGL | 60 fps |
| 2 | Visible but small (low zoom; text unreadable anyway) | DOM renderer | throttled 2–5 fps — still visibly alive |
| 3 | Outside viewport | none (render suspended) | 0 — parsing continues in the headless mirror |
| 4 | *Escape hatch only* (50+ terminals, if profiling ever demands) | last-frame snapshot | static |

**Design invariant (decided week 1, do not regress):** the terminal node component must support **hot-swapping renderers per terminal at runtime**. Tier transitions happen on scroll/zoom without losing scrollback or state. Never bind a terminal's identity to its renderer.

WebGL context budget: contexts are granted to tier-1 terminals only (focused first, then largest on-screen), well under the cap; everyone else uses the DOM renderer.

## 5. The IPC bus & `dogwalker` CLI

### 5.1 Transport
- Unix domain socket (macOS/Linux) / named pipe (Windows), created per app instance in the user data dir.
- The `dogwalker` shim is a tiny static binary: parse argv → connect to `DOGWALKER_SOCKET` → send one JSON request (always carrying `DOGWALKER_TERMINAL_ID` as the caller) → stream the response to stdout → exit with the broker's status code. The shim dir also exposes it as `walk` (alias — same binary).
- **No logic in the shim.** All authorization (is the target connected to the caller?), routing, and state live in the host broker. The CLI and any future surface are thin adapters over the same broker API.

### 5.2 `ask` — structured messaging via captured output

```
A: dogwalker ask reviewer "review auth.ts, focus on token expiry"
        │ 1. shim → broker: {cmd: ask, from: A, target: reviewer, body}
        │ 2. broker: validate connection graph (A ↔ reviewer wired?)
        │ 3. broker: snapshot reviewer's plain-text buffer (baseline)
        │ 4. broker → reviewer's PTY: single atomic write of
        │    ESC[200~ + body + ESC[201~ + \r      (bracketed paste)
        │ 5. reviewer works and answers in its own terminal — normally,
        │    running no command; the broker waits for it to go quiet
        │    (the quiescence detector, §6), or times out (180 s).
        │ 6. broker captures the output produced since the baseline,
        ▼    logs it to history, returns it on A's stdout.
```

**Why capture, not a `reply` command.** An earlier design made the target run
`dogwalker reply <id>` to send a structured answer back. Real-world testing
killed it: plain shells and uncooperative agents never replied (the asker hung),
and `reply --stdin` without a heredoc deadlocked reading stdin — so *both* sides
waited forever. Capturing the target's own output needs **no cooperation** and
works with any agent, shell, or process. This reverses the earlier "screen is not
transport" rule; it is the right call because our quiescence detector runs on the
headless mirror and is **focus-independent** — so unlike screen-scraping designs
that must freeze when the user selects the target, capture here is reliable even
while the user interacts.

Key properties:

- **Atomic injection — no visual flash.** Paste-open + body + paste-close + CR go in **one PTY write**. The TUI reads the chunk in one iteration and its next painted frame already shows the message in history, never sitting in the input box. Never split the write or sleep between paste and Enter.
- **Bracketed paste is conditional.** The headless mirror tracks DEC mode 2004. Target has it on (all modern agent TUIs) → paste-wrapped; off (bare shell) → plain write. Either way, no visible escape garbage.
- **Response = output delta.** The broker diffs the target's plain-text buffer (no ANSI) before vs. after, returning the new lines (the echoed prompt + the answer); it falls back to the whole screen if scrollback rolled over.
- **Timeout, never deadlock.** `ask` resolves when the target goes quiet or after its timeout — `--timeout <seconds>` per call (default 180 s, clamped 1 s–1 h); nothing waits on the target running a command.
- **Message history**: every ask (and its captured response) and check is logged per connection edge and surfaced in the UI when clicking a leash — a replayable conversation log.

### 5.3 `check`
Broker serializes the target's headless-mirror screen (xterm serialize addon) and returns it. Read-only, instant, works on **any** terminal — agent or not (builds, dev servers, log tails). No injection involved.

### 5.4 Other verbs
`note read|append|write`, `portal navigate|click|type|screenshot|js|dom|console`, `connect`/`disconnect`, `list`, and Walker's `recruit`/`dismiss`/`assign` are all broker methods gated by the connection graph and (for Walker verbs) the terminal's Walker flag. Recruiting = broker asks the workspace store to create a terminal node with the given preset/role, wires it, and auto-positions it near the recruiter.

### 5.5 The skill
A skill file installed in the user's agent-skills folder (e.g. `~/.claude/skills/dogwalker/`) teaches agents: available verbs, that answering an `ask` is just responding normally in their terminal (no command to run), how to discover peers (`dogwalker list`), and role context location. Because we own both the skill and the broker, protocol evolution is a two-file change.

## 6. Attention detection

- Primary signal: **shell integration marks (OSC 133)** — command start/end sequences emitted by configured shells and understood by xterm.js. "Command ended + nothing new started" = agent idle / waiting for input → attention dot.
- Fallback (no OSC 133): output quiescence heuristic (no PTY output for N seconds while a foreground child exists).
- Detection runs on the headless mirror, so it works for offscreen and hibernation-adjacent states and is independent of UI focus.
- **Focus only suppresses the notification**, never the detection: if the user is actively interacting with that terminal, don't notify them about the terminal they're looking at. Dot state stays truthful.
- `ask` reuses exactly this quiescence signal to know when the target finished responding, then captures its output (see §5.2).

## 7. Images & the Prompt Composer

- Composer is a renderer overlay bound to the focused terminal; drafts persist per terminal in the workspace store.
- Pasted image → written to a session temp dir → the injected prompt references the **file path**. Claude Code, Codex, and Gemini CLI all read image paths from prompts; this is the single uniform mechanism (no clipboard tricks, no per-vendor protocol). Temp files are garbage-collected on terminal close / app exit.
- @-mentions resolve against the terminal's connection graph and inject stable references (note names, portal ids) the CLI understands.

## 8. Floors (git worktrees)

- Create: `git worktree add <floors-dir>/<name> <branch>` (new or existing branch). Near-instant; cross-platform; no filesystem CoW dependency.
- Each floor: own canvas layer (create dialog offers cloning the ground layout or starting empty), own terminals rooted in the worktree path.
- Land: verify clean tree → merge floor branch into chosen target → `git worktree remove` → branch delete (a checkbox in the Land dialog). Conflicts surface with stats; resolution is delegated to the user's tools.
- Hooks (setup / run / teardown) run in the floor dir with env: `DOGWALKER_FLOOR_NAME`, `DOGWALKER_BRANCH_NAME`, `DOGWALKER_FLOOR_PATH`, `DOGWALKER_ROOT_PATH`, `DOGWALKER_PROJECT_NAME`.
- Known, documented constraints (surfaced in UI, not worked around): one checkout per branch across worktrees; untracked files (deps, `.env`) require setup hooks.

## 9. Portals

- One `WebContentsView` per portal with an isolated `session` partition; linked portals share a partition (multi-account testing).
- Automation via CDP attached by the portal controller in main; exposed to agents only through `dogwalker portal ...` (broker-gated by connection).
- Screenshot returns a temp-file path (so agents ingest it the same way as composer images). JS eval and DOM reads return JSON. Console messages are ring-buffered per portal.

## 10. Persistence & hibernation

- Workspace file (JSON): metadata (name, icon, **cwd** — terminals spawn there), node layout, terminal configs, connections, floors, routines, drafts.
- **Background workspaces (v0.2)** — leaving a workspace no longer kills its terminals; agents keep working. Main owns terminal→workspace ownership, so returning **adopts** the live PTYs (replaying each headless mirror into a fresh xterm) instead of respawning. Releasing them is an explicit **hibernate**. Because background workspaces keep their nodes in the graph, the canvas renders only leashes whose both ends are present on it.
- Notes are plain `.md` files owned by the user; the workspace file stores references + positions.
- Hibernate: kill PTYs/portals, keep serialized screen snapshots and layout; resume respawns terminals (shell fresh, layout and scrollback snapshot restored visually). Startup loads only the active workspace.
- Message history: append-only JSONL per workspace.

## 11. Security posture

- Socket/pipe created with user-only permissions; every CLI request carries the caller terminal id, and the broker authorizes strictly by the connection graph (no ambient authority — a terminal can only reach what it's wired to).
- Walker verbs additionally require the terminal's Walker flag.
- No network services, no telemetry, no cloud. Portals are ordinary web browsing surfaces and inherit Chromium's sandbox.

## 12. Validation order (the spike)

Build order is risk-ordered; the first milestone exists to falsify the architecture cheaply:

1. **Spike:** Electron + React Flow + xterm.js/node-pty; 15 terminals running real agents; pan/zoom fluid; renderer hot-swap (tier 1 ↔ 2 ↔ 3) working. If this isn't smooth, revisit before building features.
2. Broker + shim + `ask`/`reply`/`check` + skill (the product's core).
3. Workspaces/persistence, notes, composer, connections UI.
4. File tree, portals, floors, routines, Walker verbs.

Open questions tracked as they arise; none currently block the spike.

## 13. Spike findings (v0.0.1 — PASSED, 2026-07-19, Windows 11)

Automated smoke run (`DW_SMOKE=1 npm start`): 15 terminals — 5 running an
output-flooding stress preset, 10 shells — across five phases (working zoom,
overview zoom, flown-away, return, continuous 20-step pan sweep).

**Validated**
- **60 fps in every phase**, including 8 WebGL terminals under flood and a
  continuous pan across the grid. Typing input path untested by automation.
- Degradation ladder + per-terminal hot-swap works: tier "waves" roll across
  the grid during pans; overview zoom demotes all 15 to DOM renderer; flying
  away suspends all (tier 3). WebGL budget never exceeded 8/8, **zero context
  losses**.
- Headless mirror: 79 KB serialized from main while the renderer instance was
  suspended; tier-3 overflow resync (reset + replay from mirror) works.
- node-pty 1.1.0 is N-API with bundled prebuilds — Forge rebuild skipped via
  `rebuildConfig: { onlyModules: [] }`; no native toolchain needed on dev
  machines.

**Surprises & fixes**
- tldraw license and xterm v6 canvas-renderer removal — already recorded in §1.
- `@xterm/headless` 6.0.0 ships a broken `module` field (points at a
  nonexistent file); worked around with a Vite alias in `vite.main.config.ts`.
- Chromium throttles rAF to ~0 in occluded windows: harmless for the product
  (hidden windows need no frames) but it corrupts fps measurements — smoke
  mode disables `backgroundThrottling`. Early "1 fps" readings were this, not
  rendering cost.
- Terminals promoted to tier 1 before their DOM attach never claimed WebGL;
  `attach()` now claims the entitled context.
- `onMove` recomputes could be swallowed by the rAF guard mid-transition,
  leaving the final viewport unclassified; a 500 ms no-op-when-unchanged
  safety tick self-heals this.

**Author-validated (2026-07-19)**: real agents running in preset terminals —
performance OK; typing echo in the focused terminal — feels immediate.

**Decided**: macOS/Linux verification deferred to the v0.7 cross-OS QA matrix
(Windows is the dev platform).

**Soak results (30 min, 5 flooding + 10 quiet)**: fps 57–60 throughout; app
memory plateaued at ~785 MB with zero monotonic growth; JS heap a healthy
29–52 MB GC sawtooth; **zero context losses over the full session**. A second
run with 15 quiet shells: **615 MB, flat across samples** (fps 60, 0 losses).

**Deviation, consciously accepted**: the ≤ ~500 MB exit criterion was measured
at 615 MB — but in dev mode (React dev build, Vite dev server, HMR). The
architecture signal is the flat plateau and the small marginal cost per
terminal (~170 MB for 5 continuously-flooding terminals), not the fixed
dev-tooling overhead. Packaged-build measurement moves to v0.7 hardening.

**Verdict: spike PASSED (2026-07-19).** The stack holds; v0.1 may begin.

## 14. v0.1 progress — the core loop (in progress, branch `v0.1-core-loop`)

All v0.1 outputs are built and validated: the messaging core (broker/CLI/skill/
connections), workspace persistence, the app shell, notes, the prompt composer,
terminal themes, and attention detection.

**Built — messaging core**
- **GraphStore** (`src/main/graphStore.ts`) — authoritative terminals + leashes;
  the broker authorizes strictly against it.
- **Broker** (`src/main/broker.ts`) — net server on a named pipe (Windows) /
  unix socket; `ask` / `check` / `list` / `note` / `connect` / `disconnect`;
  `ask` injects the message and returns the target's captured output after it
  goes quiet (§5.2), so nothing waits on the target running a reply command.
- **Shim** (`src/shim/shim.mjs` + `src/main/shimDir.ts`) — standalone `dogwalker`
  /`walk` CLI materialized into a per-app shim dir prepended to each PTY's PATH;
  no logic, just framing.
- **Injection** — `PtyManager.inject()` does the one-write bracketed-paste
  (gated on the mirror's DEC mode 2004), the sole PTY writer.
- **History** (`src/main/history.ts`) — append-only JSONL per node pair; the UI
  renders it when a leash is clicked.
- **Connections UI** — React Flow loose-mode handles create leashes; edges are
  derived from the graph; clicking a leash opens the message-history panel.
- **Skill** (`skills/dogwalker/SKILL.md`) — teaches agents the CLI and that
  answering an `ask` is just responding normally in their terminal. **Installed
  on startup** (`src/main/skillInstall.ts`) into `~/.claude/skills/dogwalker/` so
  agents actually discover the CLI — without it the shim is on PATH but no agent
  knows it exists. Other agents' skill conventions come with their presets.

**Validated** (`DW_BROKERTEST=1 npm start`, Windows): `ask` injects a message,
waits for the target to go quiet, and returns its captured output; `check` and
`list` work; an **unwired terminal is denied** (connection-graph auth); and the
**real shim** run through a shell (`dogwalker list`) resolves via PATH and
returns the peer — proving the CLI exists only inside canvas terminals.

**Built — persistence & app shell**
- **WorkspaceStore** (`src/main/workspaceStore.ts`) — workspaces as plain JSON
  under `userData/workspaces` (metadata + layout: node specs with geometry +
  connections as stable-id pairs), an `index.json` holding the active id and the
  sidebar rail — a flat ordered list of workspace and named-divider entries that
  partitions the rail into sections (migrated from the pre-divider `order`
  array). Node identity is a persistent `stableId` distinct from the ephemeral
  live PTY id.
- **FsService** (`src/main/fsService.ts`) — the File Tree node's disk access
  (PRODUCT.md §8). The sandboxed renderer never touches the filesystem directly;
  `readDir`/`readFile`/`writeFile`/`create`/`rename`/`remove`/`stat` all cross
  IPC to here. Listings sort folders-first and degrade a read failure to an
  `error` field rather than throwing across the bridge. File Tree nodes are pure
  layout (kind `filetree`, a `rootPath`), never graph/CLI nodes. File rows are
  native HTML5 drags (`src/app/dnd.ts` carries the path): dropped on a terminal
  they type the path into its PTY; dropped on the canvas a folder opens a File
  Tree rooted there and a file becomes a read-only `preview` node (images via a
  base64 `readImage`, text as a head).
- **GitService** (`src/main/gitService.ts`) — shells out to the system `git`
  (ARCHITECTURE.md §1) scoped to a File Tree's directory: status, branches, log,
  diff, and the branch-menu operations (commit, checkout, branch, merge, stash,
  fetch/pull/push). Reads degrade to empty/`isRepo:false`; operations return
  `{ ok, output }` so the UI shows git's own message on a conflict or missing
  upstream. Two pure renderer helpers keep the hard parts testable: `gitGraph.ts`
  (`computeLanes` — column + segment layout for the graph view) and `diffParse.ts`
  (`parseDiff` — unified diff → side-by-side rows).
- **CodeEditor** (`src/app/CodeEditor.tsx`) — one CodeMirror 6 instance per open
  file (§1). `basicSetup` supplies highlighting, find & replace and multi-cursor;
  Ctrl+S saves through `writeFile`; a text selection can be handed to one of the
  workspace's terminals with a `path:line` reference (written into its PTY, not
  auto-submitted, like a file drag). Opened from a File Tree row (double-click).
- **Search** — a File Tree's search bar does fuzzy filename matching against a
  cached recursive index (`fsService.searchFiles`, heavy dirs like `.git`/
  `node_modules` skipped; scored by the pure `fuzzy.ts`) and, when the query
  starts with `>`, case-insensitive content search (`fsService.grepFiles`,
  binaries/large files skipped). A content hit opens the file in the editor at
  its line (`CodeEditor` `gotoLine`).
- **Note image paste** (`NoteStore.saveImage`) — pasting an image into a note
  writes it to a `<id>.assets/` dir beside the note file and embeds a markdown
  link to its absolute path (PRODUCT.md §6). The formatted view resolves that
  path through `readImage` into a data URI (the CSP blocks `file://`); a
  connected agent reading the note gets the on-disk path and can open it.
  Deleting the note removes its assets.
- **Restore/persist** (`src/app/Canvas.tsx`) — opening a workspace spawns
  terminals from its specs, places them at saved geometry, and re-wires leashes;
  layout is saved (debounced) on move/resize/add/remove/connect/disconnect.
  Switching kills+respawns (keep-alive is v0.2). A `tearingDown` guard stops
  persistence before teardown so killing terminals (which empties the graph)
  can't clobber the stored layout with nodes-minus-edges.
- **App shell** (`src/app/{App,Sidebar,Panel,DevBar}.tsx`) — a workspace rail
  plus a glass, sectioned menu (Workspaces live; Agents/Presets/Roles/Settings
  as placeholders for later versions). The old test toolbar is now `DevBar`,
  rendered only under `import.meta.env.DEV`.

**Validated** (`DW_PERSISTTEST=1`, two launches, Windows, 2026-07-19): launch 1
saves 2 nodes + 1 leash (geometry, names, edge stable-id integrity all OK) and
the layout **survives teardown** on disk; launch 2 restores 2 live terminals +
1 live leash matching the saved specs.

**Built — notes**
- **GraphStore generalized** — nodes carry a `kind` (terminal|note); a note's
  graph id is its stableId (no process). The broker authorizes note access the
  same way — only a wired-up note is reachable.
- **NoteStore** (`src/main/noteStore.ts`) — markdown files under
  `userData/notes/<stableId>.md`, the single writer for both the editor and the
  CLI; emits `update` so an open editor refreshes after an agent writes.
- **`note` verb** (broker + shim) — `dogwalker note read|append|write <name>`,
  gated by the connection graph. `note read --chain` follows note↔note leashes
  (BFS, cycle-safe) and concatenates the connected note cluster — the mind-map
  chain, reachable from an agent wired only to the entry note.
- **NoteNode** (`src/app/NoteNode.tsx`) — a markdown sticky with raw/formatted
  modes (react-markdown + remark-gfm), inline rename, delete-with-file; refreshes
  on `note:update`. Notes are excluded from the terminal render ladder. Added to
  the palette; image paste stays deferred to v0.3.

**Validated** (`DW_NOTETEST=1`, Windows, 2026-07-19): an agent `note read`s a
connected note's content off its own terminal and `note write`s it (file
reflects the change via the single writer); `note read --chain` from an entry
note pulls a downstream note the terminal is not directly wired to; the notes
and the terminal↔note leash persist in the layout and restore.

**Built — prompt composer**
- **Composer** (`src/app/Composer.tsx`) — a floating editor bound to the selected
  terminal. Enter submits via `sendPrompt` (atomic bracketed-paste inject, the
  same path as ask delivery), Shift+Enter newlines. `@` opens a menu of the
  terminal's connected terminals/notes plus "New note" (creates + wires + inserts
  the reference). Pasted images are written to `tmp/dogwalker-drops` and the path
  inserted — the uniform file-path mechanism every agent CLI reads.
- **DraftStore** (`src/main/draftStore.ts`) — per-terminal drafts keyed by
  stableId, persisted to `drafts.json`, so a draft survives workspace switches
  and restarts.
- Deferred to their features / v0.2: `@Walker` and portal mentions, nav-key
  pass-through on an empty composer.

**Validated** (`DW_COMPOSERTEST=1`, Windows, 2026-07-22): the composer shows for
the selected terminal; `@` lists the connected note; a composed message reaches
the terminal; the draft round-trips through disk; a pasted image yields a temp
path.

**Built — terminal themes**
- **Theme model** (`src/shared/themes.ts`) — `ThemeSpec` (xterm ITheme + light/
  dark appearance); 7 built-ins; a validator so a malformed custom theme can't
  break the gallery.
- **SettingsStore** (`src/main/settingsStore.ts`) — persists `{themeName,
  lightThemeName, followSystem}` to `settings.json`; reads custom themes from
  `userData/terminal-themes/*.json`.
- **Apply** — `terminalService.setTheme` recolors every live terminal and any
  spawned afterwards (`term.options.theme`). App resolves the active theme
  (follow-system via `matchMedia`) and applies it globally, surviving the keyed
  Canvas remounts.
- **UI** — the Panel's Settings section: theme swatch gallery, follow-system
  toggle, light-theme picker.

**Validated** (`DW_THEMETEST=1`, Windows, 2026-07-22): 7 built-in themes;
selecting Dracula recolors a live terminal and a newly spawned one; the choice
persists; custom-theme listing works.

**Built — attention detection**
- **Detection** (`src/main/ptyManager.ts`, ARCHITECTURE.md §6) — on the headless
  mirror, so it is focus-independent (invariant #8). OSC 133 refines it when
  shell integration is present (C clears, D raises); the always-on fallback is
  output quiescence: once a terminal has been *engaged* (input ran), going quiet
  for 2.5 s after output raises attention. Input (`write`/`inject`) engages and
  clears. Emits `pty:attention {id,value}`.
- **UI** — a pulsing red dot in the terminal header (`data.attention`); **Shift+A**
  cycles selection + viewport through terminals needing attention.
- **Notification** — on rise, if the terminal isn't selected and the setting is
  on, the renderer fires an Electron notification; focus suppresses only the
  notification, never the dot. Toggle in the Panel's Settings section.

**Validated** (`DW_ATTENTIONTEST=1`, Windows, 2026-07-22): a fresh shell does not
nag; a run command raises attention after it goes quiet and the node shows the
dot; a keystroke clears both.

**v0.1 status: feature-complete on branch `v0.1-core-loop`.** Remaining before
tagging v0.1 proper: exit-criteria dogfooding (the app used to build itself) and
a pass over the README quick start — tracked in [ROADMAP.md](ROADMAP.md).
