import type { Request, Response } from 'express';
import * as backupService from '../services/backupService.js';
import * as scanner from '../services/backupDestinationScanner.js';
import * as scheduler from '../services/schedulerService.js';
import { getSetting, setSettingInternal } from '../services/settingsService.js';

export async function createBackup(req: Request, res: Response) {
  const body = (req.body ?? {}) as { destination?: string | null };
  const backup = await backupService.createBackup(req.user!.id, {
    destination: body.destination ?? null,
    kind: 'manual',
  });
  res.status(201).json({ success: true, backup });
}

export async function listBackups(_req: Request, res: Response) {
  const result = await backupService.listBackups();
  res.json({ success: true, destination: result.destination, backups: result.backups });
}

export async function listDestinations(_req: Request, res: Response) {
  const destinations = await scanner.scanDestinations();
  const current = await getSetting('backup.destination');
  res.json({ success: true, destinations, current: current ?? '' });
}

export async function getSchedule(_req: Request, res: Response) {
  const [cron, preset, retention, lastRunAt, lastRunStatus, lastRunMessage] = await Promise.all([
    getSetting('backup.schedule.cron'),
    getSetting('backup.schedule.preset'),
    getSetting('backup.retention.count'),
    getSetting('backup.lastRunAt'),
    getSetting('backup.lastRunStatus'),
    getSetting('backup.lastRunMessage'),
  ]);
  res.json({
    success: true,
    schedule: {
      cron: cron ?? '',
      preset: preset ?? 'off',
      retention: retention ?? '0',
      lastRunAt: lastRunAt ?? '',
      lastRunStatus: lastRunStatus ?? '',
      lastRunMessage: lastRunMessage ?? '',
    },
  });
}

export async function updateSchedule(req: Request, res: Response) {
  const body = (req.body ?? {}) as { cron?: string; preset?: string; retention?: string };
  const cron = (body.cron ?? '').trim();
  const applied = await scheduler.applySchedule(cron || null);
  if (!applied.applied) {
    res.status(400).json({ success: false, error: { code: 'INVALID_CRON', message: 'Cron expression is not valid.' } });
    return;
  }
  await setSettingInternal('backup.schedule.cron', cron);
  await setSettingInternal('backup.schedule.preset', body.preset ?? 'custom');
  await setSettingInternal('backup.retention.count', body.retention ?? '0');
  res.json({ success: true });
}

export async function setDestination(req: Request, res: Response) {
  const body = (req.body ?? {}) as { destination?: string };
  const dest = (body.destination ?? '').trim();
  await setSettingInternal('backup.destination', dest);
  res.json({ success: true });
}
