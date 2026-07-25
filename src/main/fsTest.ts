import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { FsService } from './fsService';

/**
 * File-system service validation (DW_FSTEST=1): a round-trip through the same
 * FsService the File Tree node uses — create a tree, list it (sorted dirs-first),
 * read/write a file, rename, delete, and confirm a bad directory degrades to an
 * error rather than throwing. Runs against a scratch temp dir it cleans up.
 */
export async function runFsTest(fsService: FsService): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-fstest-'));
  const results: Record<string, boolean> = {};
  try {
    // Build: root/{sub/ , b.txt , a.txt}
    await fsService.create(path.join(root, 'sub'), true);
    await fsService.create(path.join(root, 'b.txt'), false);
    await fsService.create(path.join(root, 'a.txt'), false);

    const listing = await fsService.readDir(root);
    const names = listing.entries.map((e) => e.name);
    // Dirs first, then files alphabetically.
    results.sortedDirsFirst =
      names.join(',') === 'sub,a.txt,b.txt' && !listing.error;
    results.flagsDir =
      listing.entries.find((e) => e.name === 'sub')?.isDir === true;
    results.flagsFile =
      listing.entries.find((e) => e.name === 'a.txt')?.isDir === false;

    // Write then read back.
    await fsService.writeFile(path.join(root, 'a.txt'), 'hello walker');
    const read = await fsService.readFile(path.join(root, 'a.txt'));
    results.readWrite = read === 'hello walker';
    results.sizeReported =
      (await fsService.readDir(root)).entries.find((e) => e.name === 'a.txt')!
        .size === 'hello walker'.length;

    // Move a.txt into sub/, then it should be gone from root and present in sub.
    await fsService.rename(path.join(root, 'a.txt'), path.join(root, 'sub', 'a.txt'));
    const afterMove = (await fsService.readDir(root)).entries.map((e) => e.name);
    const subList = (await fsService.readDir(path.join(root, 'sub'))).entries.map(
      (e) => e.name,
    );
    results.moved =
      !afterMove.includes('a.txt') && subList.includes('a.txt');

    // Delete b.txt.
    await fsService.remove(path.join(root, 'b.txt'));
    results.removed = !(await fsService.readDir(root)).entries.some(
      (e) => e.name === 'b.txt',
    );

    // Create with 'wx' must reject an existing file.
    let clobberRejected = false;
    try {
      await fsService.create(path.join(root, 'sub', 'a.txt'), false);
    } catch {
      clobberRejected = true;
    }
    results.noClobber = clobberRejected;

    // A missing directory degrades to an error, not a throw.
    const bad = await fsService.readDir(path.join(root, 'does-not-exist'));
    results.badDirGraceful = !!bad.error && bad.entries.length === 0;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log('FSTEST RESULT ' + JSON.stringify(results));
}
