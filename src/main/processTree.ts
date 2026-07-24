import { exec } from 'node:child_process';

export interface ProcInfo {
  pid: number;
  ppid: number;
  /** Resident memory in bytes. */
  memory: number;
}

/**
 * Per-terminal memory limits (PRODUCT.md §4.1). Listing every process once per
 * poll (not once per terminal) keeps this cheap, and the poller only runs while
 * at least one terminal has a limit set.
 */
export function listProcesses(): Promise<ProcInfo[]> {
  // No nested quotes: cmd.exe doesn't honour backslash escaping, so building the
  // line inside PowerShell would break. ConvertTo-Csv keeps it quote-free here.
  const cmd =
    process.platform === 'win32'
      ? 'powershell -NoProfile -NonInteractive -Command "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize | ConvertTo-Csv -NoTypeInformation"'
      : 'ps -eo pid=,ppid=,rss=';

  return new Promise((resolve) => {
    exec(cmd, { maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
      if (err) return resolve([]);
      resolve(parseProcesses(stdout, process.platform === 'win32'));
    });
  });
}

/** Exported for testing: turns raw `ps`/CIM output into ProcInfo rows. */
export function parseProcesses(stdout: string, windows: boolean): ProcInfo[] {
  const out: ProcInfo[] = [];
  for (const line of stdout.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    // ConvertTo-Csv wraps every field in quotes; the header row parses as NaN
    // and is skipped below.
    const parts = (windows ? t.split(',') : t.split(/\s+/)).map((f) =>
      f.replace(/^"|"$/g, ''),
    );
    if (parts.length < 3) continue;
    const pid = Number(parts[0]);
    const ppid = Number(parts[1]);
    const raw = Number(parts[2]);
    if (!Number.isFinite(pid) || !Number.isFinite(ppid) || !Number.isFinite(raw)) {
      continue;
    }
    // ps reports RSS in kB; CIM reports WorkingSetSize in bytes.
    out.push({ pid, ppid, memory: windows ? raw : raw * 1024 });
  }
  return out;
}

/**
 * If `rootPid`'s descendants together exceed `limitMB`, return the heaviest
 * descendant — the process to kill. The root itself (the shell) is never
 * returned: killing it would take the terminal down with it.
 */
export function findOffender(
  procs: ProcInfo[],
  rootPid: number,
  limitMB: number,
): { pid: number; totalMB: number } | null {
  if (limitMB <= 0) return null;

  const children = new Map<number, number[]>();
  const byPid = new Map<number, ProcInfo>();
  for (const p of procs) {
    byPid.set(p.pid, p);
    const list = children.get(p.ppid);
    if (list) list.push(p.pid);
    else children.set(p.ppid, [p.pid]);
  }

  // Breadth-first over descendants, guarding against cycles in bad ps output.
  const seen = new Set<number>([rootPid]);
  const queue = [...(children.get(rootPid) ?? [])];
  let total = 0;
  let heaviest: { pid: number; memory: number } | null = null;
  while (queue.length) {
    const pid = queue.shift() as number;
    if (seen.has(pid)) continue;
    seen.add(pid);
    const info = byPid.get(pid);
    if (info) {
      total += info.memory;
      if (!heaviest || info.memory > heaviest.memory) {
        heaviest = { pid, memory: info.memory };
      }
    }
    for (const c of children.get(pid) ?? []) if (!seen.has(c)) queue.push(c);
  }

  const totalMB = total / (1024 * 1024);
  if (!heaviest || totalMB <= limitMB) return null;
  return { pid: heaviest.pid, totalMB: Math.round(totalMB) };
}
