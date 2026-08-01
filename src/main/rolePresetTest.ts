import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import type { BrokerRequest, BrokerResponse } from '../shared/protocol';
import { PresetStore } from './presetStore';
import { RoleStore } from './roleStore';
import type { PtyManager } from './ptyManager';
import type { GraphStore } from './graphStore';

/**
 * Roles and presets validation (DW_ROLEPRESETTEST=1): verifies durable CRUD,
 * then drives the real Walker broker through a custom preset and role. It
 * checks recruitment, context-file injection, reassignment, and cleanup.
 */
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function rpc(sock: string, req: BrokerRequest): Promise<BrokerResponse> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(sock);
    socket.setEncoding('utf8');
    let buffer = '';
    socket.on('connect', () => socket.write(JSON.stringify(req) + '\n'));
    socket.on('data', (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      socket.end();
      resolve(JSON.parse(buffer.slice(0, newline)) as BrokerResponse);
    });
    socket.on('error', reject);
  });
}

export async function runRolePresetTest(
  ptys: PtyManager,
  graph: GraphStore,
  presets: PresetStore,
  roles: RoleStore,
  sock: string,
): Promise<void> {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dogwalker-role-preset-'));
  const results: Record<string, boolean> = {};
  let boss = '';
  let recruit = '';
  let presetId = '';
  let reviewerId = '';
  let auditorId = '';

  try {
    // Store-only CRUD and a new instance prove the JSON persistence contract.
    const persistedPresets = new PresetStore(temp);
    const persistedRoles = new RoleStore(temp);
    const storedPreset = persistedPresets.create({ name: 'Stored', icon: 'S', command: 'echo stored' });
    const storedRole = persistedRoles.create({ name: 'Stored role', instructions: 'Initial instructions.' });
    persistedPresets.update(storedPreset.id, { name: 'Stored v2', icon: 'S', command: 'echo updated' });
    persistedRoles.update(storedRole.id, { name: 'Stored role v2', instructions: 'Updated instructions.' });
    const reopenedPresets = new PresetStore(temp);
    const reopenedRoles = new RoleStore(temp);
    results.presetCrudAndPersistence = reopenedPresets.get(storedPreset.id)?.command === 'echo updated';
    results.roleCrudAndPersistence = reopenedRoles.get(storedRole.id)?.instructions === 'Updated instructions.';
    results.presetDelete = persistedPresets.remove(storedPreset.id) && !new PresetStore(temp).get(storedPreset.id);
    results.roleDelete = persistedRoles.remove(storedRole.id) && !new RoleStore(temp).get(storedRole.id);

    const command = process.platform === 'win32' ? 'Write-Output DW_PRESET_OK' : 'echo DW_PRESET_OK';
    const preset = presets.create({ name: 'DW test preset', icon: 'T', command });
    const reviewer = roles.create({ name: 'DW test reviewer', instructions: 'Review the change and report the result.' });
    const auditor = roles.create({ name: 'DW test auditor', instructions: 'Audit the change and list risks.' });
    presetId = preset.id;
    reviewerId = reviewer.id;
    auditorId = auditor.id;

    boss = ptys.spawn({ preset: 'shell', cols: 80, rows: 24, workspaceId: 'role-preset-test', cwd: temp, name: 'boss', stableId: 'rp-boss', walker: true }).id;
    await wait(1000);
    const recruited = await rpc(sock, { cmd: 'recruit', from: boss, agent: preset.id, role: reviewer.id });
    recruit = (recruited.data as { id?: string } | undefined)?.id ?? '';
    const recruitPath = path.join(temp, '.dogwalker', 'roles', `${(recruited.data as { stableId?: string } | undefined)?.stableId ?? ''}.md`);
    await wait(1500);
    results.customRecruit = recruited.ok && !!recruit && graph.areConnected(boss, recruit) && ptys.presetOf(recruit) === preset.id;
    results.customPresetExecuted = (await ptys.serialize(recruit)).includes('DW_PRESET_OK');
    results.recruitRoleContext = fs.existsSync(recruitPath) && fs.readFileSync(recruitPath, 'utf8').includes(reviewer.instructions);

    const reassigned = await rpc(sock, { cmd: 'assign', from: boss, target: reviewer.name, role: auditor.id });
    const assignedPath = (reassigned.data as { path?: string } | undefined)?.path ?? '';
    results.reassignmentContext = reassigned.ok && graph.name(recruit) === auditor.name && fs.existsSync(assignedPath) && fs.readFileSync(assignedPath, 'utf8').includes(auditor.instructions);
  } catch (error) {
    console.error('ROLEPRESETTEST ERROR', error);
  } finally {
    if (recruit) ptys.kill(recruit);
    if (boss) ptys.kill(boss);
    await wait(250);
    if (presetId) presets.remove(presetId);
    if (reviewerId) roles.remove(reviewerId);
    if (auditorId) roles.remove(auditorId);
    console.log('ROLEPRESETTEST RESULT ' + JSON.stringify(results));
    try {
      fs.rmSync(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch (error) {
      console.warn('ROLEPRESETTEST cleanup deferred', error);
    }
  }
}
