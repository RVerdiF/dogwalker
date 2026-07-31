# PRODUCT.md ↔ build parity audit (v1.0)

Every user-facing feature area of [PRODUCT.md](PRODUCT.md) checked against the
shipped code. Status as of the v1.0 launch. ✅ = built and exercised (harness or
dogfooding); ⚠️ = built with a documented limitation.

| PRODUCT.md | Feature | Status | Evidence |
|---|---|---|---|
| §3 Canvas | node create/move/resize/duplicate/delete, grid + magnetic snapping, align/distribute/tidy, groups, minimap, focus/zoom, undo/redo | ✅ | `Canvas.tsx`, `snapping.ts`, `layoutOps.ts`, `GroupNode.tsx`; `DW_SNAPTEST`, `DW_LAYOUTTEST`, `DW_GROUPTEST` |
| §4 Terminals & Agents | 5 presets + shell, names/badges, degradation ladder + hot-swap, attention (OSC 133 + quiescence), per-terminal memory limits, themes | ✅ | `terminalService.ts`, `ptyManager.ts`, `presets.ts`; `DW_SMOKE`, `DW_ATTENTIONTEST`, `DW_MEMTEST`, `DW_THEMETEST` |
| §5 Connections & CLI | leashes, connections popover, per-leash history; `ask`(capture)/`check`/`list`/`connect`/`disconnect`/`note`/`portal`/`recruit`/`dismiss`/`assign`; broker gated by the graph | ✅ | `broker.ts`, `shim.mjs`, `graphStore.ts`; `DW_BROKERTEST`, `DW_PORTALCLITEST`, `DW_WALKERTEST` |
| §6 Notes | markdown on disk, raw/formatted, rename, delete-with-file, note chaining, `note read/append/write`, **image paste** | ✅ | `NoteNode.tsx`, `noteStore.ts`; `DW_NOTETEST`, `DW_IMGTEST` |
| §7 Prompt Composer | floating editor, per-terminal drafts, send/newline, image paste, @-mentions (terminals/notes/new-note/new-portal/Walkers) | ✅ | `Composer.tsx`; `DW_COMPOSERTEST` |
| §8 File Tree | list view, file ops, drag-to-terminal / drag-to-canvas, git diff + graph views, CodeMirror editor + send-to-agent, fuzzy + content search | ✅ | `FileTreeNode.tsx`, `fsService.ts`, `gitService.ts`, `CodeEditor.tsx`; `DW_FSTEST`, `DW_FILEOPSTEST`, `DW_GITTEST`, `DW_EDITORTEST`, `DW_SEARCHTEST` |
| §9 Portals | isolated `WebContentsView`, URL/nav, `portal` CLI (navigate/click/type/scroll/js/dom/console/screenshot), linked (shared session), agent-created | ✅ | `portalManager.ts`, `PortalNode.tsx`; `DW_PORTALTEST`, `DW_PORTALCLITEST`, `DW_PORTALLINKTEST` |
| §10 Floors | worktree create/switch/delete, land (merge + safe conflict abort), hooks (setup/run/teardown + env), orphan reconcile | ✅ | `gitService.ts`, `workspaceStore.ts`, `hookService.ts`, `FloorBar.tsx`; `DW_FLOORTEST`, `DW_LANDTEST`, `DW_HOOKTEST` |
| §11 Routines | scheduled prompt + interval + target, `&&` chains awaiting quiescence, pause/resume/delete, live status | ✅ | `routineService.ts`, `Panel.tsx`; `DW_ROUTINETEST` |
| §12 Workspaces & shell | create/edit/switch, cwd + icon, sidebar (dividers, mini/expanded), background + hibernate, shortcuts, open-in-editor, CLAUDE.md↔AGENTS.md sync | ✅ | `workspaceStore.ts`, `Sidebar.tsx`, `App.tsx`, `agentDocsSync.ts`; `DW_SIDEBARTEST`, `DW_BGTEST`, `DW_DOCSYNCTEST` |
| §13 Compatibility | macOS / Windows / Linux | ⚠️ | Built portably (no OS-specific hacks); **QA verified on Windows only** — macOS/Linux passes pending (README known-limitation). |

**Deferred with rationale (not silent gaps):** code signing + notarization and
`.msi` (no certs); tier-4 snapshot rendering (spike didn't need it); the cross-OS
QA matrix and the "stranger installs on each OS" / "author dogfoods v1.0" launch
exit criteria (human + multi-machine, can't be self-verified here). All are
called out in the README and ARCHITECTURE, not hidden.

No silent gaps: every PRODUCT.md §3–§12 capability is present in the build.
