# Dogwalker — Architecture

How Dogwalker is built. For what it is and why, see [PRODUCT.md](PRODUCT.md).

---

## 1. Stack & rationale

| Layer | Choice | Why |
|---|---|---|
| App shell | **Electron + TypeScript** | The only stack where all three hard requirements are cheap at once: terminals (xterm.js + node-pty across macOS/Win/Linux), embedded automatable browsers (Chromium `WebContentsView` + CDP), and a mature canvas ecosystem. A native-per-OS approach multiplies every module by ~3. |
| Canvas | **tldraw** (custom shape types) | Infinite pan/zoom, groups, snapping, align/distribute, undo/redo, minimap — most of the canvas feature list — out of the box. We implement custom shapes (terminal, note, portal, file tree) and the connection cables. |
| Terminal emulation | **xterm.js** (WebGL + canvas renderers) + **node-pty** | Battle-tested emulator; node-pty covers posix PTYs and Windows ConPTY. |
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
│  Canvas UI (tldraw) · xterm.js instances · Prompt Composer · File Tree    │
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
| 2 | Visible but small (low zoom; text unreadable anyway) | canvas-2D | throttled 2–5 fps — still visibly alive |
| 3 | Outside viewport | none (render suspended) | 0 — parsing continues in the headless mirror |
| 4 | *Escape hatch only* (50+ terminals, if profiling ever demands) | last-frame snapshot | static |

**Design invariant (decided week 1, do not regress):** the terminal node component must support **hot-swapping renderers per terminal at runtime**. Tier transitions happen on scroll/zoom without losing scrollback or state. Never bind a terminal's identity to its renderer.

WebGL context budget: contexts are granted to tier-1 terminals only (focused first, then largest on-screen), well under the cap; everyone else uses canvas-2D.

## 5. The IPC bus & `dogwalker` CLI

### 5.1 Transport
- Unix domain socket (macOS/Linux) / named pipe (Windows), created per app instance in the user data dir.
- The `dogwalker` shim is a tiny static binary: parse argv → connect to `DOGWALKER_SOCKET` → send one JSON request (always carrying `DOGWALKER_TERMINAL_ID` as the caller) → stream the response to stdout → exit with the broker's status code. The shim dir also exposes it as `walk` (alias — same binary).
- **No logic in the shim.** All authorization (is the target connected to the caller?), routing, and state live in the host broker. The CLI and any future surface are thin adapters over the same broker API.

### 5.2 `ask` / `reply` — structured messaging, not screen scraping

```
A: dogwalker ask reviewer "review auth.ts, focus on token expiry"
        │ 1. shim → broker: {type: ask, from: A, target: reviewer, body}
        │ 2. broker: validate connection graph (A ↔ reviewer wired?)
        │ 3. broker: msg-id assigned; delivery text composed:
        │    "[message from A, id 7f2c] review auth.ts … reply with:
        │     dogwalker reply 7f2c --stdin <<'EOF' … EOF"
        │ 4. broker → reviewer's PTY: single atomic write of
        │    ESC[200~ + delivery text + ESC[201~ + \r      (bracketed paste)
        │ 5. reviewer's agent works, then runs:
        │       dogwalker reply 7f2c --stdin <<'EOF'
        │       done — two issues: …
        │       EOF
        │ 6. broker correlates by msg-id, logs to history,
        ▼    unblocks A's shim with the reply on stdout (or times out).
```

Key properties:

