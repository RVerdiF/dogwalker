import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AppSettings } from '../shared/ipc';
import { Panel } from './Panel';

const settings = { themeName: 'a', lightThemeName: 'b', followSystem: false, notifyOnAttention: false, appTheme: 'Dogwalker Dark' } as unknown as AppSettings;

function renderPanel() {
  const onUpdateSettings = vi.fn();
  render(
    <Panel
      open
      onClose={vi.fn()}
      workspaces={[]}
      activeId=""
      onSwitch={vi.fn()}
      onCreate={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      onHibernate={vi.fn()}
      themes={[]}
      settings={settings}
      activeThemeName="a"
      onUpdateSettings={onUpdateSettings}
    />,
  );
  return { onUpdateSettings };
}

const goTo = async (section: string) => {
  const handlers = renderPanel();
  await userEvent.click(screen.getByRole('button', { name: section }));
  return handlers;
};

describe('Panel', () => {
  beforeEach(() => {
    window.dw = {
      listPresets: vi.fn().mockResolvedValue([
        { id: 'claude', name: 'Claude Code', icon: 'sparkle', command: 'claude', builtin: true },
        { id: 'p1', name: 'My Agent', icon: 'robot', command: 'go' },
      ]),
      createPreset: vi.fn().mockResolvedValue({ id: 'p2' }),
      updatePreset: vi.fn().mockResolvedValue({}),
      deletePreset: vi.fn().mockResolvedValue(true),
      listRoles: vi.fn().mockResolvedValue([]),
      createRole: vi.fn().mockResolvedValue({ id: 'r1' }),
      updateRole: vi.fn().mockResolvedValue({}),
      deleteRole: vi.fn().mockResolvedValue(true),
      listContracts: vi.fn().mockResolvedValue([]),
      createContract: vi.fn().mockResolvedValue({ id: 'c1' }),
    } as unknown as typeof window.dw;
  });

  describe('Contracts', () => {
    it('rejects a schema that is not a JSON object', async () => {
      await goTo('Contracts');
      await userEvent.type(screen.getByPlaceholderText('Contract name'), 'c1');
      fireEvent.change(screen.getByDisplayValue(/"type": "object"/), { target: { value: '[1, 2, 3]' } });
      await userEvent.click(screen.getByRole('button', { name: /Add contract/ }));
      expect(window.dw.createContract).not.toHaveBeenCalled();
      expect(screen.getByText(/Schema must be a JSON object/i)).toBeInTheDocument();
    });

    it('creates a contract from a valid JSON Schema', async () => {
      await goTo('Contracts');
      await userEvent.type(screen.getByPlaceholderText('Contract name'), 'verdict');
      await userEvent.click(screen.getByRole('button', { name: /Add contract/ }));
      await waitFor(() => expect(window.dw.createContract).toHaveBeenCalledTimes(1));
      const arg = (window.dw.createContract as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(arg).toMatchObject({ name: 'verdict', maxAttempts: 3 });
      expect(typeof arg.schema).toBe('object');
    });
  });

  describe('Presets', () => {
    it('lists the presets and creates a new one', async () => {
      await goTo('Presets');
      expect(await screen.findByText(/My Agent/)).toBeInTheDocument();
      expect(screen.getByText(/Claude Code/)).toBeInTheDocument();
      await userEvent.type(screen.getByPlaceholderText('Name'), 'Aider');
      await userEvent.type(screen.getByPlaceholderText('Command'), 'aider');
      await userEvent.click(screen.getByRole('button', { name: /Add preset/ }));
      expect(window.dw.createPreset).toHaveBeenCalledWith(expect.objectContaining({ name: 'Aider', command: 'aider' }));
    });
  });

  describe('Roles', () => {
    it('creates a role from the form', async () => {
      await goTo('Roles');
      await userEvent.type(screen.getByPlaceholderText('Role name'), 'Reviewer');
      await userEvent.type(screen.getByPlaceholderText(/Instructions for this role/), 'Review carefully.');
      await userEvent.click(screen.getByRole('button', { name: /Add role/ }));
      expect(window.dw.createRole).toHaveBeenCalledWith({ name: 'Reviewer', instructions: 'Review carefully.' });
    });
  });

  describe('Settings', () => {
    it('toggles follow-system and attention notifications', async () => {
      const { onUpdateSettings } = await goTo('Settings');
      await userEvent.click(screen.getByRole('checkbox', { name: /Follow system/ }));
      expect(onUpdateSettings).toHaveBeenCalledWith({ followSystem: true });
      await userEvent.click(screen.getByRole('checkbox', { name: /Notify when a terminal needs attention/ }));
      expect(onUpdateSettings).toHaveBeenCalledWith({ notifyOnAttention: true });
    });

    it('selects an app theme', async () => {
      const { onUpdateSettings } = await goTo('Settings');
      await userEvent.click(screen.getByRole('button', { name: /Dogwalker Light/ }));
      expect(onUpdateSettings).toHaveBeenCalledWith({ appTheme: 'Dogwalker Light' });
    });
  });
});
