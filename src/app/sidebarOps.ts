/**
 * Pure helpers for the workspace rail (PRODUCT.md §12 — folders / group
 * dividers). The rail is a flat ordered list of {@link SidebarEntry}; dividers
 * partition it into labeled sections. Kept side-effect-free so the grouping and
 * drag-reorder maths are testable without a DOM.
 */
import type { SidebarEntry } from '../shared/ipc';

/** A rendered section: a run of workspaces under an optional divider header. */
export interface SectionView {
  /** The divider that opens this section, or undefined for the implicit first. */
  dividerId?: string;
  label?: string;
  workspaceIds: string[];
}

/** Split the flat entry list into sections at each divider. */
export function sectionsOf(entries: SidebarEntry[]): SectionView[] {
  const sections: SectionView[] = [{ workspaceIds: [] }];
  for (const e of entries) {
    if (e.kind === 'divider') {
      sections.push({ dividerId: e.id, label: e.label, workspaceIds: [] });
    } else {
      sections[sections.length - 1].workspaceIds.push(e.id);
    }
  }
  // Drop a leading empty implicit section only if a divider immediately follows,
  // so an empty top area doesn't render a phantom gap.
  if (sections.length > 1 && sections[0].workspaceIds.length === 0) {
    sections.shift();
  }
  return sections;
}

/**
 * Move `dragId` to sit before/after `targetId`. Returns a new array; a no-op
 * (dropping onto itself, or unknown ids) returns an equivalent ordering.
 */
export function reorderByDrop(
  entries: SidebarEntry[],
  dragId: string,
  targetId: string,
  place: 'before' | 'after',
): SidebarEntry[] {
  if (dragId === targetId) return entries.slice();
  const dragged = entries.find((e) => e.id === dragId);
  if (!dragged) return entries.slice();
  const without = entries.filter((e) => e.id !== dragId);
  const ti = without.findIndex((e) => e.id === targetId);
  if (ti < 0) return entries.slice();
  const at = place === 'after' ? ti + 1 : ti;
  return [...without.slice(0, at), dragged, ...without.slice(at)];
}
