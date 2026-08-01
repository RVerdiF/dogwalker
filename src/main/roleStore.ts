import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Role } from '../shared/ipc';

export class RoleStore {
  private file: string;
  private roles: Role[] = [];
  constructor(userData: string) {
    this.file = path.join(userData, 'roles.json');
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.roles = Array.isArray(raw) ? raw.filter((r): r is Role => !!r && typeof r.id === 'string' && typeof r.name === 'string' && typeof r.instructions === 'string') : [];
    } catch { /* fresh install */ }
  }
  private persist(): void { fs.writeFileSync(this.file, JSON.stringify(this.roles, null, 2)); }
  list(): Role[] { return this.roles.map((r) => ({ ...r })); }
  get(id: string): Role | null { return this.roles.find((r) => r.id === id) ?? null; }
  create(input: Pick<Role, 'name' | 'instructions'>): Role {
    const role = { id: 'role-' + crypto.randomBytes(5).toString('hex'), name: input.name.trim() || 'Untitled role', instructions: input.instructions };
    this.roles.push(role); this.persist(); return { ...role };
  }
  update(id: string, input: Pick<Role, 'name' | 'instructions'>): Role | null {
    const role = this.roles.find((r) => r.id === id);
    if (!role) return null;
    role.name = input.name.trim() || role.name; role.instructions = input.instructions;
    this.persist(); return { ...role };
  }
  remove(id: string): boolean {
    const n = this.roles.length; this.roles = this.roles.filter((r) => r.id !== id);
    if (n === this.roles.length) return false;
    this.persist(); return true;
  }
}
