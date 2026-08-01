import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ResponseContract } from '../shared/ipc';

export class ContractStore {
  private file: string;
  private contracts: ResponseContract[] = [];
  constructor(userData: string) {
    this.file = path.join(userData, 'response-contracts.json');
    try { const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')); this.contracts = Array.isArray(raw) ? raw.filter((c): c is ResponseContract => !!c && typeof c.id === 'string' && typeof c.name === 'string' && typeof c.instructions === 'string' && !!c.schema) : []; } catch { /* fresh install */ }
  }
  private persist(): void { fs.writeFileSync(this.file, JSON.stringify(this.contracts, null, 2)); }
  list(): ResponseContract[] { return this.contracts.map((c) => ({ ...c, schema: { ...c.schema, required: [...c.schema.required], fields: { ...c.schema.fields } } })); }
  get(id: string): ResponseContract | null { return this.list().find((c) => c.id === id) ?? null; }
  create(input: Omit<ResponseContract, 'id'>): ResponseContract { const c = { ...input, id: 'contract-' + crypto.randomBytes(5).toString('hex') }; this.contracts.push(c); this.persist(); return c; }
  update(id: string, input: Omit<ResponseContract, 'id'>): ResponseContract | null { const i = this.contracts.findIndex((c) => c.id === id); if (i < 0) return null; this.contracts[i] = { ...input, id }; this.persist(); return this.contracts[i]; }
  remove(id: string): boolean { const n = this.contracts.length; this.contracts = this.contracts.filter((c) => c.id !== id); if (n === this.contracts.length) return false; this.persist(); return true; }
}
