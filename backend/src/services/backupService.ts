import { promises as fs } from 'node:fs';
import path from 'node:path';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { ApiError } from '../errors/ApiError.js';
import { getSetting, setSettingInternal } from './settingsService.js';

export type BackupKind = 'manual' | 'auto';

const EXPORT_ORDER = [
  'User',
  'Position',
  'ExpenseCategory',
  'MaterialCategory',
  'Supplier',
  'Setting',
  'Employee',
  'Shift',
  'SalesSummary',
  'SalesSummaryLine',
  'Collection',
  'Reconciliation',
  'CashHandover',
  'Expense',
  'SalaryRecord',
  'SalaryPayment',
  'SalaryAdvance',
  'PurchaseInvoice',
  'PurchaseItem',
  'SupplierPayment',
  'PaymentAllocation',
  'Material',
  'StockMovement',
] as const;

type TableName = (typeof EXPORT_ORDER)[number];

export type BackupMeta = {
  version: string;
  generatedAt: string;
  generatedBy: string;
  tables: string[];
  rowCount: number;
};

export type BackupFile = {
  filename: string;
  path: string;
  sizeBytes: number;
  generatedAt: string | null;
  rowCount: number | null;
};

async function resolveBackupDir(override?: string | null): Promise<string> {
  let chosen = override;
  if (!chosen) {
    chosen = await getSetting('backup.destination');
  }
  if (!chosen) {
    chosen = env.BACKUP_LOCAL_PATH;
  }
  return path.isAbsolute(chosen)
    ? chosen
    : path.resolve(process.cwd(), chosen);
}

async function ensureBackupDir(override?: string | null): Promise<string> {
  const dir = await resolveBackupDir(override);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function backupFilename(now: Date, kind: BackupKind): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = now.getFullYear();
  const mo = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const h = pad(now.getHours());
  const mi = pad(now.getMinutes());
  const s = pad(now.getSeconds());
  const marker = kind === 'auto' ? '-auto' : '';
  return 'rfs-backup-' + y + '-' + mo + '-' + d + '-' + h + mi + s + marker + '.json';
}

export async function createBackup(
  actorId: string,
  opts: { destination?: string | null; kind?: BackupKind } = {}
): Promise<BackupFile> {
  const kind: BackupKind = opts.kind ?? 'manual';
  const dir = await ensureBackupDir(opts.destination ?? null);
  const now = new Date();
  let filename = backupFilename(now, kind);

  let target = path.join(dir, filename);
  let suffix = 1;
  while (true) {
    try { await fs.access(target); suffix += 1; filename = backupFilename(now, kind).replace('.json', '-' + suffix + '.json'); target = path.join(dir, filename); }
    catch { break; }
    if (suffix > 50) throw new ApiError(500, 'BACKUP_COLLISION', 'Could not find a free backup filename.');
  }

  const data: Record<string, unknown[]> = {};
  let rowCount = 0;

  for (const t of EXPORT_ORDER) {
    const key = t.charAt(0).toLowerCase() + t.slice(1);
    const client = (prisma as unknown as Record<string, { findMany: (a: unknown) => Promise<unknown[]> }>)[key];
    if (!client || typeof client.findMany !== 'function') {
      throw new ApiError(500, 'BACKUP_EXPORT_FAILED', 'Prisma client does not expose ' + t);
    }
    const rows = await client.findMany({});
    data[t] = rows;
    rowCount += rows.length;
  }

  const payload = {
    meta: {
      version: '1',
      generatedAt: now.toISOString(),
      generatedBy: actorId,
      tables: [...EXPORT_ORDER],
      rowCount,
    },
    data,
  };

  const json = JSON.stringify(payload, null, 2);
  await fs.writeFile(target, json, 'utf8');
  const stat = await fs.stat(target);

  if (kind === 'auto') {
    await setSettingInternal('backup.lastRunAt', now.toISOString());
    await setSettingInternal('backup.lastRunStatus', 'success');
    await setSettingInternal('backup.lastRunMessage', '');
    await enforceRetention(dir);
  }

  return {
    filename,
    path: target,
    sizeBytes: stat.size,
    generatedAt: now.toISOString(),
    rowCount,
  };
}

async function enforceRetention(dir: string): Promise<void> {
  const raw = await getSetting('backup.retention.count');
  const keep = raw ? parseInt(raw, 10) : 0;
  if (!keep || keep <= 0) return;

  const entries = await fs.readdir(dir);
  const auto = entries.filter((n) => n.startsWith('rfs-backup-') && n.includes('-auto') && n.endsWith('.json'));
  const withStat = await Promise.all(auto.map(async (n) => {
    const full = path.join(dir, n);
    const st = await fs.stat(full);
    return { full, mtime: st.mtimeMs };
  }));
  withStat.sort((a, b) => b.mtime - a.mtime);
  const toDelete = withStat.slice(keep);
  for (const d of toDelete) {
    try { await fs.unlink(d.full); } catch { /* ignore */ }
  }
}

export async function listBackups(override?: string | null): Promise<{ destination: string; backups: BackupFile[] }> {
  const dir = await ensureBackupDir(override ?? null);
  const entries = await fs.readdir(dir);
  const backups: BackupFile[] = [];

  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    if (!name.startsWith('rfs-backup-')) continue;
    const full = path.join(dir, name);
    const stat = await fs.stat(full);
    if (!stat.isFile()) continue;

    let generatedAt: string | null = null;
    let rowCount: number | null = null;
    try {
      const head = (await fs.readFile(full, 'utf8')).slice(0, 1024);
      const m = head.match(/"generatedAt"\s*:\s*"([^"]+)"/);
      if (m) generatedAt = m[1] ?? null;
      const rc = head.match(/"rowCount"\s*:\s*(\d+)/);
      if (rc && rc[1] !== undefined) rowCount = Number(rc[1]);
    } catch { /* ignore */ }

    backups.push({ filename: name, path: full, sizeBytes: stat.size, generatedAt, rowCount });
  }

  backups.sort((a, b) => {
    const ta = a.generatedAt ? Date.parse(a.generatedAt) : 0;
    const tb = b.generatedAt ? Date.parse(b.generatedAt) : 0;
    return tb - ta;
  });

  return { destination: dir, backups };
}
