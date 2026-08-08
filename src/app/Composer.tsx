import { useEffect, useMemo, useRef, useState } from 'react';
import { TerminalIcon, CrownIcon, SendIcon } from './icons';

export interface ComposerTerminal {
  id: string; // live terminal id (routing)
  stableId: string;
  name: string;
  /** A Walker (manager agent, §5.4) — marked in the mention menu. */
  walker?: boolean;
}

interface Props {
  /** Every live terminal, so any can be @mentioned as a recipient. */
  terminals: ComposerTerminal[];
  focusSignal: number;
}

const DRAFT_DEBOUNCE_MS = 300;
/** One shared draft: the composer is a single open chat, not bound to a node. */
const DRAFT_KEY = '__composer__';

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Which terminals a message is addressed to: those whose `@name` appears in the
 * text (case-insensitive, with a trailing boundary so `@shell` doesn't also hit
 * `@shell-2`). Recipients are derived from the text itself — the `@mention` is
 * both the routing marker and part of the verbatim message.
 */
export function recipientsOf(text: string, terminals: ComposerTerminal[]): ComposerTerminal[] {
  return terminals.filter((t) => new RegExp('@' + escapeRegExp(t.name) + '(?![\\w-])', 'i').test(text));
}

/**
 * Split the text into plain runs and highlighted `@mention` spans (matching a
 * live terminal's name). Rendered in an overlay behind a transparent textarea so
 * mentions are tinted in the accent color as you type.
 */
function highlightSegments(text: string, terminals: ComposerTerminal[]): React.ReactNode[] {
  if (terminals.length === 0) return [text];
  const names = terminals.map((t) => t.name).sort((a, b) => b.length - a.length);
  const re = new RegExp('@(?:' + names.map(escapeRegExp).join('|') + ')(?![\\w-])', 'g');
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <span key={key++} className="dw-mention-hl">
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

/**
 * Floating prompt composer (PRODUCT.md §7): an open chat, not bound to a
 * selected terminal. Type @ to mention one or more live terminals — the message
 * is delivered verbatim (mentions included, never split) to each mentioned
 * terminal, so addressing several at once lets each agent see what the others
 * were told. Enter submits, Shift+Enter makes a newline. Pasted images are
 * written to a temp file and their path inserted. The draft persists.
 */
export function Composer({ terminals, focusSignal }: Props) {
  const [text, setText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const draftTimer = useRef<number | null>(null);

  // Load the shared draft once.
  useEffect(() => {
    let alive = true;
    void window.dw.getDraft(DRAFT_KEY).then((d) => {
      if (alive) setText(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (focusSignal > 0) ref.current?.focus();
  }, [focusSignal]);

  const items = useMemo(() => {
    const q = query.toLowerCase();
    return terminals.filter((t) => t.name.toLowerCase().includes(q));
  }, [terminals, query]);

  const recipients = useMemo(() => recipientsOf(text, terminals), [text, terminals]);

  const cancelDraftSave = () => {
    if (draftTimer.current !== null) {
      window.clearTimeout(draftTimer.current);
      draftTimer.current = null;
    }
  };

  const saveDraft = (next: string) => {
    cancelDraftSave();
    draftTimer.current = window.setTimeout(() => {
      window.dw.setDraft(DRAFT_KEY, next);
    }, DRAFT_DEBOUNCE_MS);
  };

  const update = (next: string) => {
    setText(next);
    saveDraft(next);
    // Detect an @-token immediately before the caret.
    const caret = ref.current?.selectionStart ?? next.length;
    const before = next.slice(0, caret);
    const m = /(?:^|\s)@([\w-]*)$/.exec(before);
    if (m) {
      setQuery(m[1]);
      setIndex(0);
      setMenuOpen(true);
    } else {
      setMenuOpen(false);
    }
  };

  const insertMention = (t: ComposerTerminal) => {
    const caret = ref.current?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([\w-]*)$/, `@${t.name} `);
    const next = before + text.slice(caret);
    setMenuOpen(false);
    setText(next);
    saveDraft(next);
    requestAnimationFrame(() => ref.current?.focus());
  };

  const send = () => {
    const body = text.trim();
    if (!body || recipients.length === 0) return;
    // The full text — mentions included — goes to each recipient verbatim.
    for (const r of recipients) window.dw.sendPrompt(r.id, body);
    setText('');
    cancelDraftSave();
    window.dw.setDraft(DRAFT_KEY, '');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen && items.length > 0) {
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
        insertMention(items[index]);
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

  if (terminals.length === 0) return null;

  const syncScroll = () => {
    const ta = ref.current;
    const hl = highlightRef.current;
    if (ta && hl) {
      hl.scrollTop = ta.scrollTop;
      hl.scrollLeft = ta.scrollLeft;
    }
  };

  return (
    <div className="dw-composer">
      <div className="dw-composer-input">
        {menuOpen && items.length > 0 && (
          <div className="dw-mention-menu">
            {items.map((t, i) => (
              <button
                key={t.id}
                className={`dw-mention-item ${i === index ? 'active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(t);
                }}
              >
                <span className="dw-mention-icon">
                  {t.walker ? <CrownIcon size={14} /> : <TerminalIcon size={14} />}
                </span>
                {t.name}
              </button>
            ))}
          </div>
        )}
        {/* Overlay behind the transparent textarea that tints @mentions. */}
        <div className="dw-composer-highlight" aria-hidden="true" ref={highlightRef}>
          {highlightSegments(text, terminals)}
          {'\n'}
        </div>
        <textarea
          ref={ref}
          className="dw-composer-textarea"
          value={text}
          placeholder="Message terminals…  (@ to mention, Enter to send)"
          onChange={(e) => update(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={(e) => void onPaste(e)}
          onScroll={syncScroll}
          rows={2}
        />
      </div>
      <button
        className="dw-composer-send"
        onClick={send}
        disabled={recipients.length === 0}
        title={recipients.length === 0 ? 'Mention a terminal first' : 'Send (Enter)'}
      >
        <SendIcon size={16} />
      </button>
    </div>
  );
}
