import { describe, it, expect } from 'vitest';
import { findOffender, parseProcesses, type ProcInfo } from './processTree';

const MB = 1024 * 1024;

// root 100 → child 101 → grandchild 102; descendants total 300 MB.
const tree: ProcInfo[] = [
  { pid: 100, ppid: 1, memory: 50 * MB },
  { pid: 101, ppid: 100, memory: 100 * MB },
  { pid: 102, ppid: 101, memory: 200 * MB },
];

describe('findOffender', () => {
  it('names the offending descendant and the tree total when over the limit', () => {
    expect(findOffender(tree, 100, 200)).toMatchObject({ pid: 102, totalMB: 300 });
  });

  it('returns null when the tree is under the limit', () => {
    expect(findOffender(tree, 100, 500)).toBeNull();
  });

  it('never targets the root itself — the shell is spared', () => {
    expect(findOffender([{ pid: 100, ppid: 1, memory: 900 * MB }], 100, 100)).toBeNull();
  });
});

describe('parseProcesses', () => {
  it('parses "pid ppid memKB" lines into byte-sized ProcInfo', () => {
    const parsed = parseProcesses('123 1 2048\n456 123 4096\n', false);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ pid: 123, ppid: 1, memory: 2048 * 1024 });
  });
});
