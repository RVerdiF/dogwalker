import { describe, it, expect, vi } from 'vitest';
import { seedFirstRun } from './firstRun';
import type { WorkspaceStore } from './workspaceStore';
import type { NoteStore } from './noteStore';

/**
 * seedFirstRun imports only types, so lightweight stubs suffice — the real
 * stores never touch disk here. `fns` keeps typed handles to the vi.fn()s for
 * assertions (the stores themselves are cast for the type-only import).
 */
function makeStubs(nodes: unknown[]) {
  const list = vi.fn(() => ({ active: 'ground' }));
  const load = vi.fn(() => ({ layout: { nodes, edges: [] } }));
  const saveLayout = vi.fn();
  const register = vi.fn();
  const write = vi.fn();
  const unload = vi.fn();
  return {
    workspaces: { list, load, saveLayout } as unknown as WorkspaceStore,
    notes: { register, write, unload } as unknown as NoteStore,
    fns: { list, load, saveLayout, register, write, unload },
  };
}

describe('seedFirstRun', () => {
  it('is a no-op when the active workspace already has nodes', () => {
    const { workspaces, notes, fns } = makeStubs([{ kind: 'terminal' }]);
    seedFirstRun(workspaces, notes);
    expect(fns.list).toHaveBeenCalledOnce();
    expect(fns.load).toHaveBeenCalledWith('ground');
    expect(fns.register).not.toHaveBeenCalled();
    expect(fns.write).not.toHaveBeenCalled();
    expect(fns.unload).not.toHaveBeenCalled();
    expect(fns.saveLayout).not.toHaveBeenCalled();
  });

  it('registers, writes and unloads the welcome note, then saves the layout', () => {
    const { workspaces, notes, fns } = makeStubs([]);
    seedFirstRun(workspaces, notes);

    expect(fns.register).toHaveBeenCalledExactlyOnceWith('welcome-note', 'welcome');
    expect(fns.write).toHaveBeenCalledExactlyOnceWith(
      'welcome-note',
      expect.stringContaining('Welcome to Dogwalker'),
    );
    expect(fns.unload).toHaveBeenCalledExactlyOnceWith('welcome-note');
    expect(fns.saveLayout).toHaveBeenCalledExactlyOnceWith('ground', {
      nodes: [
        {
          kind: 'note',
          stableId: 'welcome-note',
          name: 'welcome',
          x: 40,
          y: 40,
          w: 460,
          h: 420,
        },
      ],
      edges: [],
    });
  });

  it('performs the steps in order: register, write, unload, saveLayout', () => {
    const { workspaces, notes, fns } = makeStubs([]);
    seedFirstRun(workspaces, notes);
    // invocationCallOrder is a file-global counter (earlier tests consumed
    // values), so assert relative ordering instead of absolute values.
    const [r, w, u, s] = [fns.register, fns.write, fns.unload, fns.saveLayout].map(
      (m) => m.mock.invocationCallOrder[0],
    );
    expect(r).toBeLessThan(w);
    expect(w).toBeLessThan(u);
    expect(u).toBeLessThan(s);
  });

  it('seeds the welcome note with markdown that welcomes the user', () => {
    const { workspaces, notes, fns } = makeStubs([]);
    seedFirstRun(workspaces, notes);
    const body = fns.write.mock.calls[0][1] as string;
    expect(body).toContain('Welcome to Dogwalker');
    expect(body).toContain('# Welcome to Dogwalker');
  });
});
