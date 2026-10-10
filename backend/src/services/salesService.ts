import { prisma } from '../lib/prisma.js';
import { ApiError } from '../errors/ApiError.js';
import { toDecimal, toMoneyString } from '../utils/money.js';
import { parseBusinessDate, toDateOnly } from '../utils/businessDate.js';
import { parseSalesCsv } from './posImporter.js';
import { assertDayNotClosed } from './closedDayGuard.js';
import type { PaymentMethod, Prisma, Role } from '@prisma/client';
import { ensureOpenShiftForUserAndDate } from './shiftService.js';

const MOBILE_METHODS: ReadonlySet<PaymentMethod> = new Set([
  'MPESA',
  'AIRTEL_MONEY',
  'TIGO_PESA',
  'HALOPESA',
]);

function classify(pm: PaymentMethod): 'cash' | 'mobile' | 'other' {
  if (pm === 'CASH') return 'cash';
  if (MOBILE_METHODS.has(pm)) return 'mobile';
  return 'other';
}

interface LineInput {
  paymentMethod: PaymentMethod;
  amount: Prisma.Decimal;
  notes?: string | null;
}

function summarize(lines: LineInput[]): {
  total: Prisma.Decimal;
  cash: Prisma.Decimal;
  mobile: Prisma.Decimal;
  other: Prisma.Decimal;
} {
  let cash = toDecimal('0');
  let mobile = toDecimal('0');
  let other = toDecimal('0');
  for (const l of lines) {
    const kind = classify(l.paymentMethod);
    if (kind === 'cash') cash = cash.plus(l.amount);
    else if (kind === 'mobile') mobile = mobile.plus(l.amount);
    else other = other.plus(l.amount);
  }
  const total = cash.plus(mobile).plus(other);
  return { total, cash, mobile, other };
}

function serializeSummary(s: {
  id: string;
  businessDate: Date;
  source: 'EXISTING_POS' | 'MANUAL' | 'IMPORT' | 'FUTURE_API';
  sourceReference: string;
  totalSales: Prisma.Decimal;
  cashSales: Prisma.Decimal;
  mobileSales: Prisma.Decimal;
  otherSales: Prisma.Decimal;
  userId: string | null;
  enteredBy: string | null;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  lines: Array<{
    id: string;
    paymentMethod: PaymentMethod;
    amount: Prisma.Decimal;
    notes: string | null;
  }>;
}) {
  return {
    id: s.id,
    businessDate: toDateOnly(s.businessDate),
    source: s.source,
    sourceReference: s.sourceReference,
    userId: s.userId,
    totalSales: toMoneyString(s.totalSales),
    cashSales: toMoneyString(s.cashSales),
    mobileSales: toMoneyString(s.mobileSales),
    otherSales: toMoneyString(s.otherSales),
    enteredBy: s.enteredBy,
    verifiedBy: s.verifiedBy,
    verifiedAt: s.verifiedAt ? s.verifiedAt.toISOString() : null,
    notes: s.notes,
    lines: s.lines.map((l) => ({
      id: l.id,
      paymentMethod: l.paymentMethod,
      amount: toMoneyString(l.amount),
      notes: l.notes,
    })),
    createdAt: s.createdAt.toISOString(),
  };
}

const INCLUDE_LINES = { lines: true } as const;

export async function listSummaries(opts: {
  businessDate?: string;
  source?: 'EXISTING_POS' | 'MANUAL' | 'IMPORT' | 'FUTURE_API';
}) {
  const where: Prisma.SalesSummaryWhereInput = {};
  if (opts.businessDate) where.businessDate = parseBusinessDate(opts.businessDate);
  if (opts.source) where.source = opts.source;

  const rows = await prisma.salesSummary.findMany({
    where,
    include: INCLUDE_LINES,
    orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  });
  return rows.map(serializeSummary);
}

export async function getSummaryById(id: string) {
  const row = await prisma.salesSummary.findUnique({
    where: { id },
    include: INCLUDE_LINES,
  });
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Sales summary not found.');
  return serializeSummary(row);
}

