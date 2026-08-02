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
│   • Message broker (ask capture, timeouts, history log)                  │
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
- Custom presets and reusable roles live in local JSON stores. Applying a role
  writes a role Markdown file in the terminal cwd, then uses the same atomic
  PTY injection path to tell the live agent to read it.
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

### 5.6 Roles and presets

`PresetStore` and `RoleStore` persist custom records as local JSON alongside the
other app data; built-in presets remain read-only. The broker is the shared
resolver for Walker and UI configuration. `PtyManager.assignRole()` writes
`.dogwalker/roles/<stable-id>.md` in the terminal cwd and calls the normal atomic
injection path to direct the live agent to it. The renderer persists ids, shows
missing configurations without blocking workspace recovery, and lets users pick
a replacement (preset changes apply on restart).

### 5.7 Team asks and response contracts

The broker expands `ask --all` only from the caller's direct terminal neighbors;
each recipient still takes the normal `resolvePeer` authorization path. It runs
the ordinary atomic injection/capture cycle per target and returns a deterministic
result array with a shared broadcast id; history retains that id on each leash
entry. `ContractStore` persists local response contracts. For a contract ask,
the broker appends output guidance, extracts one JSON object from the captured
text, validates required typed fields, and returns the parsed value or errors.
For a single contract ask, the shim prints that result object directly; strict
validation failures print the same object and exit non-zero. If configured, the
broker atomically injects the contract's post-rejection prompt with validation
errors, without awaiting or capturing a retry. The shim only forwards flags and
formats output; it has no validation or authorization logic.

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

**Built — floor model + create/switch/delete (v0.5 block 1)**
- A floor is a **layer** of a workspace: the workspace's own `layout`/`cwd` is the
  implicit "ground"; each floor (`FloorRecord` in the workspace file) has its own
  `layout`, its own `branch`, and a worktree `path` under
  `<parent>/.dogwalker-floors/<workspaceId>/<name>` (outside the repo tree).
  `GitService` gained the worktree verbs (`worktreeAdd/Remove/List`, `isClean`,
  `deleteBranch`, `diffStat`); `WorkspaceStore` the floor CRUD + `loadLayer`/
  `saveLayer` (ground routes to the workspace layout).
- The renderer keys everything on a **layer id** — `workspaceId` for ground,
  the floor id otherwise — passed to the PTY manager as the grouping id, so a
  floor's terminals are separate and survive backgrounding (ground and a floor
  can each run a dev server). The `Canvas` loads/saves via the layer, the
  `FloorBar` switches/creates/deletes, and "clone ground" copies the arrangement
  with regenerated stableIds so layers never share a graph node or note file.

**Built — Land flow (v0.5 block 2)**
- Land merges a floor's branch into a chosen target and removes the worktree.
  The Land dialog (`landInfo`) shows the target branch picker, a `diff --stat`
  preview, and blocks when either tree is dirty. `land` runs the safe sequence:
  clean-check floor + ground → check out the target in the ground if needed →
  `git merge <floorBranch>`. On success it kills the layer's terminals, drops
  the worktree and (optionally) the branch. **On conflict it `git merge --abort`s
  and surfaces git's message** — the tree is never left half-merged and the
  worktree stays put for the user to resolve.

**Built — floor hooks (v0.5 block 3)**
- Hooks live in the project's `.dogwalker/hooks.json` at the ground root
  (versionable): `{ setup, run, teardown }` shell strings. `HookService` runs a
  hook in the floor's worktree with the `DOGWALKER_*` env
  (`FLOOR_NAME`/`BRANCH_NAME`/`FLOOR_PATH`/`ROOT_PATH`/`PROJECT_NAME`), so setup
  can install deps or copy an `.env` that worktrees don't inherit. `setup`
  auto-runs on create, `run` on demand (a chip button, output shown), `teardown`
  before the worktree is removed on delete or land. A missing hook is a no-op.

**Built — floor-aware broker/CLI + constraints (v0.5 block 4)**
- Every terminal carries its floor label (`floorName` on the PTY entry). The
  broker's `list` annotates each peer with `[floor]`, so an agent sees which
  layer a teammate works on. Because the graph is global and terminals outlive
  layer switches, `ask`/`check` reach a **cross-floor** target the moment it's
  wired (e.g. via `dogwalker connect <name>`) — no floor-specific routing.
- Worktree constraints are surfaced, not worked around: the create dialog spells
  out one-checkout-per-branch and untracked-files-need-setup, and git's own
  "branch already checked out" error is shown when it happens.

## 9. Portals

