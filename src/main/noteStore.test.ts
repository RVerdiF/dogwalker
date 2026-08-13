import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { NoteStore } from './noteStore';
import type { GraphStore } from './graphStore';

function stubGraph(): GraphStore {
  return {
    addNode: vi.fn(),
    rename: vi.fn(),
    removeNode: vi.fn(),
  } as unknown as GraphStore;
}

describe('NoteStore', () => {
  let dir: string;
  let graph: GraphStore;
  let store: NoteStore;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-notes-'));
    graph = stubGraph();
    store = new NoteStore(dir, graph);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('constructor creates the notes directory', () => {
    expect(fs.existsSync(path.join(dir, 'notes'))).toBe(true);
  });

  it('register creates an empty file on disk, calls addNode(id, name, "note") and returns content', () => {
    const result = store.register('n1', 'First Note');

    expect(fs.readFileSync(path.join(dir, 'notes', 'n1.md'), 'utf8')).toBe('');
    expect(graph.addNode).toHaveBeenCalledWith('n1', 'First Note', 'note');
    expect(result).toBe('');
  });

  it('register on an existing file preserves its content and does not overwrite it', () => {
    store.write('n2', 'existing content');
    graph.addNode = vi.fn();

    const result = store.register('n2', 'Second Note');

    expect(fs.readFileSync(path.join(dir, 'notes', 'n2.md'), 'utf8')).toBe('existing content');
    expect(result).toBe('existing content');
    expect(graph.addNode).toHaveBeenCalledWith('n2', 'Second Note', 'note');
  });

  it('read of a missing id returns an empty string', () => {
    expect(store.read('ghost')).toBe('');
  });

  it('write persists content to disk', () => {
    store.write('n3', 'hello world');

    expect(fs.readFileSync(path.join(dir, 'notes', 'n3.md'), 'utf8')).toBe('hello world');
    expect(store.read('n3')).toBe('hello world');
  });

  it('write with notify=true emits "update" with the id', () => {
    const onUpdate = vi.fn();
    store.on('update', onUpdate);

    store.write('n4', 'content', true);

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith('n4');
  });

  it('write with notify=false does not emit "update"', () => {
    const onUpdate = vi.fn();
    store.on('update', onUpdate);

    store.write('n4', 'content', false);

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('append joins with a newline when the current content lacks a trailing newline', () => {
    store.write('n5', 'line one');

    store.append('n5', 'line two');

    expect(store.read('n5')).toBe('line one\nline two');
  });

  it('append concatenates directly when the current content ends with a newline', () => {
    store.write('n5', 'line one\n');

    store.append('n5', 'line two');

    expect(store.read('n5')).toBe('line one\nline two');
  });

  it('append to an empty file writes the content without a leading newline', () => {
    store.append('n5', 'first');

    expect(store.read('n5')).toBe('first');
  });

  it('append forwards notify to write and emits "update"', () => {
    const onUpdate = vi.fn();
    store.on('update', onUpdate);

    store.append('n5', 'first', true);

    expect(onUpdate).toHaveBeenCalledWith('n5');
  });

  it('saveImage sanitizes the name, prefixes a timestamp, returns a forward-slash path and writes the bytes', () => {
    const bytes = new Uint8Array([1, 2, 3, 255]);

    const result = store.saveImage('n6', 'a b/c.png', bytes);

    expect(result).not.toContain('\\');
    const basename = path.basename(result);
    expect(basename).toMatch(/^\d+-a_b_c\.png$/);
    expect(fs.readFileSync(path.normalize(result))).toEqual(Buffer.from(bytes));
  });

  it('saveImage falls back to image.png for an empty name', () => {
    const result = store.saveImage('n6', '', new Uint8Array([0]));

    expect(path.basename(result)).toMatch(/^\d+-image\.png$/);
    expect(fs.existsSync(path.normalize(result))).toBe(true);
  });

  it('unload removes the node from the graph', () => {
    store.unload('n7');

    expect(graph.removeNode).toHaveBeenCalledWith('n7');
  });

  it('delete removes the graph node, the file and the assets directory', () => {
    store.write('n8', 'bye');
    fs.mkdirSync(path.join(dir, 'notes', 'n8.assets'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'notes', 'n8.assets', 'pic.png'), 'img');

    store.delete('n8');

    expect(graph.removeNode).toHaveBeenCalledWith('n8');
    expect(fs.existsSync(path.join(dir, 'notes', 'n8.md'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'notes', 'n8.assets'))).toBe(false);
  });

  it('delete of a missing id does not throw', () => {
    expect(() => store.delete('ghost')).not.toThrow();
    expect(graph.removeNode).toHaveBeenCalledWith('ghost');
  });
});
