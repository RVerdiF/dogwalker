/**
 * Portals are native `WebContentsView`s (PortalManager) and Electron paints them
 * ABOVE the whole HTML DOM — so a portal would cover the minimap, floating menus
 * and modals, which are plain DOM. There is no z-index that puts a native view
 * under the DOM, and no arbitrary clip region for it. So the renderer instead
 * shrinks each portal's native bounds to the largest rectangle that avoids every
 * on-screen overlay ("occluder"), and hides the portal outright when an overlay
 * (e.g. a modal scrim) covers it entirely. That is what makes portals respect
 * the visual layering.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Existing overlay containers that float over the canvas. We reference their
 * classes rather than tagging each component, so no overlay needs to know about
 * portals. Full-screen scrims (modals/dialogs) cover a portal completely, which
 * yields an empty clip and hides it; corner/edge overlays (minimap, composer,
 * menus) just trim the portal. `.dw-portal-occluder` lets any future overlay
 * opt in without editing this list.
 */
const OCCLUDER_SELECTOR = [
  '.dw-minimap',
  '.dw-composer',
  '.dw-history',
  '.dw-mention-menu',
  '.dw-ctxmenu',
  '.dw-git-menu',
  '.dw-rail-menu',
  '.dw-palette',
  '.dw-floor-dialog-scrim',
  '.dw-panel-scrim',
  '.dw-portal-occluder',
].join(',');

const area = (r: Rect): number => Math.max(0, r.width) * Math.max(0, r.height);

function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * The largest axis-aligned sub-rectangle of `rect` that does not overlap `hole`.
 * Picks the biggest of the four strips (above / below / left / right of the
 * hole), keeping `rect`'s top-left origin where possible so the page doesn't
 * appear to shift. Returns `rect` unchanged when they don't overlap, and a
 * zero-area rect when the hole covers `rect` entirely.
 */
export function subtractRect(rect: Rect, hole: Rect): Rect {
  if (!intersects(rect, hole)) return rect;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const candidates: Rect[] = [
    { x: rect.x, y: rect.y, width: rect.width, height: Math.max(0, hole.y - rect.y) }, // above
    { x: rect.x, y: hole.y + hole.height, width: rect.width, height: Math.max(0, bottom - (hole.y + hole.height)) }, // below
    { x: rect.x, y: rect.y, width: Math.max(0, hole.x - rect.x), height: rect.height }, // left
    { x: hole.x + hole.width, y: rect.y, width: Math.max(0, right - (hole.x + hole.width)), height: rect.height }, // right
  ];
  return candidates.reduce((best, c) => (area(c) > area(best) ? c : best), {
    x: rect.x,
    y: rect.y,
    width: 0,
    height: 0,
  });
}

/** Fold {@link subtractRect} over every occluder (greedy; good enough for a few). */
export function clipToOccluders(rect: Rect, holes: Rect[]): Rect {
  let r = rect;
  for (const h of holes) {
    if (area(r) <= 0) break;
    r = subtractRect(r, h);
  }
  return r;
}

// ---- shared observer -------------------------------------------------------

type Listener = (holes: Rect[]) => void;
const listeners = new Set<Listener>();
let pollTimer: number | null = null;
let lastSignature = '';

function readOccluders(): Rect[] {
  const holes: Rect[] = [];
  document.querySelectorAll(OCCLUDER_SELECTOR).forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      holes.push({ x: r.left, y: r.top, width: r.width, height: r.height });
    }
  });
  return holes;
}

const signatureOf = (holes: Rect[]): string =>
  holes.map((h) => `${Math.round(h.x)},${Math.round(h.y)},${Math.round(h.width)},${Math.round(h.height)}`).join('|');

function poll(): void {
  const holes = readOccluders();
  const sig = signatureOf(holes);
  if (sig === lastSignature) return;
  lastSignature = sig;
  for (const cb of listeners) cb(holes);
}

/**
 * Subscribe to occluder-rectangle changes. Overlays open/close/move without any
 * canvas pan or resize, so a light interval poll (a handful of
 * getBoundingClientRect reads, only while a portal is mounted) is the least
 * coupled way to notice them. Fires once immediately with the current set.
 */
export function observeOcclusion(listener: Listener): () => void {
  listeners.add(listener);
  listener(readOccluders());
  if (pollTimer === null) {
    lastSignature = '';
    pollTimer = window.setInterval(poll, 120);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && pollTimer !== null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  };
}
