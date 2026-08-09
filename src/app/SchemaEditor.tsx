import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { linter, lintGutter } from '@codemirror/lint';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

/**
 * A contract's JSON Schema is edited as JSON in a small CodeMirror 6 editor —
 * syntax highlighting plus a live JSON linter (red underline + gutter marker on
 * parse errors), so a malformed schema is caught as you type rather than only on
 * submit. Colors come from the app's `--dw-*` tokens (via CSS-variable values in
 * the theme), so the editor recolors with the theme like everything else.
 */

// Editor chrome — transparent so it sits flush on the form (no boxed container).
const chrome = EditorView.theme({
  '&': { backgroundColor: 'transparent', color: 'var(--dw-text)', fontSize: '12px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-content': { fontFamily: 'var(--dw-mono)', caretColor: 'var(--dw-text)', padding: '4px 0' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--dw-text-faint)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'var(--dw-glass-border)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--dw-text)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--dw-glass-border)',
  },
  '.cm-lintRange-error': { textDecoration: 'underline wavy var(--dw-danger)' },
});

const highlight = HighlightStyle.define([
  { tag: t.propertyName, color: 'var(--dw-accent)' },
  { tag: [t.string], color: 'var(--dw-success)' },
  { tag: [t.number], color: 'var(--dw-warn)' },
  { tag: [t.bool, t.null, t.keyword], color: 'var(--dw-leash)' },
  { tag: [t.punctuation, t.separator, t.brace, t.squareBracket], color: 'var(--dw-text-faint)' },
]);

export function SchemaEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Create once and stay uncontrolled thereafter (the form remounts this on
  // reset), so typing never resets the cursor.
  useEffect(() => {
    if (!hostRef.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        json(),
        linter(jsonParseLinter()),
        lintGutter(),
        chrome,
        syntaxHighlighting(highlight),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
        }),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} className="dw-schema-editor nowheel nodrag" />;
}
