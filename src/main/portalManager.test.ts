// Characterization tests for PortalManager (src/main/portalManager.ts).
// PortalManager drives a real Electron `WebContentsView`; under Vitest the
// `electron` alias resolves to src/test/electron.mock.ts, whose fake
// WebContentsView exposes a controllable EventEmitter `webContents`.
// Type-wise these tests use the real electron typings and spy on the fakes'
// methods; prototype-level spies import the fake classes from the mock file
// directly (same module instance at runtime).
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { BrowserWindow, WebContents } from 'electron';
import { PortalManager, type PortalBounds } from './portalManager';
import { FakeWebContents, WebContentsView as MockWebContentsView } from '../test/electron.mock';

/** Fresh manager wired to spyable win/renderer mocks (portalManager is stateful). */
function makeManager(rendererDestroyed = false) {
  const win = {
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
  } as unknown as BrowserWindow;
  const renderer = {
    send: vi.fn(),
    isDestroyed: vi.fn(() => rendererDestroyed),
  } as unknown as WebContents;
  return { manager: new PortalManager(win, renderer), win, renderer };
}

/** The fake webContents behind a portal (cast: tsc sees real electron types). */
function wcOf(manager: PortalManager, id: string): FakeWebContents {
  const entry = manager.entry(id);
  if (!entry) throw new Error(`no portal ${id}`);
  return entry.view.webContents as unknown as FakeWebContents;
}

