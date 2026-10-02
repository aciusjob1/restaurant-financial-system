import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { env } from '../config/env.js';

export type BackupDestination = {
  path: string;
  label: string;
  kind: 'local' | 'cloud';
  exists: boolean;
};

function defaultLocalPath(): string {
  return path.isAbsolute(env.BACKUP_LOCAL_PATH)
    ? env.BACKUP_LOCAL_PATH
    : path.resolve(process.cwd(), env.BACKUP_LOCAL_PATH);
}

// Windows-only candidates. Every path either exists (and is reported)
// or is silently dropped. env vars are read at call time because the
// user may have multiple OneDrive mounts (personal + commercial).
async function candidates(): Promise<Array<{ path: string; label: string; kind: 'local' | 'cloud' }>> {
  const home = os.homedir();
  const list: Array<{ path: string; label: string; kind: 'local' | 'cloud' }> = [
    { path: defaultLocalPath(), label: 'Backend storage (default)', kind: 'local' },
  ];

  const oneDriveEnv = process.env.OneDrive || process.env.OneDriveConsumer;
  if (oneDriveEnv) list.push({ path: oneDriveEnv, label: 'OneDrive (personal)', kind: 'cloud' });

  const oneDriveBiz = process.env.OneDriveCommercial;
  if (oneDriveBiz) list.push({ path: oneDriveBiz, label: 'OneDrive (work)', kind: 'cloud' });

  list.push({ path: path.join(home, 'OneDrive'), label: 'OneDrive', kind: 'cloud' });
  list.push({ path: path.join(home, 'Google Drive'), label: 'Google Drive', kind: 'cloud' });
  list.push({ path: path.join(home, 'Dropbox'), label: 'Dropbox', kind: 'cloud' });

  return list;
}

async function exists(p: string): Promise<boolean> {
  try { const st = await fs.stat(p); return st.isDirectory(); }
  catch { return false; }
}

export async function scanDestinations(): Promise<BackupDestination[]> {
  const raw = await candidates();
  const out: BackupDestination[] = [];
  const seen = new Set<string>();
  for (const c of raw) {
    const key = path.resolve(c.path).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const ok = c.kind === 'local' ? true : await exists(c.path);
    if (!ok) continue;
    out.push({ path: c.path, label: c.label, kind: c.kind, exists: true });
  }
  return out;
}
