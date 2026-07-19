import type { PresetId } from '../shared/ipc';
import { terminals } from './terminalService';

/**
 * Automated spike self-check, enabled with DW_SMOKE=1 (dev only).
 * Exercises spawn → PTY data flow → tier transitions (viewport moves) →
 * mirror serialization, and prints a single `SMOKE RESULT {...}` line that
 * reaches stdout through the renderer-console mirror in main.
 */
interface SmokeDeps {
  spawn: (preset: PresetId) => Promise<string>;
  setViewport: (viewport: { x: number; y: number; zoom: number }) => Promise<unknown>;
  getViewport: () => { x: number; y: number; zoom: number };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function sampleFps(ms: number): Promise<number> {
  return new Promise((resolve) => {
    let frames = 0;
    const start = performance.now();
    const tick = (now: number) => {
      frames++;
      if (now - start >= ms) {
        resolve(Math.round((frames * 1000) / (now - start)));
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

let ran = false;

export async function runSmoke(deps: SmokeDeps): Promise<void> {
  // Module-level guard: survives HMR remounts of App, which reset refs.
  if (ran) return;
  ran = true;
  const params = new URLSearchParams(window.location.search);
  const quiet = params.has('quiet');
  console.log(
    `[smoke] start — 15 terminals (${quiet ? '15 quiet shells' : '5 stress + 10 shell'})`,
  );
  const ids: string[] = [];
  for (let i = 0; i < 15; i++) {
    ids.push(await deps.spawn(!quiet && i % 3 === 0 ? 'stress' : 'shell'));
  }

  // Let shells init and the stress presets start flooding.
  await wait(8000);

  // Phase 1 — working zoom: a handful of terminals readable on screen.
  const statsNear = terminals.stats();
  const fpsNear = await sampleFps(2000);

  // Phase 2 — overview zoom: whole grid visible, unreadable → all tier 2.
  await deps.setViewport({ x: 20, y: 20, zoom: 0.35 });
  await wait(1000);
  const statsOverview = terminals.stats();
  const fpsOverview = await sampleFps(2000);

  // Phase 3 — flown away: everything suspended (tier 3).
  await deps.setViewport({ x: -20000, y: -20000, zoom: 0.35 });
  await wait(1000);
  const statsFar = terminals.stats();
  const fpsFar = await sampleFps(2000);

  // Mirror truth while renderer side is suspended (a stress terminal).
  const mirrorWhileSuspended = await window.dw.serialize(ids[0]);

  // Phase 4 — back to working zoom: promotions + resync from queues/mirror.
  await deps.setViewport({ x: 40, y: 80, zoom: 1 });
  await wait(1500);
  const statsBack = terminals.stats();
  const fpsBack = await sampleFps(2000);

  // Phase 5 — continuous pan across the grid, the exit-criterion motion.
  let panFrames = 0;
  const panStart = performance.now();
  for (let step = 0; step <= 20; step++) {
    await deps.setViewport({ x: -step * 300, y: -Math.floor(step / 7) * 300, zoom: 0.8 });
    await new Promise((r) =>
      requestAnimationFrame(() => {
        panFrames++;
        r(null);
      }),
    );
    await wait(80);
  }
  const panMs = performance.now() - panStart;
  const fpsPan = await sampleFps(2000);

  console.log(
    'SMOKE RESULT ' +
      JSON.stringify({
        terminals: ids.length,
        fpsNear,
        fpsOverview,
        fpsFar,
        fpsBack,
        fpsPan,
        panSteps: panFrames,
        panMs: Math.round(panMs),
        statsNear,
        statsOverview,
        statsFar,
        statsBack,
        statsEnd: terminals.stats(),
        mirrorBytesWhileSuspended: mirrorWhileSuspended.length,
      }),
  );

  // Soak phase (DW_SOAK=1): 30 minutes at working zoom, one metric line per
  // minute — hunting leaks, context-loss accumulation, and slow degradation.
  if (params.has('soak')) {
    const soakMinutes = Number(params.get('soakmin')) || 30;
    await deps.setViewport({ x: 40, y: 80, zoom: 1 });
    console.log(`[soak] start — ${soakMinutes} min`);
    for (let minute = 1; minute <= soakMinutes; minute++) {
      await wait(60_000);
      const procs = await window.dw.metrics();
      const appMB = procs.reduce((sum, p) => sum + p.memoryMB, 0);
      const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } })
        .memory?.usedJSHeapSize;
      const fps = await sampleFps(1000);
      console.log(
        `SOAK ${minute}min ` +
          JSON.stringify({
            fps,
            stats: terminals.stats(),
            appMB,
            heapMB: heap ? Math.round(heap / 1048576) : null,
          }),
      );
    }
    console.log('SOAK DONE');
  }
}
