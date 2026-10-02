import { prisma } from '../lib/prisma.js';
import { ApiError } from '../errors/ApiError.js';
import { SETTING_KEYS, isSettingKey, type SettingKey } from '../validators/settings.js';

export async function listSettings(): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany();
  const out: Record<string, string> = {};
  for (const k of SETTING_KEYS) out[k] = '';
  for (const r of rows) {
    if (isSettingKey(r.key)) out[r.key] = r.value;
  }
  return out;
}

export async function getSetting(key: SettingKey): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row ? row.value : null;
}

export async function updateSettings(input: {
  actor: { id: string; role: 'OWNER' | 'MANAGER' | 'AUDITOR' | 'WAITER' };
  settings: Record<string, string>;
}): Promise<Record<string, string>> {
  if (input.actor.role !== 'OWNER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER can change settings.');
  }

  const keys = Object.keys(input.settings);
  for (const k of keys) {
    if (!isSettingKey(k)) {
      throw new ApiError(400, 'INVALID_SETTING_KEY', 'Unknown setting key: ' + k);
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const [k, value] of Object.entries(input.settings)) {
      await tx.setting.upsert({
        where: { key: k },
        create: { key: k, value },
        update: { value },
      });
    }
  });

  return listSettings();
}

// Internal writer — used by services (backup, scheduler) to record state
// without going through the OWNER-only updateSettings guard. Key is still
// whitelisted; unknown keys throw.
export async function setSettingInternal(key: SettingKey, value: string): Promise<void> {
  if (!isSettingKey(key)) {
    throw new ApiError(400, 'INVALID_SETTING_KEY', 'Unknown setting key: ' + key);
  }
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}
