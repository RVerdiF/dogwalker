import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AppSettings } from '../shared/ipc';
import { Panel } from './Panel';

const settings = { themeName: 'a', lightThemeName: 'b', followSystem: false, notifyOnAttention: false } as unknown as AppSettings;

function renderPanel() {
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
      onUpdateSettings={vi.fn()}
    />,
  );
}

describe('Panel — Contracts form', () => {
  beforeEach(() => {
    window.dw = {
      listContracts: vi.fn().mockResolvedValue([]),
      createContract: vi.fn().mockResolvedValue({ id: 'c1' }),
    } as unknown as typeof window.dw;
  });

  const openContracts = async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Contracts' }));
    return screen.getByPlaceholderText('Contract name');
  };

  it('rejects a schema that is not a JSON object', async () => {
    const name = await openContracts();
    await userEvent.type(name, 'c1');
    const schema = screen.getByDisplayValue(/"type": "object"/);
    fireEvent.change(schema, { target: { value: '[1, 2, 3]' } });
    await userEvent.click(screen.getByRole('button', { name: /Add contract/ }));
    expect(window.dw.createContract).not.toHaveBeenCalled();
    expect(screen.getByText(/Schema must be a JSON object/i)).toBeInTheDocument();
  });

  it('creates a contract from a valid JSON Schema', async () => {
    const name = await openContracts();
    await userEvent.type(name, 'verdict');
    await userEvent.click(screen.getByRole('button', { name: /Add contract/ }));
    await waitFor(() => expect(window.dw.createContract).toHaveBeenCalledTimes(1));
    const arg = (window.dw.createContract as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg).toMatchObject({ name: 'verdict', maxAttempts: 3 });
    expect(typeof arg.schema).toBe('object');
  });
});
