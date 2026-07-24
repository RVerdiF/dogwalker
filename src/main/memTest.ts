import type { PtyManager } from './ptyManager';
import type { WorkspaceStore } from './workspaceStore';
import {
  findOffender,
  listProcesses,
  parseProcesses,
  type ProcInfo,
} from './processTree';

const MB = 1024 * 1024;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Memory-limit validation (DW_MEMTEST=1): the pure offender maths against
 * synthetic trees, then a real runaway child that must be killed while its
 * shell survives. Also checks the first-run welcome note was seeded.
 */
export async function runMemTest(
  ptys: PtyManager,
  workspaces: WorkspaceStore,
): Promise<void> {
  // root 100 → child 101 → grandchild 102; descendants total 300 MB.
  const tree: ProcInfo[] = [
    { pid: 100, ppid: 1, memory: 50 * MB },
    { pid: 101, ppid: 100, memory: 100 * MB },
    { pid: 102, ppid: 101, memory: 200 * MB },
  ];
  const over = findOffender(tree, 100, 200);
  const under = findOffender(tree, 100, 500);
  const rootOnly = findOffender([{ pid: 100, ppid: 1, memory: 900 * MB }], 100, 100);
  const parsed = parseProcesses('123 1 2048\n456 123 4096\n', false);

  const result: Record<string, unknown> = {
    pureOverLimit: over?.pid === 102 && over?.totalMB === 300,
    pureUnderLimit: under === null,
    pureIgnoresRoot: rootOnly === null, // never kill the shell itself
    parseOk: parsed.length === 2 && parsed[0].memory === 2048 * 1024,
  };

  // First-run seeding.
  const { active } = workspaces.list();
  const layout = workspaces.load(active).layout;
  result.welcomeSeeded = layout.nodes.some(
    (n) => n.kind === 'note' && n.name === 'welcome',
  );

  // Live: a child process that hogs memory must be killed, shell untouched.
  const id = ptys.spawn({
    preset: 'shell',
    name: 'hog',
    cols: 80,
    rows: 24,
    workspaceId: 'memtest',
    stableId: 'memtest',
    cwd: '',
    memoryLimitMB: 200,
  }).id;
  await wait(2000);
  // Single quotes: a double-quoted inner command would have $x expanded by the
  // OUTER shell before the child ever saw it. Touch every page so the pages are
  // actually resident and show up in WorkingSetSize.
  const hog =
    process.platform === 'win32'
      ? "powershell -NoProfile -Command '$x=[byte[]]::new(400MB); " +
        "for($i=0;$i -lt $x.Length;$i+=4096){$x[$i]=1}; Start-Sleep 60'\r"
      : 'python3 -c "a=bytearray(400*1024*1024); import time; time.sleep(60)"\r';
  ptys.write(id, hog);
  await wait(16000); // allocation + at least two poll cycles

  const screen = ptys.plainText(id);
  result.killedOffender = screen.includes('[dogwalker] killed');
  result.shellSurvived = ptys.has(id);

  // Diagnostics: did the listing work, and is the PTY pid the tree root we walk?
  const procs = await listProcesses();
  const ptyPid = ptys.pidOf(id);
  result.procsListed = procs.length;
  result.ptyPid = ptyPid;
  result.ptyPidSeen = procs.some((p) => p.pid === ptyPid);
  result.directChildren = procs.filter((p) => p.ppid === ptyPid).length;
  result.liveOffender = ptyPid ? findOffender(procs, ptyPid, 200) : null;

  console.log('MEMTEST RESULT ' + JSON.stringify(result));
  ptys.kill(id);
}
