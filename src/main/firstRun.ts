import type { NoteStore } from './noteStore';
import type { WorkspaceStore } from './workspaceStore';

const WELCOME = `# Welcome to Dogwalker 🐕

This is a **note** — a markdown file on disk, living on your canvas. Double-click
to edit it; the ¶ button toggles raw markdown.

## Try this

1. Add a terminal from the palette at the top — pick an agent (Claude, Codex,
   Gemini) or a plain shell.
2. Drag from a node's side handle onto another node to put them on a **leash**.
3. Ask a wired agent to talk to its peer:

   \`\`\`
   dogwalker ask <name> "review auth.ts"
   \`\`\`

   It delivers the message, waits for the answer, and prints it back.

## Handy

- \`dogwalker list\` — who am I connected to?
- \`dogwalker check <name>\` — read another terminal's screen (a build, a log tail).
- \`dogwalker note read <name>\` — read a connected note like this one.
- **Shift+A** cycles terminals that need you · **Shift+M** minimap · **Shift+T** tidy.

Delete this note whenever you like — the × on its header removes it and its file.
`;

/**
 * Seed a friendly starting point the first time the app runs, so the canvas is
 * never a blank void (PRODUCT.md v0.2 first-run). Idempotent: it only fires when
 * the active workspace has never had any nodes.
 */
export function seedFirstRun(
  workspaces: WorkspaceStore,
  notes: NoteStore,
): void {
  const { active } = workspaces.list();
  const ws = workspaces.load(active);
  if (ws.layout.nodes.length > 0) return;

  const noteId = 'welcome-note';
  notes.register(noteId, 'welcome');
  notes.write(noteId, WELCOME);
  // Registering put it in the live graph; the canvas will re-register on open.
  notes.unload(noteId);

  workspaces.saveLayout(active, {
    nodes: [
      {
        kind: 'note',
        stableId: noteId,
        name: 'welcome',
        x: 40,
        y: 40,
        w: 460,
        h: 420,
      },
    ],
    edges: [],
  });
}