- One `WebContentsView` per portal with an isolated `session` partition; linked portals share a partition (multi-account testing).
- Automation via CDP attached by the portal controller in main; exposed to agents only through `dogwalker portal ...` (broker-gated by connection).
- Screenshot returns a temp-file path (so agents ingest it the same way as composer images). JS eval and DOM reads return JSON. Console messages are ring-buffered per portal.

**Built — portal plumbing (v0.4 block 1)**
- **PortalManager** (`src/main/portalManager.ts`) owns a `WebContentsView` per
  portal in a `persist:dw-portal-<partition>` session (isolated by default, so
  logins survive and don't leak). Main owns the browser lifecycle + navigation
  (`create`/`navigate`/`back`/`forward`/`reload`/`destroy`), a per-portal console
  ring buffer, and pushes `portal:nav` state to the renderer. Geometry lives in
  the renderer: `PortalNode` (kind `portal`, persisted with `url`+`partition`)
  reports its body's on-screen rect and the canvas zoom (`setBounds`) on every
  pan/zoom/move/resize, so the native view stays glued to the node and scales
  with zoom via `setZoomFactor`. Mount creates the view, unmount destroys it;
  the persistent partition keeps sessions across recreation. Linking attaches
  here in block 3.

**Built — portal automation (v0.4 block 2)**
- Portals are graph nodes (kind `portal`, registered on create), so a terminal
  leashed to one can drive it — and only it — through the `portal` verb; the
  broker gates every op with `graph.resolvePeer(from, target, 'portal')`, the
  same connection-graph authorization as `ask`/`note`. No ambient reach.
- The `portal` CLI (shim + broker + `PortalManager`): `navigate`, `click`,
  `type`, `scroll`, `js`, `dom`, `console`, `screenshot`. Interaction runs
  through `executeJavaScript` (selector-based, value-setter-safe typing); DOM
  reads return capped outer HTML; `console` drains the per-portal ring buffer;
  `screenshot` uses CDP `Page.captureScreenshot` (works offscreen) and returns a
  temp-file path so agents ingest it like a composer image. Results cross the
  wire as JSON.

**Built — linked + agent-created portals (v0.4 block 3)**
- Linking is a shared session partition: a portal's "link" button creates a
  sibling with the same `persist:` partition (so both hold the same login —
  multi-account testing across two views), leashed to it. Unlinked portals keep
  their own partition, so accounts never leak.
- Agents create portals themselves: `portal new [url]` (broker makes the view +
  graph node, wires it to the caller, and tells the renderer to materialize a
  canvas node) and `@New Portal` in the composer. The canvas reconciles portal
  nodes against the graph, so a portal an agent or peer destroys disappears.
- The agent skill (`skills/dogwalker/SKILL.md`) documents the whole `portal`
  contract so agents discover and use it.

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
2. Broker + shim + `ask`/`check` + skill (the product's core).
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

**Built — routines (v0.6 block 1)**
- **RoutineService** (`src/main/routineService.ts`, PRODUCT.md §11) — a routine
  is a scheduled prompt aimed at an agent (by `targetStableId`). Its `&&`/newline
  steps run one at a time, each injected then awaited to quiescence (the same
  `ptyManager.awaitQuiet` signal `ask` uses) before the next — so multi-step
  chains respect agent turns. A tick landing while a run is in flight is dropped
  (a `running` guard), so a slow agent never overlaps or leaves zombie state; a
  routine whose target isn't live skips quietly. Persisted to `routines.json`
  (never resurrecting a `running` status); status changes emit `routine:update`.
  The renderer's Panel → Routines section creates/pauses/runs/deletes them with a
  live status dot.

**Built — Walker mode (v0.6 block 2)**
- A terminal can be flagged a **Walker** (crown toggle in its header; `walker` on
  the PTY entry + persisted in the spec). Only a Walker may call the manager
  verbs, broker-gated by `ptys.isWalker(from)`: `recruit --agent <preset> --role
  <role>` spawns a teammate on the Walker's own layer, inheriting its cwd and
  wired to it; `dismiss <recruit>` kills the recruit (its graph node + edges go
  with it); `assign <recruit> --role <role>` relabels it. The broker spawns the
  PTY directly (so the recruit is automatable at once) and announces it to the
  renderer, which adopts the node beside the Walker (`terminal:recruited`); a
  recruit on another layer is alive and wired but its node appears when that layer
  is opened. The composer marks Walkers among mentions (👑). `recruit --floor
  <name>` places the recruit on a sibling floor's layer + worktree cwd (resolved
  by `WorkspaceStore.resolveFloorTarget`); it stays wired to the Walker, so a
  cross-floor `ask` round-trips.

**Validated — v0.6 dogfooding (`DW_V06BDD=1`)** — the exit-criteria user
scenarios end to end over the real broker: a Walker assembles a coder+reviewer+
tester team all wired to it and reading a shared SPEC note; a routine chain
`echo BUILD_OK && echo TEST_OK && dogwalker note append SUMMARY …` writes the
result to a note and returns to idle (no zombie); dismissing the reviewer
removes its terminal, graph node and every edge; and a `recruit --floor feat`
teammate answers its Walker's `ask` across the floor boundary.

**Built — failure recovery (v0.7 block 1)**
- **Orphaned worktrees**: on opening a workspace the renderer runs
  `floor:reconcile` — floor records whose worktree directory was deleted outside
  Dogwalker are dropped and `git worktree prune` clears git's stale metadata. It
  never touches a worktree that still exists.
- **Dead targets**: a terminal that exits removes its own graph node
  (`graph.removeNode` on PTY exit), so an `ask`/`check`/`portal`/Walker verb to it
  resolves to "not connected" **instantly** rather than blocking on the `ask`
  timeout — no hangs.
- **Terminal restart**: an exited terminal shows a ↻ that respawns it in place —
  fresh PTY, same stableId + geometry (leashes re-form from the saved layout).
- **Portal renderer crash**: a `render-process-gone` reloads the portal in place.
- Validated by `DW_RECOVERYTEST` (orphan reconcile + fast-fail to dead targets).

**Built — CLAUDE.md ↔ AGENTS.md sync (v0.7 block 2, the last deferred feature)**
- **AgentDocsSync** (`src/main/agentDocsSync.ts`, PRODUCT.md §12) — a per-workspace
  toggle (`syncAgentDocs`, persisted; armed on startup for enabled workspaces).
  When on, it watches the workspace cwd and mirrors edits between `CLAUDE.md` and
  `AGENTS.md` so mixed-agent projects share one set of instructions. Enabling
  reconciles first (the newer file wins; a missing counterpart is seeded); a
  content-equality guard makes the mirror write a no-op on the echo, so there's
  no watch loop. Toggle lives on each workspace card. `DW_DOCSYNCTEST` covers
  seed / mirror-both-ways / newer-wins / live-watch.

**Built — release engineering (v0.8)**
- Installers via electron-forge makers per OS (Squirrel `.exe`, DMG, ZIP,
  Deb/Rpm, AppImage); `npm run make` builds the host OS's artifact. MIT LICENSE;
  README install instructions; version 0.8.0 (RC line).
- CI (`.github/workflows/build.yml`): a `check` job (typecheck + lint) on every
  PR, and a tag-triggered `make` matrix (macOS/Windows/Linux) that builds +
  uploads each OS's installer. Dogfooding note: the first CI run on the v0.8 PR
  **caught a real gap** — the `lint` script called eslint, which had never been a
  dependency; it now has a lean flat `eslint.config.mjs` (typecheck stays the
  correctness gate) and runs clean. Signing/notarization + `.msi` and off-Windows
  fresh-install QA are deferred (no certs/machines here), documented in README.

**Built — versioned skill (v0.8 block 2)**
- The agent skill carries a `version:` in its frontmatter. `installSkill` (main,
  on startup) compares the shipped version against the already-installed copy
  before overwriting; a change logs a mismatch warning (`skill contract changed
  v<old> → v<new>`) so an agent that learned the CLI before an upgrade is flagged
  to re-read it. Logic is a pure `parseSkillVersion` + `installSkillTo(src, dest)`
  returning `{version, previousVersion, upgraded}`; `DW_SKILLVERTEST` covers
  parse / fresh / upgrade / same-version.

**v0.7 hardening — status (2026-07-30, Windows)**
- **Invariant audit**: all ten AGENTS.md invariants audited against the code and
  holding (see AGENTS.md → "Invariant audit — v0.7").
- **Failure recovery** (§ above) + **doc-sync** shipped and tested.
- **Scale**: the `DW_SMOKE`/`DW_SOAK` harness (from the spike) remains the scale
  probe; the spike met its fps/context-budget criteria at 15 terminals and
  **tier-4 snapshot rendering was intentionally not built** because profiling did
  not demand it — that decision stands for v0.7. `DW_SMOKE` on Windows
  (15 terminals): 60 fps near / 60 fps panning / 47 fps at static overview,
  ≤8 live WebGL contexts, 0 context losses — within the spike budget.
- **Cross-OS QA matrix**: exercised on **Windows** only in this environment;
  macOS + Linux (X11/Wayland) execution is **deferred and documented as pending**
  — it needs those machines. No OS-specific hacks are in the code (worktrees,
  paths, and shells are handled portably), so the matrix is expected to pass, but
  it is not yet *verified* off-Windows. This is the one v0.7 exit criterion that
  remains open by environment, not by code.
