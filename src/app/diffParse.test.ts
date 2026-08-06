import { describe, it, expect } from 'vitest';
import { parseDiff } from './diffParse';

const modified = [
  'diff --git a/foo.ts b/foo.ts',
  'index abc..def 100644',
  '--- a/foo.ts',
  '+++ b/foo.ts',
  '@@ -1,3 +1,3 @@',
  ' context line',
  '-old line',
  '+new line',
  ' tail line',
].join('\n');

const added = [
  'diff --git a/new.ts b/new.ts',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/new.ts',
  '@@ -0,0 +1,2 @@',
  '+first',
  '+second',
].join('\n');

describe('parseDiff', () => {
  it('takes the b-side path and opens each hunk with a hunk row', () => {
    const [file] = parseDiff(modified);
    expect(file.path).toBe('foo.ts');
    expect(file.rows[0].kind).toBe('hunk');
  });

  it('pairs a deletion with an addition side by side, with line numbers', () => {
    const [file] = parseDiff(modified);
    const paired = file.rows.find((r) => r.oldText === 'old line');
    expect(paired).toMatchObject({ kind: 'del', newText: 'new line', oldNo: 2, newNo: 2 });
  });

  it('emits context on both sides', () => {
    const [file] = parseDiff(modified);
    const ctx = file.rows.find((r) => r.kind === 'context' && r.oldText === 'context line');
    expect(ctx).toMatchObject({ oldNo: 1, newNo: 1, newText: 'context line' });
  });

  it('pads the old side for a pure addition', () => {
    const files = parseDiff(`${modified}\n${added}`);
    expect(files).toHaveLength(2);
    const add = files[1].rows.find((r) => r.newText === 'first');
    expect(add).toMatchObject({ kind: 'add', oldNo: null, newNo: 1, oldText: '' });
  });
});
