import { z } from 'zod';

// Whitelist of setting keys the API will accept. Anything else is a
// 400 INVALID_SETTING_KEY. Add a key here when a new setting ships.
export const SETTING_KEYS = [
  'restaurant.name',
  'restaurant.logoPath',
  'backup.destination',
  'backup.schedule.cron',
  'backup.schedule.preset',
  'backup.retention.count',
  'backup.lastRunAt',
  'backup.lastRunStatus',
  'backup.lastRunMessage',
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

const SettingKeyEnum = z.enum(SETTING_KEYS);

export const UpdateSettingsSchema = z.object({
  settings: z.record(z.string().min(1).max(64), z.string().max(200)),
});

export const ListSettingsQuerySchema = z.object({}).passthrough();

export function isSettingKey(k: string): k is SettingKey {
  return (SETTING_KEYS as readonly string[]).includes(k);
}

export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;
