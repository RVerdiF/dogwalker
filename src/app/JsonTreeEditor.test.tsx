import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { JsonTreeEditor, type JsonValue } from './JsonTreeEditor';

function renderEditor(initial: JsonValue) {
  const onChange = vi.fn();
  const utils = render(<JsonTreeEditor value={initial} onChange={onChange} />);
  return { onChange, ...utils };
}

const schema: JsonValue = {
  type: 'object',
  required: ['decision'],
  properties: { decision: { type: 'string' } },
};

describe('JsonTreeEditor', () => {
  it('renders object fields as editable key rows', () => {
    renderEditor(schema);
    const keys = screen.getAllByLabelText('key').map((el) => (el as HTMLInputElement).value);
    expect(keys).toEqual(expect.arrayContaining(['type', 'required', 'properties']));
  });

  it('edits a primitive value and emits the updated tree', () => {
    const { onChange } = renderEditor({ type: 'string' });
    const value = screen.getByLabelText('value') as HTMLInputElement;
    fireEvent.change(value, { target: { value: 'number' } });
    expect(onChange).toHaveBeenCalledWith({ type: 'number' });
  });

  it('renames a field key', () => {
    const { onChange } = renderEditor({ type: 'object' });
    fireEvent.change(screen.getByDisplayValue('type'), { target: { value: 'kind' } });
    expect(onChange).toHaveBeenCalledWith({ kind: 'object' });
  });

  it('adds and removes a field', () => {
    const { onChange, rerender } = renderEditor({});
    fireEvent.click(screen.getByRole('button', { name: '+ field' }));
    expect(onChange).toHaveBeenCalledWith({ field: '' });

    rerender(<JsonTreeEditor value={{ a: '1', b: '2' }} onChange={onChange} />);
    // Remove the first field.
    fireEvent.click(screen.getAllByTitle('Remove field')[0]);
    expect(onChange).toHaveBeenLastCalledWith({ b: '2' });
  });

  it('changes a field type, resetting the value to that type default', () => {
    const { onChange } = renderEditor({ n: 'hi' });
    // The value node's type select (there are two: the root object and the leaf).
    const selects = screen.getAllByLabelText('type');
    // Root is object; the leaf 'hi' string is the second type select.
    fireEvent.change(selects[1], { target: { value: 'array' } });
    expect(onChange).toHaveBeenCalledWith({ n: [] });
  });

  it('collapses and expands a branch', () => {
    renderEditor(schema);
    // properties → decision is visible initially (depth 0..2 expanded).
    const collapse = screen.getAllByRole('button', { name: 'collapse' })[0];
    fireEvent.click(collapse);
    // After collapsing the root, its field rows are gone.
    expect(screen.queryByDisplayValue('type')).not.toBeInTheDocument();
  });

  it('supports array items', () => {
    const { onChange } = renderEditor(['decision']);
    fireEvent.click(screen.getByRole('button', { name: '+ item' }));
    expect(onChange).toHaveBeenCalledWith(['decision', '']);
  });
});
