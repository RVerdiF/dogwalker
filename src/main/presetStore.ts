import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentPreset } from '../shared/ipc';

export const BUILTIN_PRESETS: AgentPreset[] = [
  { id: 'shell', name: 'Shell', icon: '⌘', command: '', builtin: true },
  { id: 'claude', name: 'Claude Code', icon: '✦', command: 'claude', builtin: true },
  { id: 'codex', name: 'Codex', icon: '◈', command: 'codex', builtin: true },
  { id: 'gemini', name: 'Gemini CLI', icon: '✧', command: 'gemini', builtin: true },
  { id: 'opencode', name: 'OpenCode', icon: '◉', command: 'opencode', builtin: true },
  { id: 'aider', name: 'aider', icon: '↗', command: 'aider', builtin: true },
];

export class PresetStore {
  private file: string;
  private custom: AgentPreset[] = [];
  constructor(userData: string) {
    this.file = path.join(userData, 'presets.json');
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.custom = Array.isArray(raw) ? raw.filter(this.valid) : [];
    } catch { /* fresh install */ }
  }
  private valid = (p: unknown): p is AgentPreset =>
    !!p && typeof p === 'object' && typeof (p as AgentPreset).id === 'string' &&
    typeof (p as AgentPreset).name === 'string' && typeof (p as AgentPreset).command === 'string';
  private persist(): void { fs.writeFileSync(this.file, JSON.stringify(this.custom, null, 2)); }
  list(): AgentPreset[] { return [...BUILTIN_PRESETS, ...this.custom].map((p) => ({ ...p })); }
  get(id: string): AgentPreset | null { return this.list().find((p) => p.id === id) ?? null; }
  create(input: Pick<AgentPreset, 'name' | 'icon' | 'command'>): AgentPreset {
    const preset: AgentPreset = { id: 'preset-' + crypto.randomBytes(5).toString('hex'), name: input.name.trim() || 'Custom preset', icon: input.icon.trim() || '⚡', command: input.command.trim() };
    this.custom.push(preset); this.persist(); return { ...preset };
  }
  update(id: string, input: Pick<AgentPreset, 'name' | 'icon' | 'command'>): AgentPreset | null {
    const p = this.custom.find((x) => x.id === id);
    if (!p) return null;
    p.name = input.name.trim() || p.name; p.icon = input.icon.trim() || p.icon; p.command = input.command.trim();
    this.persist(); return { ...p };
  }
  remove(id: string): boolean {
    const n = this.custom.length; this.custom = this.custom.filter((p) => p.id !== id);
    if (this.custom.length === n) return false;
    this.persist(); return true;
  }
}
