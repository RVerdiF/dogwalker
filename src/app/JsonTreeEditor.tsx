import { useState } from 'react';
import { ChevronIcon } from './icons';

/**
 * A themed, collapsible tree editor for arbitrary JSON — used to view and edit a
 * contract's JSON Schema without hand-writing braces. Objects and arrays collapse;
 * every field's key, type and value is editable inline; entries can be added or
 * removed. It edits plain JSON (a schema is just JSON), and the contract form
 * keeps a raw-JSON escape hatch for anything the tree can't express ergonomically.
 */

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

type JsonType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

const TYPES: JsonType[] = ['object', 'array', 'string', 'number', 'boolean', 'null'];

function typeOf(v: JsonValue): JsonType {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  const t = typeof v;
  if (t === 'string' || t === 'number' || t === 'boolean') return t;
  return 'object';
}

function defaultFor(type: JsonType): JsonValue {
  switch (type) {
    case 'object':
      return {};
    case 'array':
      return [];
    case 'string':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'null':
      return null;
  }
}

export function JsonTreeEditor({ value, onChange }: { value: JsonValue; onChange: (v: JsonValue) => void }) {
  return (
    <div className="dw-json-tree">
      <JsonNode value={value} onChange={onChange} depth={0} />
    </div>
  );
}

function JsonNode({
  value,
  onChange,
  depth,
}: {
  value: JsonValue;
  onChange: (v: JsonValue) => void;
  depth: number;
}) {
  const [collapsed, setCollapsed] = useState(depth > 2);
  const type = typeOf(value);

  const typeSelect = (
    <select
      className="dw-json-type"
      value={type}
      onChange={(e) => onChange(defaultFor(e.target.value as JsonType))}
      aria-label="type"
    >
      {TYPES.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );

  if (type === 'object') {
    const entries = Object.entries(value as { [k: string]: JsonValue });
    const setEntries = (next: [string, JsonValue][]) => {
      const obj: { [k: string]: JsonValue } = {};
      for (const [k, v] of next) obj[k] = v;
      onChange(obj);
    };
    return (
      <div className="dw-json-node">
        <div className="dw-json-branchhead">
          <button className="dw-json-collapse" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'expand' : 'collapse'}>
            <ChevronIcon size={12} className={collapsed ? '' : 'open'} />
          </button>
          {typeSelect}
          <span className="dw-json-meta">{entries.length} field{entries.length === 1 ? '' : 's'}</span>
        </div>
        {!collapsed && (
          <div className="dw-json-children">
            {entries.map(([k, v], i) => (
              <div className="dw-json-entry" key={i}>
                <input
                  className="dw-json-key"
                  value={k}
                  aria-label="key"
                  onChange={(e) => {
                    const next = entries.slice();
                    next[i] = [e.target.value, v];
                    setEntries(next);
                  }}
                />
                <span className="dw-json-colon">:</span>
                <JsonNode value={v} depth={depth + 1} onChange={(nv) => { const next = entries.slice(); next[i] = [k, nv]; setEntries(next); }} />
                <button className="dw-json-remove" title="Remove field" onClick={() => setEntries(entries.filter((_, j) => j !== i))}>
                  ×
                </button>
              </div>
            ))}
            <button
              className="dw-json-add"
              onClick={() => {
                const base = 'field';
                let name = base;
                let n = 1;
                const keys = new Set(entries.map(([k]) => k));
                while (keys.has(name)) name = `${base}${++n}`;
                setEntries([...entries, [name, '']]);
              }}
            >
              + field
            </button>
          </div>
        )}
      </div>
    );
  }

  if (type === 'array') {
    const arr = value as JsonValue[];
    return (
      <div className="dw-json-node">
        <div className="dw-json-branchhead">
          <button className="dw-json-collapse" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'expand' : 'collapse'}>
            <ChevronIcon size={12} className={collapsed ? '' : 'open'} />
          </button>
          {typeSelect}
          <span className="dw-json-meta">{arr.length} item{arr.length === 1 ? '' : 's'}</span>
        </div>
        {!collapsed && (
          <div className="dw-json-children">
            {arr.map((v, i) => (
              <div className="dw-json-entry" key={i}>
                <span className="dw-json-index">{i}</span>
                <JsonNode value={v} depth={depth + 1} onChange={(nv) => onChange(arr.map((x, j) => (j === i ? nv : x)))} />
                <button className="dw-json-remove" title="Remove item" onClick={() => onChange(arr.filter((_, j) => j !== i))}>
                  ×
                </button>
              </div>
            ))}
            <button className="dw-json-add" onClick={() => onChange([...arr, ''])}>
              + item
            </button>
          </div>
        )}
      </div>
    );
  }

  // Primitive: type selector + an appropriate value editor.
  return (
    <div className="dw-json-node dw-json-leaf">
      {typeSelect}
      {type === 'string' && (
        <input className="dw-json-value" value={value as string} aria-label="value" onChange={(e) => onChange(e.target.value)} />
      )}
      {type === 'number' && (
        <input
          className="dw-json-value"
          type="number"
          value={value as number}
          aria-label="value"
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        />
      )}
      {type === 'boolean' && (
        <select className="dw-json-value" value={String(value)} aria-label="value" onChange={(e) => onChange(e.target.value === 'true')}>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      )}
      {type === 'null' && <span className="dw-json-null">null</span>}
    </div>
  );
}
