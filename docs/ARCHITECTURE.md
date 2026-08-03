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

- A floor is a **layer** of a workspace: the workspace's own `layout`/`cwd` is the
  implicit "ground"; each floor (a `FloorRecord` in the workspace file) has its own
  `layout`, its own `branch`, and a worktree `path` under
  `<parent>/.dogwalker-floors/<workspaceId>/<name>` (outside the repo tree). The
  renderer keys terminals and layout on a **layer id** — `workspaceId` for ground,
  the floor id otherwise — so a floor's terminals are separate and survive
  backgrounding (ground and a floor can each run their own dev server).
- **Create:** `git worktree add` on a new or existing branch — near-instant,
  cross-platform, no filesystem CoW dependency. The create dialog offers cloning
  the ground layout (stableIds regenerated so layers never share a graph node or
  note file) or starting empty.
- **Land:** clean-tree check (floor + ground) → check out the target branch in the
  ground if needed → `git merge <floorBranch>` → kill the layer's terminals →
  `git worktree remove` → optional branch delete. The Land dialog shows the target
  picker and a `diff --stat` preview and blocks when either tree is dirty. **On
  conflict it `git merge --abort`s and surfaces git's message** — never left
  half-merged; resolution stays in the user's tools.
- **Hooks:** `.dogwalker/hooks.json` at the ground root (versionable) holds
  `{ setup, run, teardown }` shell strings, run in the floor's worktree with env
  `DOGWALKER_FLOOR_NAME` / `BRANCH_NAME` / `FLOOR_PATH` / `ROOT_PATH` /
  `PROJECT_NAME`. `setup` auto-runs on create (e.g. install deps, copy an `.env`
  that worktrees don't inherit), `run` on demand, `teardown` before removal; a
  missing hook is a no-op.
- **Floor-aware broker/CLI:** each terminal carries its floor label; the broker's
  `list` annotates each peer with `[floor]`. Because the graph is global and
  terminals outlive layer switches, `ask`/`check` reach a **cross-floor** target
  the moment it's wired — no floor-specific routing.
- **Constraints** (surfaced in UI, not worked around): one checkout per branch
  across worktrees; untracked files (deps, `.env`) require setup hooks.

## 9. Portals

- One `WebContentsView` per portal in an isolated `persist:dw-portal-<partition>`
  session, so logins survive and don't leak. Main owns the browser lifecycle
  (`create`/`navigate`/`back`/`forward`/`reload`/`destroy`) and a per-portal
  console ring buffer. Geometry lives in the renderer: `PortalNode` reports its
  on-screen rect and the canvas zoom on every pan/zoom/move/resize, so the native
  view stays glued to the node and scales with zoom.
- Portals are **graph nodes**: a terminal leashed to one can drive it — and only
  it — through `dogwalker portal ...`, gated by `graph.resolvePeer`, the same
  connection-graph authorization as `ask`/`note`. No ambient reach.
- Verbs (via CDP attached by the portal controller in main): `navigate`, `click`,
  `type`, `scroll`, `js`, `dom`, `console`, `screenshot`. Interaction runs through
  `executeJavaScript` (selector-based, value-setter-safe typing); DOM reads return
  capped outer HTML; `console` drains the ring buffer; `screenshot` uses CDP
  `Page.captureScreenshot` (works offscreen) and returns a temp-file path so agents
  ingest it like a composer image. Results cross the wire as JSON.
- **Linking** creates a sibling portal on the same `persist:` partition (both hold
  the same login — multi-account testing across two views), leashed to it; unlinked
  portals keep their own partition so accounts never leak. Agents create portals
  themselves (`portal new [url]` / `@New Portal`); the canvas reconciles portal
  nodes against the graph, so a portal a peer destroys disappears.

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
