import { prisma } from '../lib/prisma.js';
import { ApiError } from '../errors/ApiError.js';
import { toDecimal, toMoneyString } from '../utils/money.js';
import { parseBusinessDate, toDateOnly } from '../utils/businessDate.js';
import { assertDayNotClosed } from './closedDayGuard.js';
import type { PaymentMethod, Prisma, Role, SalaryStatus } from '@prisma/client';

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === 'P2002'
  );
}

function isSerializationFailure(err: unknown): boolean {
  // Prisma exposes P2034 for transaction serialization/write conflict.
  // Different Prisma versions have used P2034 and P2002 for related cases;
  // we key off the documented code.
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === 'P2034'
  );
}

function serializeRecord(r: {
  id: string;
  salaryNumber: string;
  employeeId: string;
  periodStart: Date;
  periodEnd: Date;
  label: string;
  baseSalary: Prisma.Decimal;
  adjustments: Prisma.Decimal;
  deductions: Prisma.Decimal;
  netSalary: Prisma.Decimal;
  status: SalaryStatus;
  notes: string | null;
  createdBy: string;
  approvedBy: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: r.id,
    salaryNumber: r.salaryNumber,
    employeeId: r.employeeId,
    periodStart: toDateOnly(r.periodStart),
    periodEnd: toDateOnly(r.periodEnd),
    label: r.label,
    baseSalary: toMoneyString(r.baseSalary),
    adjustments: toMoneyString(r.adjustments),
    deductions: toMoneyString(r.deductions),
    netSalary: toMoneyString(r.netSalary),
    status: r.status,
    notes: r.notes,
    createdBy: r.createdBy,
    approvedBy: r.approvedBy,
    approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function serializePayment(p: {
  id: string;
  salaryRecordId: string;
  amount: Prisma.Decimal;
  paymentMethod: PaymentMethod;
  businessDate: Date;
  paidAt: Date;
  reference: string | null;
  notes: string | null;
  recordedBy: string;
  voidedAt: Date | null;
  voidedBy: string | null;
  voidReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: p.id,
    salaryRecordId: p.salaryRecordId,
    amount: toMoneyString(p.amount),
    paymentMethod: p.paymentMethod,
    businessDate: toDateOnly(p.businessDate),
    paidAt: p.paidAt.toISOString(),
    reference: p.reference,
    notes: p.notes,
    recordedBy: p.recordedBy,
    voidedAt: p.voidedAt ? p.voidedAt.toISOString() : null,
    voidedBy: p.voidedBy,
    voidReason: p.voidReason,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

async function nextSalaryNumber(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.$queryRawUnsafe<Array<{ nextval: bigint }>>(
    "SELECT nextval('salary_number_seq') AS nextval"
  );
  const n = rows[0]?.nextval ?? 1n;
  return `SAL-${n.toString().padStart(4, '0')}`;
}

function computeNetSalary(
  baseSalary: Prisma.Decimal,
  adjustments: Prisma.Decimal,
  deductions: Prisma.Decimal
): Prisma.Decimal {
  return baseSalary.plus(adjustments).minus(deductions);
}

async function sumActivePaid(
  tx: Prisma.TransactionClient,
  salaryRecordId: string
): Promise<Prisma.Decimal> {
  const rows = await tx.salaryPayment.findMany({
    where: { salaryRecordId, voidedAt: null },
    select: { amount: true },
  });
  return rows.reduce((acc, r) => acc.plus(r.amount), toDecimal('0'));
}

function statusFromPaid(total: Prisma.Decimal, net: Prisma.Decimal, current: SalaryStatus): SalaryStatus {
  // DRAFT stays DRAFT even if there happen to be no payments; APPROVED stays
  // APPROVED until fully paid; PAID may fall back to APPROVED if a payment is
  // voided.
  if (current === 'DRAFT') return 'DRAFT';
  if (total.greaterThanOrEqualTo(net)) return 'PAID';
  return 'APPROVED';
}

export async function listSalaries(opts: {
  employeeId?: string;
  from?: string;
  to?: string;
  status?: SalaryStatus;
  unpaidOnly: boolean;
}) {
  const where: Prisma.SalaryRecordWhereInput = {};
  if (opts.employeeId) where.employeeId = opts.employeeId;

  if (opts.from || opts.to) {
    // Period-overlap query: match records whose period intersects [from, to]
    const fromDate = opts.from ? parseBusinessDate(opts.from) : undefined;
    const toDate = opts.to ? parseBusinessDate(opts.to) : undefined;
    where.AND = [
      ...(fromDate ? [{ periodEnd: { gte: fromDate } }] : []),
      ...(toDate ? [{ periodStart: { lte: toDate } }] : []),
    ];
  }

  if (opts.status) {
    where.status = opts.status;
  } else if (opts.unpaidOnly) {
    where.status = { in: ['DRAFT', 'APPROVED'] };
  }

  const rows = await prisma.salaryRecord.findMany({
    where,
    orderBy: [{ periodEnd: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  });
  return rows.map(serializeRecord);
}

export async function getSalaryById(id: string) {
  const row = await prisma.salaryRecord.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Salary record not found.');
  return serializeRecord(row);
}

export async function createSalaryRecord(input: {
  actor: { id: string; role: Role };
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  label: string;
  baseSalary: string;
  adjustments?: string;
  deductions?: string;
  notes?: string | null;
}) {
  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can create salaries.');
  }

  const periodStart = parseBusinessDate(input.periodStart);
  const periodEnd = parseBusinessDate(input.periodEnd);
  if (periodStart.getTime() > periodEnd.getTime()) {
    throw new ApiError(400, 'INVALID_PERIOD', 'periodStart must be <= periodEnd.');
  }

  const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
  if (!employee) throw new ApiError(400, 'INVALID_EMPLOYEE', 'Employee does not exist.');

  const baseSalary = toDecimal(input.baseSalary);
  const adjustments = input.adjustments !== undefined ? toDecimal(input.adjustments) : toDecimal('0');
  const deductions = input.deductions !== undefined ? toDecimal(input.deductions) : toDecimal('0');
  const netSalary = computeNetSalary(baseSalary, adjustments, deductions);
  if (netSalary.lessThanOrEqualTo(0)) {
    throw new ApiError(400, 'NON_POSITIVE_NET', 'netSalary must be greater than zero.');
  }

  try {
    const row = await prisma.$transaction(
      async (tx) => {
        // Serializable overlap check
        const overlap = await tx.salaryRecord.findFirst({
          where: {
            employeeId: input.employeeId,
            AND: [
              { periodStart: { lte: periodEnd } },
              { periodEnd: { gte: periodStart } },
            ],
          },
          select: { id: true, periodStart: true, periodEnd: true },
        });
        if (overlap) {
          throw new ApiError(
            409,
            'PERIOD_OVERLAP',
            'An existing salary record overlaps this period for the same employee.',
            {
              existingId: overlap.id,
              existingStart: overlap.periodStart.toISOString().slice(0, 10),
              existingEnd: overlap.periodEnd.toISOString().slice(0, 10),
            }
          );
        }

        const salaryNumber = await nextSalaryNumber(tx);
        return tx.salaryRecord.create({
          data: {
            salaryNumber,
            employeeId: input.employeeId,
            periodStart,
            periodEnd,
            label: input.label,
            baseSalary,
            adjustments,
            deductions,
            netSalary,
            createdBy: input.actor.id,
            notes: input.notes ?? null,
          },
        });
      },
      { isolationLevel: 'Serializable' }
    );
    return serializeRecord(row);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (isSerializationFailure(err)) {
      throw new ApiError(
        409,
        'PERIOD_OVERLAP',
        'A concurrent salary record overlaps this period; retry the request.'
      );
    }
    if (isUniqueViolation(err)) {
      throw new ApiError(409, 'DUPLICATE', 'Duplicate salary record.');
    }
    throw err;
  }
}

export async function updateSalaryRecord(input: {
  id: string;
  actor: { id: string; role: Role };
  periodStart?: string;
  periodEnd?: string;
  label?: string;
  baseSalary?: string;
  adjustments?: string;
  deductions?: string;
  notes?: string | null;
}) {
  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can edit salaries.');
  }

  const existing = await prisma.salaryRecord.findUnique({ where: { id: input.id } });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Salary record not found.');
  if (existing.status !== 'DRAFT') {
    throw new ApiError(
      409,
      'NOT_EDITABLE',
      `Only DRAFT salary records can be edited (currently ${existing.status}).`
    );
  }

  const periodStart = input.periodStart ? parseBusinessDate(input.periodStart) : existing.periodStart;
  const periodEnd = input.periodEnd ? parseBusinessDate(input.periodEnd) : existing.periodEnd;
  if (periodStart.getTime() > periodEnd.getTime()) {
    throw new ApiError(400, 'INVALID_PERIOD', 'periodStart must be <= periodEnd.');
  }

  const baseSalary =
    input.baseSalary !== undefined ? toDecimal(input.baseSalary) : existing.baseSalary;
  const adjustments =
    input.adjustments !== undefined ? toDecimal(input.adjustments) : existing.adjustments;
  const deductions =
    input.deductions !== undefined ? toDecimal(input.deductions) : existing.deductions;
  const netSalary = computeNetSalary(baseSalary, adjustments, deductions);
  if (netSalary.lessThanOrEqualTo(0)) {
    throw new ApiError(400, 'NON_POSITIVE_NET', 'netSalary must be greater than zero.');
  }

  try {
    const row = await prisma.$transaction(
      async (tx) => {
        // overlap check excluding self
        const overlap = await tx.salaryRecord.findFirst({
          where: {
            employeeId: existing.employeeId,
            id: { not: existing.id },
            AND: [
              { periodStart: { lte: periodEnd } },
              { periodEnd: { gte: periodStart } },
            ],
          },
          select: { id: true },
        });
        if (overlap) {
          throw new ApiError(
            409,
            'PERIOD_OVERLAP',
            'An existing salary record overlaps this period for the same employee.',
            { existingId: overlap.id }
          );
        }

        return tx.salaryRecord.update({
          where: { id: input.id },
          data: {
            ...(input.periodStart !== undefined ? { periodStart } : {}),
            ...(input.periodEnd !== undefined ? { periodEnd } : {}),
            ...(input.label !== undefined ? { label: input.label } : {}),
            ...(input.baseSalary !== undefined ? { baseSalary } : {}),
            ...(input.adjustments !== undefined ? { adjustments } : {}),
            ...(input.deductions !== undefined ? { deductions } : {}),
            netSalary,
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
          },
        });
      },
      { isolationLevel: 'Serializable' }
    );
    return serializeRecord(row);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (isSerializationFailure(err)) {
      throw new ApiError(
        409,
        'PERIOD_OVERLAP',
        'A concurrent update overlaps another salary record; retry the request.'
      );
    }
    throw err;
  }
}

export async function approveSalaryRecord(input: {
  id: string;
  actor: { id: string; role: Role };
}) {
  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can approve salaries.');
  }

  const existing = await prisma.salaryRecord.findUnique({ where: { id: input.id } });
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Salary record not found.');
  if (existing.status !== 'DRAFT') {
    throw new ApiError(
      409,
      'INVALID_TRANSITION',
      `Only DRAFT salary records can be approved (currently ${existing.status}).`
    );
  }
  if (existing.createdBy === input.actor.id) {
    throw new ApiError(409, 'SELF_APPROVAL', 'You cannot approve your own salary record.');
  }

  const row = await prisma.salaryRecord.update({
    where: { id: input.id },
    data: {
      status: 'APPROVED',
      approvedBy: input.actor.id,
      approvedAt: new Date(),
    },
  });
  return serializeRecord(row);
}

export async function listSalaryPayments(opts: {
  salaryRecordId?: string;
  employeeId?: string;
  businessDate?: string;
  from?: string;
  to?: string;
  paymentMethod?: PaymentMethod;
  includeVoided: boolean;
}) {
  const where: Prisma.SalaryPaymentWhereInput = {};
  if (opts.salaryRecordId) where.salaryRecordId = opts.salaryRecordId;
  if (opts.employeeId) where.salaryRecord = { employeeId: opts.employeeId };
  if (opts.paymentMethod) where.paymentMethod = opts.paymentMethod;
  if (!opts.includeVoided) where.voidedAt = null;

  if (opts.businessDate) {
    where.businessDate = parseBusinessDate(opts.businessDate);
  } else if (opts.from || opts.to) {
    const range: Prisma.DateTimeFilter = {};
    if (opts.from) range.gte = parseBusinessDate(opts.from);
    if (opts.to) range.lte = parseBusinessDate(opts.to);
    where.businessDate = range;
  }

  const rows = await prisma.salaryPayment.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    take: 200,
  });
  return rows.map(serializePayment);
}

export async function getSalaryPaymentById(id: string) {
  const row = await prisma.salaryPayment.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Salary payment not found.');
  return serializePayment(row);
}

export async function createSalaryPayment(input: {
  actor: { id: string; role: Role };
  salaryRecordId: string;
  amount: string;
  paymentMethod: PaymentMethod;
  businessDate: string;
  reference?: string | null;
  notes?: string | null;
}) {
  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can record salary payments.');
  }

  const businessDate = parseBusinessDate(input.businessDate);
  await assertDayNotClosed(businessDate, input.actor.role);

  const amount = toDecimal(input.amount);

  try {
    const { payment, record } = await prisma.$transaction(
      async (tx) => {
        const record = await tx.salaryRecord.findUnique({
          where: { id: input.salaryRecordId },
        });
        if (!record) throw new ApiError(404, 'SALARY_NOT_FOUND', 'Salary record not found.');
        if (record.status === 'DRAFT') {
          throw new ApiError(
            409,
            'NOT_APPROVED',
            'Salary record must be APPROVED before payments can be recorded.'
          );
        }

        const total = await sumActivePaid(tx, record.id);
        const newTotal = total.plus(amount);
        if (newTotal.greaterThan(record.netSalary)) {
          throw new ApiError(
            409,
            'OVERPAYMENT',
            'This payment would exceed the salary net amount.',
            {
              netSalary: toMoneyString(record.netSalary),
              alreadyPaid: toMoneyString(total),
              attempted: toMoneyString(amount),
            }
          );
        }

        const created = await tx.salaryPayment.create({
          data: {
            salaryRecordId: input.salaryRecordId,
            amount,
            paymentMethod: input.paymentMethod,
            businessDate,
            reference: input.reference ?? null,
            notes: input.notes ?? null,
            recordedBy: input.actor.id,
          },
        });

        const nextStatus = statusFromPaid(newTotal, record.netSalary, record.status);
        const updated =
          nextStatus === record.status
            ? record
            : await tx.salaryRecord.update({
                where: { id: record.id },
                data: { status: nextStatus },
              });

        return { payment: created, record: updated };
      },
      { isolationLevel: 'Serializable' }
    );

    return { payment: serializePayment(payment), record: serializeRecord(record) };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (isSerializationFailure(err)) {
      throw new ApiError(
        409,
        'CONCURRENT_WRITE',
        'Another payment write is in progress for this salary; retry the request.'
      );
    }
    throw err;
  }
}

