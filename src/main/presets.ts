import type { PresetId } from '../shared/ipc';

const isWin = process.platform === 'win32';

/**
 * A preset is just a command auto-executed in the spawned shell.
 * `null` means plain shell. The "stress" preset floods output to
 * exercise the renderer ladder without needing a live agent.
 */
export function presetCommand(preset: PresetId): string | null {
  switch (preset) {
    case 'shell':
      return null;
    case 'claude':
      return 'claude';
    case 'codex':
      return 'codex';
    case 'gemini':
      return 'gemini';
    case 'stress':
      return isWin
        ? `while($true){1..40|ForEach-Object{Write-Host ("stress " + (Get-Random) + " " + (Get-Random) + " " + (Get-Random))};Start-Sleep -Milliseconds 50}`
        : `while true; do for i in $(seq 40); do echo "stress $RANDOM $RANDOM $RANDOM"; done; sleep 0.05; done`;
  }
}

export function defaultShell(): string {
  if (isWin) return 'powershell.exe';
  return process.env.SHELL || 'bash';
}
