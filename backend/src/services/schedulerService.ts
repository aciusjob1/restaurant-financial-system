import cron, { type ScheduledTask } from 'node-cron';
import { getSetting, setSettingInternal } from './settingsService.js';
import { createBackup } from './backupService.js';

let task: ScheduledTask | null = null;

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
}