describe('PortalManager', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('create', () => {
    it('registers the portal and exposes its entry', () => {
      const { manager } = makeManager();
      expect(manager.has('p1')).toBe(false);
      manager.create('p1', 'sessA', 'about:blank');
      expect(manager.has('p1')).toBe(true);
      const entry = manager.entry('p1');
      expect(entry?.partition).toBe('sessA');
      expect(entry?.console).toEqual([]);
      expect(entry?.view).toBeInstanceOf(MockWebContentsView);
    });

    it('is a no-op for a duplicate id', () => {
      const { manager, win } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      manager.create('p1', 'b', 'https://other.example');
      expect(win.contentView.addChildView).toHaveBeenCalledTimes(1);
      expect(manager.entry('p1')?.partition).toBe('a');
    });

    it('starts the view collapsed and hidden so it cannot flash at 0,0', () => {
      const setBounds = vi.spyOn(MockWebContentsView.prototype, 'setBounds');
      const setVisible = vi.spyOn(MockWebContentsView.prototype, 'setVisible');
      const { manager } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      expect(setBounds).toHaveBeenCalledWith({ x: 0, y: 0, width: 0, height: 0 });
      expect(setVisible).toHaveBeenCalledWith(false);
    });

    it('adds the view to the window contentView', () => {
      const { manager, win } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      expect(win.contentView.addChildView).toHaveBeenCalledTimes(1);
    });

    it('loads a non-blank url', () => {
      const loadURL = vi.spyOn(FakeWebContents.prototype, 'loadURL');
      const { manager } = makeManager();
      manager.create('p1', 'a', 'https://example.com');
      expect(loadURL).toHaveBeenCalledWith('https://example.com');
    });

    it('does not load about:blank or an empty url', () => {
      const loadURL = vi.spyOn(FakeWebContents.prototype, 'loadURL');
      const { manager } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      manager.create('p2', 'a', '');
      expect(loadURL).not.toHaveBeenCalled();
    });
  });

  describe('console capture', () => {
    it('captures console-message lines into the entry ring', () => {
      const { manager } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      const wc = wcOf(manager, 'p1');
      wc.emit('console-message', { message: 'ignored' }, 2, 'hello from page');
      wc.emit('console-message', { message: 'via event object' });
      wc.emit('console-message', {});
      expect(manager.consoleLog('p1')).toBe('hello from page\nvia event object\n');
    });

    it('caps the ring at 500 lines', () => {
      const { manager } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      const wc = wcOf(manager, 'p1');
      for (let i = 0; i < 505; i++) wc.emit('console-message', {}, 2, `line-${i}`);
      const lines = manager.consoleLog('p1').split('\n');
      expect(lines).toHaveLength(500);
      expect(lines[0]).toBe('line-5');
      expect(lines[499]).toBe('line-504');
    });
  });

  describe('navigation events', () => {
    it('forwards nav state to the renderer on navigation events', () => {
      const { manager, renderer } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      const wc = wcOf(manager, 'p1');
      vi.spyOn(wc, 'getURL').mockReturnValue('https://example.com/route');
      vi.spyOn(wc, 'getTitle').mockReturnValue('Example');
      vi.spyOn(wc.navigationHistory, 'canGoBack').mockReturnValue(true);
      vi.spyOn(wc.navigationHistory, 'canGoForward').mockReturnValue(false);
      for (const ev of ['did-navigate', 'did-navigate-in-page', 'page-title-updated', 'did-finish-load']) {
        wc.emit(ev);
      }
      expect(renderer.send).toHaveBeenCalledTimes(4);
      expect(renderer.send).toHaveBeenCalledWith('portal:nav', {
        id: 'p1',
        url: 'https://example.com/route',
        title: 'Example',
        canGoBack: true,
        canGoForward: false,
      });
    });

    it('skips renderer notifications when the renderer is destroyed', () => {
      const { manager, renderer } = makeManager(true);
      manager.create('p1', 'a', 'about:blank');
      wcOf(manager, 'p1').emit('did-navigate');
      expect(renderer.send).not.toHaveBeenCalled();
    });

    it('reloads a portal whose renderer process died', () => {
      const { manager } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      const wc = wcOf(manager, 'p1');
      const reload = vi.spyOn(wc, 'reload');
      wc.emit('render-process-gone');
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('does not reload a destroyed portal', () => {
      const { manager } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      const wc = wcOf(manager, 'p1');
      manager.destroy('p1');
      const reload = vi.spyOn(wc, 'reload');
      wc.emit('render-process-gone');
      expect(reload).not.toHaveBeenCalled();
    });
  });

  describe('notifyCreated', () => {
    it('sends portal:created to the renderer', () => {
      const { manager, renderer } = makeManager();
      manager.notifyCreated('p1', 'Port', 'https://a', 'sessA');
      expect(renderer.send).toHaveBeenCalledWith('portal:created', {
        id: 'p1',
        name: 'Port',
        url: 'https://a',
        partition: 'sessA',
      });
    });

    it('skips when the renderer is destroyed', () => {
      const { manager, renderer } = makeManager(true);
      manager.notifyCreated('p1', 'Port', 'https://a', 'sessA');
      expect(renderer.send).not.toHaveBeenCalled();
    });
  });

  describe('state', () => {
    it('reads url/title/navigation state from the webContents', () => {
      const { manager } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      const wc = wcOf(manager, 'p1');
      vi.spyOn(wc, 'getURL').mockReturnValue('https://x.dev');
      vi.spyOn(wc, 'getTitle').mockReturnValue('X');
      vi.spyOn(wc.navigationHistory, 'canGoBack').mockReturnValue(true);
      vi.spyOn(wc.navigationHistory, 'canGoForward').mockReturnValue(true);
      expect(manager.state('p1')).toEqual({
        url: 'https://x.dev',
        title: 'X',
        canGoBack: true,
        canGoForward: true,
      });
    });

    it('returns null for an unknown portal', () => {
      expect(makeManager().manager.state('nope')).toBeNull();
    });
  });

  describe('setBounds', () => {
    const rect: PortalBounds = { x: 1.4, y: 2.6, width: 300.2, height: 200.7 };

    it('hides the view and leaves bounds untouched when hidden', () => {
      const { manager } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      const view = manager.entry('p1')!.view;
      const setBounds = vi.spyOn(view, 'setBounds');
      const setVisible = vi.spyOn(view, 'setVisible');
      manager.setBounds('p1', { ...rect, width: 500 }, 1, false);
      expect(setVisible).toHaveBeenCalledWith(false);
      expect(setBounds).not.toHaveBeenCalled();
    });

    it('hides the view when the rect is too small to show', () => {
      const { manager } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      const view = manager.entry('p1')!.view;
      const setVisible = vi.spyOn(view, 'setVisible');
      const setBounds = vi.spyOn(view, 'setBounds');
      manager.setBounds('p1', { x: 0, y: 0, width: 1, height: 100 }, 1, true);
      manager.setBounds('p1', { x: 0, y: 0, width: 100, height: 0.5 }, 1, true);
      expect(setVisible).toHaveBeenCalledWith(false);
      expect(setBounds).not.toHaveBeenCalled();
    });

    it('shows the view with rounded bounds and applies the zoom factor', () => {
      const { manager } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      const view = manager.entry('p1')!.view;
      const setBounds = vi.spyOn(view, 'setBounds');
      const setVisible = vi.spyOn(view, 'setVisible');
      const setZoomFactor = vi.spyOn(wcOf(manager, 'p1'), 'setZoomFactor');
      manager.setBounds('p1', rect, 1.5, true);
      expect(setVisible).toHaveBeenCalledWith(true);
      expect(setBounds).toHaveBeenCalledWith({ x: 1, y: 3, width: 300, height: 201 });
      expect(setZoomFactor).toHaveBeenCalledWith(1.5);
    });

    it('defaults a non-positive zoom to 1', () => {
      const { manager } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      const setZoomFactor = vi.spyOn(wcOf(manager, 'p1'), 'setZoomFactor');
      manager.setBounds('p1', { ...rect, width: 500 }, 0, true);
      expect(setZoomFactor).toHaveBeenCalledWith(1);
    });

    it('is a no-op for an unknown portal', () => {
      const { manager } = makeManager();
      expect(() => manager.setBounds('nope', rect, 1, true)).not.toThrow();
    });
  });

  describe('navigate', () => {
    it.each([
      ['http://a.b', 'http://a.b'],
      ['https://a.b', 'https://a.b'],
      ['data:text/html,hi', 'data:text/html,hi'],
      ['about:blank', 'about:blank'],
      ['file:///tmp/x.html', 'file:///tmp/x.html'],
    ])('passes a url with an explicit scheme (%s) through as-is', (input, expected) => {
      const { manager } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      const loadURL = vi.spyOn(wcOf(manager, 'p1'), 'loadURL');
      manager.navigate('p1', input);
      expect(loadURL).toHaveBeenCalledWith(expected);
    });

    it('prefixes a bare host with https://', () => {
      const { manager } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      const loadURL = vi.spyOn(wcOf(manager, 'p1'), 'loadURL');
      manager.navigate('p1', 'example.com');
      expect(loadURL).toHaveBeenCalledWith('https://example.com');
    });

    it('is a no-op for an unknown portal', () => {
      const { manager } = makeManager();
      expect(() => manager.navigate('nope', 'example.com')).not.toThrow();
    });
  });

  describe('back/forward', () => {
    it('goes back only when history allows it', () => {
      const { manager } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      const wc = wcOf(manager, 'p1');
      const goBack = vi.spyOn(wc.navigationHistory, 'goBack');
      vi.spyOn(wc.navigationHistory, 'canGoBack').mockReturnValue(false);
      manager.back('p1');
      expect(goBack).not.toHaveBeenCalled();
      vi.spyOn(wc.navigationHistory, 'canGoBack').mockReturnValue(true);
      manager.back('p1');
      expect(goBack).toHaveBeenCalledTimes(1);
    });

    it('goes forward only when history allows it', () => {
      const { manager } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      const wc = wcOf(manager, 'p1');
      const goForward = vi.spyOn(wc.navigationHistory, 'goForward');
      vi.spyOn(wc.navigationHistory, 'canGoForward').mockReturnValue(false);
      manager.forward('p1');
      expect(goForward).not.toHaveBeenCalled();
      vi.spyOn(wc.navigationHistory, 'canGoForward').mockReturnValue(true);
      manager.forward('p1');
      expect(goForward).toHaveBeenCalledTimes(1);
    });

    it('is a no-op for unknown portals', () => {
      const { manager } = makeManager();
      expect(() => manager.back('nope')).not.toThrow();
      expect(() => manager.forward('nope')).not.toThrow();
    });
  });

  describe('reload', () => {
    it('reloads the portal webContents', () => {
      const { manager } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      const reload = vi.spyOn(wcOf(manager, 'p1'), 'reload');
      manager.reload('p1');
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('is a no-op for an unknown portal', () => {
      const { manager } = makeManager();
      expect(() => manager.reload('nope')).not.toThrow();
    });
  });

  describe('automation (js/click/type/scroll/dom)', () => {
    it('js runs code with a user gesture and returns the result', async () => {
      const { manager } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      const wc = wcOf(manager, 'p1');
      const js = vi.spyOn(wc, 'executeJavaScript').mockResolvedValue(42);
      await expect(manager.js('p1', '1 + 1')).resolves.toBe(42);
      expect(js).toHaveBeenCalledWith('1 + 1', true);
    });

    it('js throws when the portal is gone', async () => {
      await expect(makeManager().manager.js('nope', 'x')).rejects.toThrow('portal is gone');
    });

    it('click targets the selector', async () => {
      const { manager } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      const js = vi.spyOn(wcOf(manager, 'p1'), 'executeJavaScript').mockResolvedValue({ ok: true });
      await manager.click('p1', 'button.go');
      const code = js.mock.calls[0][0] as string;
      expect(code).toContain('"button.go"');
      expect(code).toContain('document.querySelector');
      expect(code).toContain('el.click');
    });

    it('type targets the selector and value', async () => {
      const { manager } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      const js = vi.spyOn(wcOf(manager, 'p1'), 'executeJavaScript').mockResolvedValue({ ok: true });
      await manager.type('p1', 'input.name', 'hello');
      const code = js.mock.calls[0][0] as string;
      expect(code).toContain('"input.name"');
      expect(code).toContain('"hello"');
      expect(code).toContain('el.focus');
    });

    it('scroll uses window.scrollBy', async () => {
      const { manager } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      const js = vi.spyOn(wcOf(manager, 'p1'), 'executeJavaScript').mockResolvedValue({ ok: true });
      await manager.scroll('p1', 10, 20);
      expect(js.mock.calls[0][0] as string).toContain('window.scrollBy(10,20)');
    });

    it('dom reads the whole document or a selector', async () => {
      const { manager } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      const js = vi.spyOn(wcOf(manager, 'p1'), 'executeJavaScript').mockResolvedValue('<html></html>');
      await expect(manager.dom('p1')).resolves.toBe('<html></html>');
      await manager.dom('p1', 'main');
      expect(js.mock.calls[1][0] as string).toContain('"main"');
    });

    it('dom caps the html at 200,000 chars', async () => {
      const { manager } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      vi.spyOn(wcOf(manager, 'p1'), 'executeJavaScript').mockResolvedValue('x'.repeat(250_000));
      await expect(manager.dom('p1')).resolves.toHaveLength(200_000);
    });
  });

  describe('screenshot', () => {
    const png = Buffer.from('fake-png-bytes');

    it('attaches the debugger, captures the page and writes a PNG file', async () => {
      const { manager } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      const dbg = wcOf(manager, 'p1').debugger;
      const attach = vi.spyOn(dbg, 'attach');
      const sendCommand = vi.spyOn(dbg, 'sendCommand').mockResolvedValue({ data: png.toString('base64') });
      vi.spyOn(Date, 'now').mockReturnValue(12345);
      const file = await manager.screenshot('p1');
      expect(attach).toHaveBeenCalledWith('1.3');
      expect(sendCommand).toHaveBeenCalledWith('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
      });
      expect(file).toBe(path.join(os.tmpdir(), 'dogwalker-portal', 'p1-12345.png'));
      expect(fs.existsSync(file)).toBe(true);
      expect(fs.readFileSync(file)).toEqual(png);
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    });

    it('does not re-attach an already attached debugger', async () => {
      const { manager } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      const dbg = wcOf(manager, 'p1').debugger;
      const attach = vi.spyOn(dbg, 'attach');
      vi.spyOn(dbg, 'isAttached').mockReturnValue(true);
      const sendCommand = vi.spyOn(dbg, 'sendCommand').mockResolvedValue({ data: '' });
      const file = await manager.screenshot('p1');
      expect(attach).not.toHaveBeenCalled();
      expect(sendCommand).toHaveBeenCalledTimes(1);
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    });

    it('throws when the portal is gone', async () => {
      await expect(makeManager().manager.screenshot('nope')).rejects.toThrow('portal is gone');
    });
  });

  describe('destroy', () => {
    it('removes the entry, the view and closes the webContents', () => {
      const { manager, win } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      const view = manager.entry('p1')!.view;
      const close = vi.spyOn(wcOf(manager, 'p1'), 'close');
      manager.destroy('p1');
      expect(manager.has('p1')).toBe(false);
      expect(manager.entry('p1')).toBeUndefined();
      expect(win.contentView.removeChildView).toHaveBeenCalledWith(view);
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('detaches an attached debugger', () => {
      const { manager } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      const dbg = wcOf(manager, 'p1').debugger;
      const detach = vi.spyOn(dbg, 'detach');
      vi.spyOn(dbg, 'isAttached').mockReturnValue(true);
      manager.destroy('p1');
      expect(detach).toHaveBeenCalledTimes(1);
    });

    it('is a no-op for an unknown portal', () => {
      const { manager, win } = makeManager();
      expect(() => manager.destroy('nope')).not.toThrow();
      expect(win.contentView.removeChildView).not.toHaveBeenCalled();
    });

    it('destroyAll tears down every portal', () => {
      const { manager, win } = makeManager();
      manager.create('p1', 'a', 'about:blank');
      manager.create('p2', 'b', 'about:blank');
      manager.destroyAll();
      expect(manager.has('p1')).toBe(false);
      expect(manager.has('p2')).toBe(false);
      expect(win.contentView.removeChildView).toHaveBeenCalledTimes(2);
    });
  });
});