- **Byte-exact replies.** The reply arrives as stdin of a process over the socket — the target's screen contents, focus state, or user interaction are irrelevant to transport. (The screen still *shows* everything as a natural side effect: the delivered message appears in the target's chat history, and the reply command is visible in its TUI.)
- **Atomic injection — no visual flash.** Paste-open + body + paste-close + CR go in **one PTY write**. The TUI reads the chunk in one iteration and its next painted frame already shows the message in history, never sitting in the input box. Never split the write or sleep between paste and Enter.
- **Bracketed paste is conditional.** The headless mirror tracks DEC mode 2004. Target has it on (all modern agent TUIs) → paste-wrapped; off (bare shell) → plain write. Either way, no visible escape garbage.
- **Politeness hold (refinement, not correctness):** if the user typed in the target within ~1 s, the broker delays injection until quiescent. Injection is atomic regardless; this only avoids sharing the input box with a half-typed user draft.
- **`--stdin` heredoc is the canonical reply form** (taught by the skill): multi-line and quote-heavy replies never fight shell escaping. `--json` available on `ask` for structured consumption.
- **Timeouts**: `ask` fails with a distinct exit code if no `reply` arrives in the window (agent forgot / crashed); the skill teaches agents to always reply via CLI.
- **Message history**: every ask/reply/check is logged per connection edge (who, what, when, status) and surfaced in the UI when clicking a cable. This is the structural advantage over scraping designs — an exact, replayable conversation log.

### 5.3 `check`
Broker serializes the target's headless-mirror screen (xterm serialize addon) and returns it. Read-only, instant, works on **any** terminal — agent or not (builds, dev servers, log tails). No injection involved.

### 5.4 Other verbs
`note read|append|write`, `portal navigate|click|type|screenshot|js|dom|console`, `connect`/`disconnect`, `list`, and Walker's `recruit`/`dismiss`/`assign` are all broker methods gated by the connection graph and (for Walker verbs) the terminal's Walker flag. Recruiting = broker asks the workspace store to create a terminal node with the given preset/role, wires it, and auto-positions it near the recruiter.

### 5.5 The skill
A skill file installed in the user's agent-skills folder (e.g. `~/.claude/skills/dogwalker/`) teaches agents: available verbs, the reply-via-`--stdin` contract, how to discover peers (`dogwalker list`), and role context location. Because we own both the skill and the broker, protocol evolution is a two-file change.

## 6. Attention detection

- Primary signal: **shell integration marks (OSC 133)** — command start/end sequences emitted by configured shells and understood by xterm.js. "Command ended + nothing new started" = agent idle / waiting for input → attention dot.
- Fallback (no OSC 133): output quiescence heuristic (no PTY output for N seconds while a foreground child exists).
- Detection runs on the headless mirror, so it works for offscreen and hibernation-adjacent states and is independent of UI focus.
- **Focus only suppresses the notification**, never the detection: if the user is actively interacting with that terminal, don't notify them about the terminal they're looking at. Dot state stays truthful.
- `ask` completion-waiting reuses the same lifecycle signals when it needs to know "target finished a turn" (e.g. for queued routines) — but reply transport never depends on it (see §5.2).

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

- Workspace file (JSON): node layout, terminal configs (preset, role, theme, limits), connections, floors, routines, drafts.
- Notes are plain `.md` files owned by the user; the workspace file stores references + positions.
- Hibernate: kill PTYs/portals, keep serialized screen snapshots and layout; resume respawns terminals (shell fresh, layout and scrollback snapshot restored visually). Startup loads only the active workspace.
- Message history: append-only JSONL per workspace.

## 11. Security posture

- Socket/pipe created with user-only permissions; every CLI request carries the caller terminal id, and the broker authorizes strictly by the connection graph (no ambient authority — a terminal can only reach what it's wired to).
- Walker verbs additionally require the terminal's Walker flag.
- No network services, no telemetry, no cloud. Portals are ordinary web browsing surfaces and inherit Chromium's sandbox.

## 12. Validation order (the spike)

Build order is risk-ordered; the first milestone exists to falsify the architecture cheaply:

1. **Spike:** Electron + tldraw + xterm.js/node-pty; 15 terminals running real agents; pan/zoom fluid; renderer hot-swap (tier 1 ↔ 2 ↔ 3) working. If this isn't smooth, revisit before building features.
2. Broker + shim + `ask`/`reply`/`check` + skill (the product's core).
3. Workspaces/persistence, notes, composer, connections UI.
4. File tree, portals, floors, routines, Walker verbs.

Open questions tracked as they arise; none currently block the spike.
