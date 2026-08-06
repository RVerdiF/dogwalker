import { describe, it, expect } from 'vitest';
import type { SidebarEntry } from '../shared/ipc';
import { sectionsOf, reorderByDrop } from './sidebarOps';

const ws = (id: string): SidebarEntry => ({ kind: 'workspace', id });
const div = (id: string, label: string): SidebarEntry => ({ kind: 'divider', id, label });

describe('sectionsOf', () => {
  it('groups workspaces under the divider that precedes them', () => {
    const sections = sectionsOf([ws('a'), div('d1', 'Work'), ws('b'), ws('c')]);
    expect(sections).toEqual([
      { workspaceIds: ['a'] },
      { dividerId: 'd1', label: 'Work', workspaceIds: ['b', 'c'] },
    ]);
  });

  it('drops the implicit leading section when a divider comes first', () => {
    const sections = sectionsOf([div('d1', 'Top'), ws('a')]);
    expect(sections).toEqual([{ dividerId: 'd1', label: 'Top', workspaceIds: ['a'] }]);
  });
});

describe('reorderByDrop', () => {
  const entries = [ws('a'), ws('b'), ws('c')];

  it('moves an entry to before the target', () => {
    expect(reorderByDrop(entries, 'c', 'a', 'before').map((e) => e.id)).toEqual(['c', 'a', 'b']);
  });

  it('moves an entry to after the target', () => {
    expect(reorderByDrop(entries, 'a', 'c', 'after').map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('is a no-op when dropped onto itself or an unknown target', () => {
    expect(reorderByDrop(entries, 'a', 'a', 'before').map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(reorderByDrop(entries, 'a', 'zzz', 'after').map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });
});
