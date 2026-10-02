import { promises as fs } from 'node:fs';
import path from 'node:path';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../errors/ApiError.js';
import { createBackup } from './backupService.js';
import { getSetting } from './settingsService.js';
import { env } from '../config/env.js';

// Forward FK-safe order (parents first). Mirrors EXPORT_ORDER in
// backupService.ts, minus Session. Restore inserts in this order; delete
// reverses it.
const FORWARD_ORDER = [
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
  'DailyClosing',
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

const SEQUENCES: Array<{ name: string; table: string; column: string }> = [
  { name: 'employee_number_seq', table: 'Employee', column: 'employeeNumber' },
  { name: 'material_number_seq', table: 'Material', column: 'materialNumber' },
  { name: 'salary_number_seq',   table: 'SalaryRecord', column: 'salaryNumber' },
  { name: 'supplier_number_seq', table: 'Supplier', column: 'supplierNumber' },
  { name: 'payment_number_seq',  table: 'SupplierPayment', column: 'paymentNumber' },
  { name: 'expense_number_seq',  table: 'Expense', column: 'expenseNumber' },
];

// 'PREFIX-0001' -> 1. Returns null when the value doesn't match, in which
// case the sequence is left alone.
function numericSuffix(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const m = v.match(/-(\d+)$/);
  if (!m || m[1] === undefined) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

async function resolveDestination(): Promise<string> {
  const chosen = (await getSetting('backup.destination')) || env.BACKUP_LOCAL_PATH;
  return path.isAbsolute(chosen) ? chosen : path.resolve(process.cwd(), chosen);
}

async function pathInDestinations(filename: string): Promise<string> {
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
    throw new ApiError(400, 'INVALID_FILENAME', 'Filename contains invalid characters.');
  }
  const dest = await resolveDestination();
  const full = path.resolve(dest, filename);
  const base = path.resolve(dest);
  if (!full.startsWith(base + path.sep)) {
    throw new ApiError(400, 'PATH_TRAVERSAL', 'Resolved path is outside the backup folder.');
  }
  return full;
}

export type RestoreResult = {
  restored: string;
  preRestoreBackup: string;
  rowCount: number;
  perTable: Record<string, number>;
  sequencesReset: string[];
};

export type ParsedBackup = {
  fullPath: string;
  payload: {
    meta: { version: string; generatedAt: string; tables: string[] };
    data: Record<string, unknown[]>;
  };
};

export async function readBackupFile(filename: string): Promise<ParsedBackup> {
  const full = await pathInDestinations(filename);
  let raw: string;
  try {
    raw = await fs.readFile(full, 'utf8');
  } catch {
    throw new ApiError(404, 'BACKUP_NOT_FOUND', 'Backup file not found: ' + filename);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new ApiError(400, 'BACKUP_INVALID', 'Backup file is not valid JSON.');
  }
  const p = payload as { meta?: { version?: unknown; generatedAt?: unknown; tables?: unknown }; data?: unknown };
  if (!p || typeof p !== 'object' || !p.meta || typeof p.meta !== 'object' || !p.data || typeof p.data !== 'object') {
    throw new ApiError(400, 'BACKUP_INVALID', 'Backup file is missing meta or data.');
  }
  if (p.meta.version !== '1') {
    throw new ApiError(400, 'BACKUP_VERSION_MISMATCH', 'Unsupported backup version: ' + String(p.meta.version));
  }
  return {
    fullPath: full,
    payload: {
      meta: {
        version: String(p.meta.version),
        generatedAt: String(p.meta.generatedAt ?? ''),
        tables: Array.isArray(p.meta.tables) ? (p.meta.tables as string[]) : [],
      },
      data: p.data as Record<string, unknown[]>,
    },
  };
}

function modelKey(table: string): string {
  return table.charAt(0).toLowerCase() + table.slice(1);
}

type DynClient = Record<string, {
  deleteMany: (a: unknown) => Promise<{ count: number }>;
  createMany: (a: { data: unknown[] }) => Promise<{ count: number }>;
}>;

export async function restoreFromBackup(
  filename: string,
  actorId: string,
  _reason: string
): Promise<RestoreResult> {
  const { payload } = await readBackupFile(filename);

  // Non-negotiable: pre-restore snapshot. A failed restore without this
  // is a data-loss event, not a rollback.
  const pre = await createBackup(actorId, { kind: 'manual' });

  const perTable: Record<string, number> = {};
  const sequencesReset: string[] = [];
  let rowCount = 0;

  await prisma.$transaction(async (tx) => {
    const clients = tx as unknown as DynClient;

    // 1. Delete in reverse FK order.
    for (let i = FORWARD_ORDER.length - 1; i >= 0; i--) {
      const table = FORWARD_ORDER[i];
      if (table === undefined) continue;
      const client = clients[modelKey(table)];
      if (!client || typeof client.deleteMany !== 'function') {
        throw new ApiError(500, 'RESTORE_DELETE_FAILED', 'Missing deleteMany for ' + table);
      }
      await client.deleteMany({});
    }

    // 2. Insert in forward FK order.
    for (const table of FORWARD_ORDER) {
      const rows = payload.data[table];
      if (!Array.isArray(rows) || rows.length === 0) {
        perTable[table] = 0;
        continue;
      }
      const client = clients[modelKey(table)];
      if (!client || typeof client.createMany !== 'function') {
        throw new ApiError(500, 'RESTORE_INSERT_FAILED', 'Missing createMany for ' + table);
      }
      await client.createMany({ data: rows });
      perTable[table] = rows.length;
      rowCount += rows.length;
    }
  }, { timeout: 60000 });

  // 3. Reset sequences. Best-effort: a missing sequence shouldn't fail the
  // whole restore, but log it.
  for (const s of SEQUENCES) {
    const rows = payload.data[s.table];
    if (!Array.isArray(rows)) continue;
    let maxVal = 0;
    for (const r of rows) {
      const n = numericSuffix((r as Record<string, unknown>)[s.column]);
      if (n !== null && n > maxVal) maxVal = n;
    }
    try {
      if (maxVal === 0) {
        await prisma.$executeRawUnsafe("SELECT setval('" + s.name + "', 1, false)");
      } else {
        await prisma.$executeRawUnsafe("SELECT setval('" + s.name + "', " + maxVal + ", true)");
      }
      sequencesReset.push(s.name);
    } catch (e) {
      console.error('[restore] sequence reset failed:', s.name, e);
    }
  }

  return {
    restored: filename,
    preRestoreBackup: pre.filename,
    rowCount,
    perTable,
    sequencesReset,
  };
}