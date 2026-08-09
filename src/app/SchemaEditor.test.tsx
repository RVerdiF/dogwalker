import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SchemaEditor } from './SchemaEditor';

describe('SchemaEditor', () => {
  it('mounts a CodeMirror editor showing the initial schema', () => {
    const { container } = render(
      <SchemaEditor value={'{\n  "type": "object"\n}'} onChange={() => {}} />,
    );
    // The CodeMirror instance mounted inside our flush host.
    expect(container.querySelector('.dw-schema-editor .cm-editor')).toBeTruthy();
    expect(container.textContent).toContain('"type"');
  });
});
