import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Contract } from '../shared/ipc';

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 180_000;

export class ContractStore {
  private file: string;
  private contracts: Contract[] = [];
  constructor(userData: string) {
    this.file = path.join(userData, 'contracts.json');
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.contracts = Array.isArray(raw) ? raw.filter(this.valid).map(this.normalize) : [];
    } catch { /* fresh install */ }
  }
  private valid = (c: unknown): c is Contract =>
    !!c && typeof c === 'object' &&
    typeof (c as Contract).id === 'string' &&
    typeof (c as Contract).name === 'string' &&
    !!(c as Contract).schema && typeof (c as Contract).schema === 'object';
  /** Fill in missing/legacy fields so an older or partial record still loads. */
  private normalize = (c: Contract): Contract => ({
    id: c.id,
    name: c.name,
    schema: c.schema ?? {},
    maxAttempts: Number.isFinite(c.maxAttempts) && c.maxAttempts > 0 ? Math.floor(c.maxAttempts) : DEFAULT_ATTEMPTS,
    timeoutMs: Number.isFinite(c.timeoutMs) && c.timeoutMs > 0 ? Math.floor(c.timeoutMs) : DEFAULT_TIMEOUT_MS,
    rejectionPrompt: typeof c.rejectionPrompt === 'string' ? c.rejectionPrompt : '',
    fallback: 'fallback' in c ? c.fallback : null,
  });
  private persist(): void { fs.writeFileSync(this.file, JSON.stringify(this.contracts, null, 2)); }
  list(): Contract[] { return this.contracts.map((c) => ({ ...c })); }
  get(id: string): Contract | null { return this.list().find((c) => c.id === id) ?? null; }
  create(input: Omit<Contract, 'id'>): Contract {
    const c = this.normalize({ ...input, id: 'contract-' + crypto.randomBytes(5).toString('hex') } as Contract);
    this.contracts.push(c); this.persist(); return { ...c };
  }
  update(id: string, input: Omit<Contract, 'id'>): Contract | null {
    const i = this.contracts.findIndex((c) => c.id === id);
    if (i < 0) return null;
    this.contracts[i] = this.normalize({ ...input, id } as Contract);
    this.persist(); return { ...this.contracts[i] };
  }
  remove(id: string): boolean { const n = this.contracts.length; this.contracts = this.contracts.filter((c) => c.id !== id); if (n === this.contracts.length) return false; this.persist(); return true; }
}
