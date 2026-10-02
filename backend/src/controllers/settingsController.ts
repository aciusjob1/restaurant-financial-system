import type { Request, Response } from 'express';
import * as settingsService from '../services/settingsService.js';
import type { UpdateSettingsInput } from '../validators/settings.js';

export async function listSettings(_req: Request, res: Response) {
  const settings = await settingsService.listSettings();
  res.json({ success: true, settings });
}

export async function updateSettings(req: Request, res: Response) {
  const input = req.body as UpdateSettingsInput;
  const settings = await settingsService.updateSettings({
    actor: { id: req.user!.id, role: req.user!.role },
    settings: input.settings,
  });
  res.json({ success: true, settings });
}
