import { useEffect, useState } from 'react';
import type { ProcessMetric } from '../shared/ipc';
import { terminals, type TierStats } from './terminalService';

interface PerfMemory {
  usedJSHeapSize: number;
}

/**
 * ROADMAP v0.0.1 output #6: fps, per-tier counts, live WebGL contexts,
 * per-process CPU & RAM.
 */
export function Hud() {
  const [fps, setFps] = useState(0);
  const [stats, setStats] = useState<TierStats | null>(null);
  const [heapMB, setHeapMB] = useState(0);
  const [procs, setProcs] = useState<ProcessMetric[]>([]);

  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      frames++;
      if (now - last >= 1000) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const statsTimer = window.setInterval(() => {
      setStats(terminals.stats());
      const memory = (performance as unknown as { memory?: PerfMemory }).memory;
      if (memory) setHeapMB(Math.round(memory.usedJSHeapSize / 1048576));
    }, 500);

    const metricsTimer = window.setInterval(() => {
      void window.dw.metrics().then(setProcs);
    }, 2000);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(statsTimer);
      clearInterval(metricsTimer);
    };
  }, []);

  const totalMB = procs.reduce((sum, p) => sum + p.memoryMB, 0);
  const totalCpu = procs.reduce((sum, p) => sum + p.cpuPercent, 0);

  return (
    <div className="dw-hud">
      <div className={`dw-hud-fps ${fps >= 55 ? 'ok' : 'bad'}`}>{fps} fps</div>
      {stats && (
        <div>
          T1(GL) {stats.tier1} · T2(DOM) {stats.tier2} · T3(zzz) {stats.tier3}
        </div>
      )}
      {stats && (
        <div>
          contexts {stats.webglContexts}/8 · losses {stats.contextLosses}
        </div>
      )}
      <div>
        heap {heapMB} MB · app {totalMB} MB · cpu {Math.round(totalCpu)}%
      </div>
    </div>
  );
}
