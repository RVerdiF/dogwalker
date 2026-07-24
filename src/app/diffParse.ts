/**
 * Parse a unified `git diff` into side-by-side rows per file (PRODUCT.md §8).
 * Pure and DOM-free so the pairing logic is testable; the renderer just paints
 * the rows. Context lines appear on both sides; a hunk's deletions and additions
 * are paired positionally, with blank padding when the counts differ.
 */
export type DiffRowKind = 'context' | 'del' | 'add' | 'hunk';

export interface DiffRow {
  kind: DiffRowKind;
  /** Old-file line number (null for pure additions / hunk headers). */
  oldNo: number | null;
  /** New-file line number (null for pure deletions / hunk headers). */
  newNo: number | null;
  oldText: string;
  newText: string;
}

export interface DiffFile {
  path: string;
  rows: DiffRow[];
}

/** Flush a pending block of deletions/additions as paired side-by-side rows. */
function flush(
  dels: Array<{ no: number; text: string }>,
  adds: Array<{ no: number; text: string }>,
  out: DiffRow[],
): void {
  const n = Math.max(dels.length, adds.length);
  for (let i = 0; i < n; i++) {
    const d = dels[i];
    const a = adds[i];
    out.push({
      kind: d && a ? 'del' : d ? 'del' : 'add',
      oldNo: d ? d.no : null,
      newNo: a ? a.no : null,
      oldText: d ? d.text : '',
      newText: a ? a.text : '',
    });
  }
}

export function parseDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  let cur: DiffFile | null = null;
  let oldNo = 0;
  let newNo = 0;
  let dels: Array<{ no: number; text: string }> = [];
  let adds: Array<{ no: number; text: string }> = [];

  const flushPending = () => {
    if (cur && (dels.length || adds.length)) flush(dels, adds, cur.rows);
    dels = [];
    adds = [];
  };

  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git')) {
      flushPending();
      // "diff --git a/path b/path" — take the b-side path.
      const m = / b\/(.+)$/.exec(line);
      cur = { path: m ? m[1] : line.slice(11), rows: [] };
      files.push(cur);
      continue;
    }
    if (!cur) continue;
    if (
      line.startsWith('index ') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ') ||
      line.startsWith('new file') ||
      line.startsWith('deleted file') ||
      line.startsWith('similarity ') ||
      line.startsWith('rename ') ||
      line.startsWith('old mode') ||
      line.startsWith('new mode')
    ) {
      continue;
    }
    if (line.startsWith('@@')) {
      flushPending();
      const m = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (m) {
        oldNo = Number(m[1]);
        newNo = Number(m[2]);
      }
      cur.rows.push({
        kind: 'hunk',
        oldNo: null,
        newNo: null,
        oldText: line,
        newText: '',
      });
      continue;
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      dels.push({ no: oldNo++, text: line.slice(1) });
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      adds.push({ no: newNo++, text: line.slice(1) });
    } else if (line.startsWith('\\')) {
      // "\ No newline at end of file" — ignore.
      continue;
    } else {
      // Context line: pairs deletions/additions seen so far, then emits itself.
      flushPending();
      const text = line.startsWith(' ') ? line.slice(1) : line;
      cur.rows.push({
        kind: 'context',
        oldNo: oldNo++,
        newNo: newNo++,
        oldText: text,
        newText: text,
      });
    }
  }
  flushPending();
  return files;
}