async function ensureActiveShift(businessDate: Date, userId: string | null) {
  if (!userId) return; // system/imported sales without an owner — no shift
  await ensureOpenShiftForUserAndDate(userId, businessDate);
}

async function upsertSummary(opts: {
  businessDate: Date;
  source: 'EXISTING_POS' | 'MANUAL' | 'IMPORT' | 'FUTURE_API';
  sourceReference: string;
  userId: string | null;
  enteredBy: string;
  notes: string | null;
  lines: LineInput[];
}): Promise<{ summary: ReturnType<typeof serializeSummary>; updated: boolean }> {
  await ensureActiveShift(opts.businessDate, opts.userId);

  const totals = summarize(opts.lines);

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.salesSummary.findFirst({
      where: {
        source: opts.source,
        businessDate: opts.businessDate,
        sourceReference: opts.sourceReference,
        userId: opts.userId,
      },
      include: INCLUDE_LINES,
    });

    if (existing) {
      await tx.salesSummaryLine.deleteMany({
        where: { salesSummaryId: existing.id },
      });
      const updated = await tx.salesSummary.update({
        where: { id: existing.id },
        data: {
          totalSales: totals.total,
          cashSales: totals.cash,
          mobileSales: totals.mobile,
          otherSales: totals.other,
          enteredBy: opts.enteredBy,
          notes: opts.notes,
          lines: {
            create: opts.lines.map((l) => ({
              paymentMethod: l.paymentMethod,
              amount: l.amount,
              notes: l.notes ?? null,
            })),
          },
        },
        include: INCLUDE_LINES,
      });
      return { summary: serializeSummary(updated), updated: true };
    }

    const created = await tx.salesSummary.create({
      data: {
        businessDate: opts.businessDate,
        source: opts.source,
        sourceReference: opts.sourceReference,
        userId: opts.userId,
        enteredBy: opts.enteredBy,
        notes: opts.notes,
        totalSales: totals.total,
        cashSales: totals.cash,
        mobileSales: totals.mobile,
        otherSales: totals.other,
        lines: {
          create: opts.lines.map((l) => ({
            paymentMethod: l.paymentMethod,
            amount: l.amount,
            notes: l.notes ?? null,
          })),
        },
      },
      include: INCLUDE_LINES,
    });
    return { summary: serializeSummary(created), updated: false };
  });

  return result;
}

export async function createManualSummary(input: {
  businessDate: string;
  sourceReference: string;
  userId: string | null;
  notes: string | null;
  lines: Array<{ paymentMethod: PaymentMethod; amount: string; notes?: string | null }>;
  enteredBy: string;
  actorRole: Role;
}) {
  const businessDate = parseBusinessDate(input.businessDate);
  await assertDayNotClosed(businessDate, input.actorRole);
  const { summary } = await upsertSummary({
    businessDate,
    source: 'MANUAL',
    sourceReference: input.sourceReference,
    userId: input.userId,
    enteredBy: input.enteredBy,
    notes: input.notes,
    lines: input.lines.map((l) => ({
      paymentMethod: l.paymentMethod,
      amount: toDecimal(l.amount),
      notes: l.notes ?? null,
    })),
  });
  return summary;
}

export async function importFromCsv(input: { csv: string; enteredBy: string }) {
  const parsed = parseSalesCsv(input.csv);

  let imported = 0;
  let updated = 0;
  const summaries: ReturnType<typeof serializeSummary>[] = [];

  for (const p of parsed) {
    const businessDate = parseBusinessDate(p.businessDate);
    const result = await upsertSummary({
      businessDate,
      source: 'EXISTING_POS',
      sourceReference: p.sourceReference,
      userId: null,
      enteredBy: input.enteredBy,
      notes: p.notes,
      lines: p.lines.map((l) => ({
        paymentMethod: l.paymentMethod,
        amount: l.amount,
        notes: l.notes ?? null,
      })),
    });
    if (result.updated) updated += 1;
    else imported += 1;
    summaries.push(result.summary);
  }

  return { imported, updated, summaries };
}