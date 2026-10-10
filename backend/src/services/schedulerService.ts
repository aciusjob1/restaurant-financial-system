import cron, { type ScheduledTask } from 'node-cron';
import { getSetting, setSettingInternal } from './settingsService.js';
import { createBackup } from './backupService.js';
import { closeStaleOpenShiftsAll } from './shiftAutoCloseService.js';

let task: ScheduledTask | null = null;
let autoCloseTask: ScheduledTask | null = null;
const AUTO_CLOSE_CRON = '59 23 * * *';

const SYSTEM_ACTOR_ID = 'system:scheduler';

function isValidCron(expr: string): boolean {
  return cron.validate(expr);
}

async function runAutoBackup(): Promise<void> {
  try {
    await createBackup(SYSTEM_ACTOR_ID, { kind: 'auto' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await setSettingInternal('backup.lastRunAt', new Date().toISOString());
    await setSettingInternal('backup.lastRunStatus', 'failed');
    await setSettingInternal('backup.lastRunMessage', msg.slice(0, 190));
    console.error('[scheduler] auto backup failed:', msg);
  }
}

async function runAutoClose(): Promise<void> {
  try {
    await closeStaleOpenShiftsAll();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[scheduler] auto-close failed:', msg);
  }
}

export async function applySchedule(cronExpr: string | null): Promise<{ applied: boolean; error?: string }> {
  if (task) {
    task.stop();
    task = null;
  }
  if (!cronExpr || cronExpr.trim() === '') {
    return { applied: true };
  }
  if (!isValidCron(cronExpr)) {
    return { applied: false, error: 'INVALID_CRON' };
  }
  task = cron.schedule(cronExpr, () => { void runAutoBackup(); });
  return { applied: true };
}

export async function start(): Promise<void> {
  // 1. Auto-close: schedule the fixed nightly job, then catch up on any
  //    stale OPEN shifts that accumulated while the server was down.
  //    This is intentionally unconditional — unlike backup, auto-close is
  //    not user-configurable and must always be on.
  autoCloseTask = cron.schedule(AUTO_CLOSE_CRON, () => { void runAutoClose(); });
  console.log('[scheduler] auto-close scheduled for', AUTO_CLOSE_CRON);
  void runAutoClose();

  // 2. Backup: settings-driven, may be disabled.
  const expr = await getSetting('backup.schedule.cron');
  if (!expr) {
    console.log('[scheduler] no backup schedule configured');
    return;
  }
  const res = await applySchedule(expr);
  if (res.applied) {
    console.log('[scheduler] backup schedule active:', expr);
  } else {
    console.error('[scheduler] stored cron is invalid:', expr);
  }
}

export async function stop(): Promise<void> {
  if (task) { task.stop(); task = null; }
  if (autoCloseTask) { autoCloseTask.stop(); autoCloseTask = null; }
}
