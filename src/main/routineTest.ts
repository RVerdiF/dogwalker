import type { PtyManager } from './ptyManager';
import { RoutineService } from './routineService';

/**
 * Routines validation (DW_ROUTINETEST=1): a `&&`-chained routine injects its
 * steps in order, each after the target goes quiet; status returns to idle;
 * a routine whose target is gone skips safely; pausing flips it to paused; and
 * the pure step split behaves.
 */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runRoutineTest(
  ptys: PtyManager,
  routines: RoutineService,
): Promise<void> {
  const results: Record<string, unknown> = {};

  // Pure split.
  results.stepsSplit =
    JSON.stringify(RoutineService.steps('a && b\nc')) === JSON.stringify(['a', 'b', 'c']);

  const term = ptys.spawn({
    preset: 'shell',
    cols: 80,
    rows: 24,
    workspaceId: 'routine-test',
    stableId: 'routine-term',
    cwd: '',
    name: 'agent',
  }).id;
  await wait(2500);

  const routine = routines.create('routine-test', {
    name: 'chain',
    targetStableId: 'routine-term',
    prompt: 'echo ROUTINE_STEP1 && echo ROUTINE_STEP2',
    intervalMs: 3_600_000, // effectively never; we drive it with runNow
  });

  await routines.runNow(routine.id);
  const screen = ptys.serialize(term);
  const i1 = screen.indexOf('ROUTINE_STEP1');
  const i2 = screen.indexOf('ROUTINE_STEP2');
  results.bothSteps = i1 >= 0 && i2 >= 0;
  results.chainOrder = i1 >= 0 && i2 > i1;
  results.statusIdleAfter = routines.list('routine-test')[0]?.status === 'idle';

  // Pause flips status + disarms.
  const paused = routines.setEnabled(routine.id, false);
  results.paused = paused?.status === 'paused' && paused?.enabled === false;

  // Target gone → runNow is a safe no-op.
  ptys.kill(term);
  await wait(300);
  let threw = false;
  try {
    await routines.runNow(routine.id);
  } catch {
    threw = true;
  }
  results.deadTargetSafe = !threw && routines.list('routine-test')[0]?.status === 'paused';

  console.log('ROUTINETEST RESULT ' + JSON.stringify(results));
  routines.remove(routine.id);
}
