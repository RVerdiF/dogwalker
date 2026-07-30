import { useEffect, useMemo, useRef, useState } from 'react';

export interface ComposerTarget {
  id: string; // live terminal id
  stableId: string;
  name: string;
}

export interface Mention {
  name: string;
  kind: 'terminal' | 'note';
  /** A Walker (manager agent, §5.4) — marked in the mention menu. */
  walker?: boolean;
}

interface Props {
  target: ComposerTarget | null;
  mentions: Mention[];
  /** Create a note wired to the target; resolves to its name to insert. */
  onNewNote: () => Promise<string>;
  /** Create a portal wired to the target; resolves to its name to insert. */
  onNewPortal: () => Promise<string>;
  focusSignal: number;
}

const DRAFT_DEBOUNCE_MS = 300;

/**
 * Floating prompt composer bound to the selected terminal (PRODUCT.md §7).
 * Enter submits (atomic inject), Shift+Enter makes a newline. Typing @ opens a
 * menu of connected terminals/notes plus "New note". Pasted images are written
 * to a temp file and their path inserted, which every agent CLI can read.
 * Drafts persist per terminal. "New portal" creates a browser wired to the
 * target (§9); @Walker mentions and nav-key pass-through arrive with their
 * features.
 */
export function Composer({ target, mentions, onNewNote, onNewPortal, focusSignal }: Props) {
  const [text, setText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const draftTimer = useRef<number | null>(null);

  // Load the draft when the target changes.
  useEffect(() => {
    if (!target) return;
    let alive = true;
    void window.dw.getDraft(target.stableId).then((d) => {
      if (alive) setText(d);
    });
    return () => {
      alive = false;
    };
  }, [target?.stableId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (focusSignal > 0) ref.current?.focus();
  }, [focusSignal]);

  const items = useMemo(() => {
    const q = query.toLowerCase();
    const matches = mentions.filter((m) => m.name.toLowerCase().includes(q));
    return [
      { name: 'New note', kind: 'new' as const },
      { name: 'New portal', kind: 'new-portal' as const },
      ...matches,
    ];
  }, [mentions, query]);

  if (!target) return null;

  const saveDraft = (next: string) => {
    if (draftTimer.current !== null) window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => {
      window.dw.setDraft(target.stableId, next);
    }, DRAFT_DEBOUNCE_MS);
  };

  const update = (next: string) => {
    setText(next);
    saveDraft(next);
    // Detect an @-token immediately before the caret.
    const caret = ref.current?.selectionStart ?? next.length;
    const before = next.slice(0, caret);
    const m = /(?:^|\s)@(\w*)$/.exec(before);
    if (m) {
      setQuery(m[1]);
      setIndex(0);
      setMenuOpen(true);
    } else {
      setMenuOpen(false);
    }
  };

  const insertMention = async (item: (typeof items)[number]) => {
    const name =
      item.kind === 'new'
        ? await onNewNote()
        : item.kind === 'new-portal'
          ? await onNewPortal()
          : item.name;
    const caret = ref.current?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@(\w*)$/, `@${name} `);
    const next = before + text.slice(caret);
    setMenuOpen(false);
    setText(next);
    saveDraft(next);
    requestAnimationFrame(() => ref.current?.focus());
  };

  const send = () => {
    const body = text.trim();
    if (!body) return;
    window.dw.sendPrompt(target.id, body);
    setText('');
    window.dw.setDraft(target.stableId, '');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIndex((i) => (i + 1) % items.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIndex((i) => (i - 1 + items.length) % items.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        void insertMention(items[index]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenuOpen(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const onPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = Array.from(e.clipboardData.items)
      .find((it) => it.type.startsWith('image/'))
      ?.getAsFile();
    if (!file) return;
    e.preventDefault();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const p = await window.dw.saveDropImage(file.name || 'paste.png', bytes);
    const caret = ref.current?.selectionStart ?? text.length;
    const next = text.slice(0, caret) + p + ' ' + text.slice(caret);
    update(next);
  };

  return (
    <div className="dw-composer">
      <div className="dw-composer-target">→ {target.name}</div>
      <div className="dw-composer-input">
        {menuOpen && (
          <div className="dw-mention-menu">
            {items.map((it, i) => (
              <button
                key={it.name + i}
                className={`dw-mention-item ${i === index ? 'active' : ''} ${
                  it.kind === 'new' ? 'new' : ''
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  void insertMention(it);
                }}
              >
                <span className="dw-mention-icon">
                  {it.kind === 'new' || it.kind === 'new-portal'
                    ? '＋'
                    : 'walker' in it && it.walker
                      ? '👑'
                      : it.kind === 'note'
                        ? '📝'
                        : '🖥'}
                </span>
                {it.name}
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={ref}
          className="dw-composer-textarea"
          value={text}
          placeholder={`Message ${target.name}…  (@ to mention, Enter to send)`}
          onChange={(e) => update(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={(e) => void onPaste(e)}
          rows={2}
        />
      </div>
      <button className="dw-composer-send" onClick={send} title="Send (Enter)">
        ➤
      </button>
    </div>
  );
}