export async function voidSalaryPayment(input: {
  id: string;
  actor: { id: string; role: Role };
  reason: string;
}) {
  if (input.actor.role !== 'OWNER' && input.actor.role !== 'MANAGER') {
    throw new ApiError(403, 'FORBIDDEN', 'Only OWNER or MANAGER can void salary payments.');
  }

  try {
    const { payment, record } = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.salaryPayment.findUnique({ where: { id: input.id } });
        if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Salary payment not found.');
        if (existing.voidedAt) {
          throw new ApiError(409, 'ALREADY_VOIDED', 'Payment is already voided.');
        }

        const parent = await tx.salaryRecord.findUnique({
          where: { id: existing.salaryRecordId },
        });
        if (!parent) throw new ApiError(404, 'SALARY_NOT_FOUND', 'Salary record not found.');

        await assertDayNotClosed(existing.businessDate, input.actor.role);

        const voided = await tx.salaryPayment.update({
          where: { id: input.id },
          data: {
            voidedAt: new Date(),
            voidedBy: input.actor.id,
            voidReason: input.reason,
          },
        });

        const newTotal = await sumActivePaid(tx, parent.id);
        const nextStatus = statusFromPaid(newTotal, parent.netSalary, parent.status);
        const updated =
          nextStatus === parent.status
            ? parent
            : await tx.salaryRecord.update({
                where: { id: parent.id },
                data: { status: nextStatus },
              });

        return { payment: voided, record: updated };
      },
      { isolationLevel: 'Serializable' }
    );

    return { payment: serializePayment(payment), record: serializeRecord(record) };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (isSerializationFailure(err)) {
      throw new ApiError(
        409,
        'CONCURRENT_WRITE',
        'Another write is in progress for this salary; retry the request.'
      );
    }
    throw err;
  }
}