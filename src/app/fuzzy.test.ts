import { describe, it, expect } from 'vitest';
import { fuzzyScore, fuzzyFilter } from './fuzzy';

describe('fuzzyScore', () => {
  it('matches a subsequence and rejects a non-subsequence', () => {
    expect(fuzzyScore('ftn', 'FileTreeNode.tsx')).not.toBeNull();
    expect(fuzzyScore('zzz', 'FileTreeNode.tsx')).toBeNull();
  });

  it('treats an empty query as a neutral match', () => {
    expect(fuzzyScore('', 'anything')).toBe(0);
  });

  it('ranks segment-start initials above a scattered hit', () => {
    const initials = fuzzyScore('ftn', 'file-tree-node');
    const scattered = fuzzyScore('ftn', 'left_thing_noise');
    expect(initials).not.toBeNull();
    expect(scattered).not.toBeNull();
    expect(initials!).toBeGreaterThan(scattered!);
  });

  it('prefers the shorter target when the match quality is equal', () => {
    expect(fuzzyScore('ab', 'ab')!).toBeGreaterThan(fuzzyScore('ab', 'ab_longer_name')!);
  });
});

describe('fuzzyFilter', () => {
  const files = ['FileTreeNode.tsx', 'fuzzy.ts', 'Panel.tsx', 'gitGraph.ts'];

  it('keeps only matches, ranked best-first', () => {
    const hits = fuzzyFilter('git', files, (f) => f);
    expect(hits).toEqual(['gitGraph.ts']);
  });

  it('drops everything when nothing matches', () => {
    expect(fuzzyFilter('qqqq', files, (f) => f)).toEqual([]);
  });

  it('honors the result limit', () => {
    expect(fuzzyFilter('t', files, (f) => f, 1)).toHaveLength(1);
  });
});
