import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

const app = createApp();

const OWNER = { username: 'phase11-owner', password: 'OwnerPassword!234', fullName: 'Phase 11 Owner', role: 'OWNER' as const };
const MANAGER = { username: 'phase11-manager', password: 'ManagerPassword!234', fullName: 'Phase 11 Manager', role: 'MANAGER' as const };
const MANAGER2 = { username: 'phase11-manager2', password: 'ManagerPassword!234', fullName: 'Phase 11 Manager 2', role: 'MANAGER' as const };
const WAITER = { username: 'phase11-waiter', password: 'WaiterPassword!234', fullName: 'Phase 11 Waiter', role: 'WAITER' as const };
const AUDITOR = { username: 'phase11-auditor', password: 'AuditorPassword!234', fullName: 'Phase 11 Auditor', role: 'AUDITOR' as const };
const ALL = [OWNER, MANAGER, MANAGER2, WAITER, AUDITOR];

// Dates are spread so that no describe block's salary range can overlap
// another describe block's date. Each constant is used by exactly one
// describe block.
const D_CREATE        = '2099-06-01'; // Salaries — creation (single day)
const D_ADJACENT      = '2099-06-02'; // Salaries — creation (single day, non-overlapping)
const D_CREATE_NEG    = '2099-06-15'; // Salaries — creation (negative-net test, no row created)
const D_APPROVAL      = '2099-07-01'; // Salaries — approval
const D_DRAFT_PAY_TRY = '2099-07-15'; // Salaries — approval (draft payment attempt)
const D_PAYMENTS      = '2099-08-01'; // Salaries — payments
const D_VOID          = '2099-09-01'; // Salaries — payment voiding
const D_CLOSED        = '2099-10-15'; // Salaries — closed-day guard

const TEST_POSITION_NAME = 'Phase11 Position';
const TEST_EMPLOYEE_NAME = 'Phase11 Employee';

async function cleanup() {
  const usernames = ALL.map((u) => u.username);

  await prisma.salaryPayment.deleteMany({
    where: { recordedByUser: { username: { in: usernames } } },
  });
  await prisma.salaryRecord.deleteMany({
    where: {
      OR: [
        { createdByUser: { username: { in: usernames } } },
        { employee: { fullName: TEST_EMPLOYEE_NAME } },
      ],
    },
  });

  const allDates = [
    D_CREATE, D_ADJACENT, D_CREATE_NEG, D_APPROVAL, D_DRAFT_PAY_TRY,
    D_PAYMENTS, D_VOID, D_CLOSED,
  ].map((d) => new Date(`${d}T00:00:00.000Z`));
  await prisma.dailyClosing.deleteMany({ where: { businessDate: { in: allDates } } });

  await prisma.expense.deleteMany({ where: { createdByUser: { username: { in: usernames } } } });

  await prisma.cashHandover.deleteMany({ where: { fromUser: { username: { in: usernames } } } });
  await prisma.reconciliation.deleteMany({ where: { user: { username: { in: usernames } } } });
  await prisma.collection.deleteMany({ where: { user: { username: { in: usernames } } } });
  await prisma.shift.deleteMany({ where: { user: { username: { in: usernames } } } });

  await prisma.session.deleteMany({ where: { user: { username: { in: usernames } } } });

  await prisma.employee.deleteMany({ where: { fullName: TEST_EMPLOYEE_NAME } });
  await prisma.position.deleteMany({ where: { name: TEST_POSITION_NAME } });
  await prisma.user.deleteMany({ where: { username: { in: usernames } } });
}

async function makeUser(u: { username: string; password: string; fullName: string; role: 'OWNER' | 'MANAGER' | 'WAITER' | 'AUDITOR' }) {
  return prisma.user.create({
    data: {
      username: u.username,
      fullName: u.fullName,
      role: u.role,
      passwordHash: await argon2.hash(u.password, { type: argon2.argon2id }),
      isActive: true,
    },
  });
}

let employeeId: string;

beforeAll(async () => {
  await cleanup();
  for (const u of ALL) await makeUser(u);

  const position = await prisma.position.create({
    data: { name: TEST_POSITION_NAME, defaultSalary: '500000.00' },
  });
  const employee = await prisma.employee.create({
    data: {
      employeeNumber: `EMP-TEST-${Date.now()}`,
      fullName: TEST_EMPLOYEE_NAME,
      positionId: position.id,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
    },
  });
  employeeId = employee.id;
});

afterAll(cleanup);

async function loginAs(u: { username: string; password: string }) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ username: u.username, password: u.password });
  expect(res.status).toBe(200);
  return agent;
}

async function makeSalary(agent: request.SuperAgentTest, overrides: Partial<{
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  label: string;
  baseSalary: string;
  adjustments: string;
  deductions: string;
}> = {}) {
  const body = {
    employeeId: overrides.employeeId ?? employeeId,
    periodStart: overrides.periodStart ?? D_CREATE,
    periodEnd: overrides.periodEnd ?? D_CREATE,
    label: overrides.label ?? 'Phase11 Test Period',
    baseSalary: overrides.baseSalary ?? '500000.00',
    adjustments: overrides.adjustments ?? '0.00',
    deductions: overrides.deductions ?? '0.00',
  };
  return agent.post('/api/v1/salaries').send(body);
}

describe('Salaries — creation', () => {
  it('MANAGER creates a salary record; netSalary is computed', async () => {
    const m = await loginAs(MANAGER);
    const res = await makeSalary(m, {
      periodStart: D_CREATE,
      periodEnd: D_CREATE,
      baseSalary: '500000.00',
      adjustments: '25000.00',
      deductions: '50000.00',
    });
    expect(res.status).toBe(201);
    expect(res.body.salary.salaryNumber).toMatch(/^SAL-\d{4,}$/);
    expect(res.body.salary.baseSalary).toBe('500000.00');
    expect(res.body.salary.adjustments).toBe('25000.00');
    expect(res.body.salary.deductions).toBe('50000.00');
    expect(res.body.salary.netSalary).toBe('475000.00');
    expect(res.body.salary.status).toBe('DRAFT');
  });

  it('rejects an overlapping period for the same employee (409 PERIOD_OVERLAP)', async () => {
    const m = await loginAs(MANAGER);
    const res = await makeSalary(m, {
      periodStart: D_CREATE,
      periodEnd: D_CREATE,
      label: 'Overlap attempt',
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PERIOD_OVERLAP');
  });

  it('allows a non-overlapping adjacent single-day period', async () => {
    const m = await loginAs(MANAGER);
    const res = await makeSalary(m, {
      periodStart: D_ADJACENT,
      periodEnd: D_ADJACENT,
      label: 'Adjacent single day',
    });
    expect(res.status).toBe(201);
  });

  it('rejects periodStart > periodEnd (400)', async () => {
    const m = await loginAs(MANAGER);
    const res = await makeSalary(m, {
      periodStart: D_CREATE_NEG,
      periodEnd: '2099-06-01',  // before periodStart
      label: 'Bad range',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PERIOD');
  });

  it('rejects a negative net (400)', async () => {
    const m = await loginAs(MANAGER);
    const res = await makeSalary(m, {
      periodStart: D_CREATE_NEG,
      periodEnd: D_CREATE_NEG,
      baseSalary: '1000.00',
      adjustments: '0.00',
      deductions: '5000.00',
      label: 'Net negative',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NON_POSITIVE_NET');
  });
});

describe('Salaries — approval', () => {
  let salaryId: string;

  it('creates a fresh record for this test', async () => {
    const m = await loginAs(MANAGER);
    const res = await makeSalary(m, {
      periodStart: D_APPROVAL,
      periodEnd: D_APPROVAL,
      label: 'Approval flow',
      baseSalary: '100000.00',
    });
    expect(res.status).toBe(201);
    salaryId = res.body.salary.id;
  });

  it('the creating MANAGER cannot approve (SELF_APPROVAL)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post(`/api/v1/salaries/${salaryId}/approve`).send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SELF_APPROVAL');
  });

  it('a different MANAGER approves it', async () => {
    const m2 = await loginAs(MANAGER2);
    const res = await m2.post(`/api/v1/salaries/${salaryId}/approve`).send({});
    expect(res.status).toBe(200);
    expect(res.body.salary.status).toBe('APPROVED');
    expect(res.body.salary.approvedBy).toBeTruthy();
  });

  it('APPROVED salary cannot be edited (409)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.patch(`/api/v1/salaries/${salaryId}`).send({ baseSalary: '200000.00' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_EDITABLE');
  });

  it('cannot record a payment on a DRAFT salary (409)', async () => {
    const m = await loginAs(MANAGER);
    const d = await makeSalary(m, {
      periodStart: D_DRAFT_PAY_TRY,
      periodEnd: D_DRAFT_PAY_TRY,
      label: 'Draft pay attempt',
      baseSalary: '50000.00',
    });
    expect(d.status).toBe(201);

    const res = await m.post('/api/v1/salary-payments').send({
      salaryRecordId: d.body.salary.id,
      amount: '1000.00',
      paymentMethod: 'CASH',
      businessDate: D_DRAFT_PAY_TRY,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_APPROVED');
  });
});

describe('Salaries — payments', () => {
  let salaryId: string;

  beforeAll(async () => {
    const m = await loginAs(MANAGER);
    const res = await makeSalary(m, {
      periodStart: D_PAYMENTS,
      periodEnd: D_PAYMENTS,
      label: 'Payments flow',
      baseSalary: '100000.00',
    });
    expect(res.status).toBe(201);
    salaryId = res.body.salary.id;

    const m2 = await loginAs(MANAGER2);
    const app = await m2.post(`/api/v1/salaries/${salaryId}/approve`).send({});
    expect(app.status).toBe(200);
  });

  it('first partial payment keeps status APPROVED', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/salary-payments').send({
      salaryRecordId: salaryId,
      amount: '40000.00',
      paymentMethod: 'CASH',
      businessDate: D_PAYMENTS,
    });
    expect(res.status).toBe(201);
    expect(res.body.payment.amount).toBe('40000.00');
    expect(res.body.salary.status).toBe('APPROVED');
  });

  it('overpayment is rejected (409 OVERPAYMENT)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/salary-payments').send({
      salaryRecordId: salaryId,
      amount: '70000.00',  // total would be 110k > 100k
      paymentMethod: 'CASH',
      businessDate: D_PAYMENTS,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('OVERPAYMENT');
  });

  it('final payment flips status to PAID', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/salary-payments').send({
      salaryRecordId: salaryId,
      amount: '60000.00',
      paymentMethod: 'BANK',
      businessDate: D_PAYMENTS,
    });
    expect(res.status).toBe(201);
    expect(res.body.salary.status).toBe('PAID');

    const after = await m.get(`/api/v1/salaries/${salaryId}`);
    expect(after.body.salary.status).toBe('PAID');
  });
});

describe('Salaries — payment voiding', () => {
  let salaryId: string;
  let paymentId: string;

  beforeAll(async () => {
    const m = await loginAs(MANAGER);
    const r = await makeSalary(m, {
      periodStart: D_VOID,
      periodEnd: D_VOID,
      label: 'Void flow',
      baseSalary: '20000.00',
    });
    expect(r.status).toBe(201);
    salaryId = r.body.salary.id;

    const m2 = await loginAs(MANAGER2);
    const app = await m2.post(`/api/v1/salaries/${salaryId}/approve`).send({});
    expect(app.status).toBe(200);

    const p = await m.post('/api/v1/salary-payments').send({
      salaryRecordId: salaryId,
      amount: '20000.00',
      paymentMethod: 'CASH',
      businessDate: D_VOID,
    });
    expect(p.status).toBe(201);
    expect(p.body.salary.status).toBe('PAID');
    paymentId = p.body.payment.id;
  });

  it('voiding the only payment flips status back to APPROVED', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post(`/api/v1/salary-payments/${paymentId}/void`).send({
      reason: 'recorded by mistake',
    });
    expect(res.status).toBe(200);
    expect(res.body.payment.voidedAt).toBeTruthy();
    expect(res.body.payment.voidReason).toBe('recorded by mistake');
    expect(res.body.salary.status).toBe('APPROVED');
  });

  it('void is idempotent-guarded (ALREADY_VOIDED)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post(`/api/v1/salary-payments/${paymentId}/void`).send({
      reason: 'again',
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_VOIDED');
  });

  it('list without includeVoided hides the voided payment', async () => {
    const m = await loginAs(MANAGER);
    const hidden = await m.get(`/api/v1/salary-payments?salaryRecordId=${salaryId}`);
    expect(hidden.body.payments).toHaveLength(0);

    const shown = await m.get(`/api/v1/salary-payments?salaryRecordId=${salaryId}&includeVoided=true`);
    expect(shown.body.payments).toHaveLength(1);
  });
});

describe('Salaries — closed-day guard on payments', () => {
  it('builds a CLOSED day and blocks MANAGER payment (409), allows OWNER (B1)', async () => {
    const w = await loginAs(WAITER);
    const m = await loginAs(MANAGER);

    // Build a real closed day on D_CLOSED
    const s = await w.post('/api/v1/shifts').send({ businessDate: D_CLOSED, openingCash: '0.00' });
    expect(s.status).toBe(201);
    const shiftId = s.body.shift.id;
    await w.post('/api/v1/collections').send({ shiftId, paymentMethod: 'CASH', amount: '100.00' });
    await w.post(`/api/v1/shifts/${shiftId}/transition`).send({ to: 'SUBMITTED' });
    const recon = await w.post('/api/v1/reconciliations').send({ shiftId });
    await w.patch(`/api/v1/reconciliations/${recon.body.reconciliation.id}`).send({
      actualCash: '100.00',
      actualMobile: '0.00',
    });
    await w.post(`/api/v1/reconciliations/${recon.body.reconciliation.id}/submit`).send({});
    await m.post(`/api/v1/shifts/${shiftId}/transition`).send({ to: 'RECONCILING' });
    await m.post(`/api/v1/shifts/${shiftId}/transition`).send({ to: 'CLOSED' });

    const close = await m.post('/api/v1/daily-closings').send({ businessDate: D_CLOSED });
    expect(close.status).toBe(201);

    // Salary record on the SAME day but no payment guard trip yet
    const salary = await makeSalary(m, {
      periodStart: D_CLOSED,
      periodEnd: D_CLOSED,
      label: 'Closed-day payment target',
      baseSalary: '1000.00',
    });
    expect(salary.status).toBe(201);

    const m2 = await loginAs(MANAGER2);
    await m2.post(`/api/v1/salaries/${salary.body.salary.id}/approve`).send({});

    // MANAGER payment attempt on the CLOSED day -> 409 DAY_IS_CLOSED
    const blocked = await m.post('/api/v1/salary-payments').send({
      salaryRecordId: salary.body.salary.id,
      amount: '500.00',
      paymentMethod: 'CASH',
      businessDate: D_CLOSED,
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('DAY_IS_CLOSED');
    expect(blocked.body.details.closingId).toBeTruthy();

    // OWNER bypasses the wall (B1)
    const o = await loginAs(OWNER);
    const allowed = await o.post('/api/v1/salary-payments').send({
      salaryRecordId: salary.body.salary.id,
      amount: '500.00',
      paymentMethod: 'CASH',
      businessDate: D_CLOSED,
    });
    expect(allowed.status).toBe(201);
  });
});

describe('Salaries — permissions', () => {
  it('WAITER cannot access salaries (403)', async () => {
    const w = await loginAs(WAITER);
    const list = await w.get('/api/v1/salaries');
    expect(list.status).toBe(403);
    const create = await w.post('/api/v1/salaries').send({
      employeeId,
      periodStart: '2100-01-01',
      periodEnd: '2100-01-31',
      label: 'x',
      baseSalary: '100.00',
    });
    expect(create.status).toBe(403);
  });

  it('AUDITOR can read but not write', async () => {
    const a = await loginAs(AUDITOR);
    const list = await a.get('/api/v1/salaries');
    expect(list.status).toBe(200);

    const create = await a.post('/api/v1/salaries').send({
      employeeId,
      periodStart: '2100-02-01',
      periodEnd: '2100-02-28',
      label: 'x',
      baseSalary: '100.00',
    });
    expect(create.status).toBe(403);

    const payList = await a.get('/api/v1/salary-payments');
    expect(payList.status).toBe(200);

    const payAttempt = await a.post('/api/v1/salary-payments').send({
      salaryRecordId: 'x',
      amount: '1.00',
      paymentMethod: 'CASH',
      businessDate: '2100-03-01',
    });
    expect(payAttempt.status).toBe(403);
  });
});

describe('Salaries — filters', () => {
  it('filters by employeeId, status, unpaidOnly, and period range', async () => {
    const m = await loginAs(MANAGER);

    const byEmployee = await m.get(`/api/v1/salaries?employeeId=${employeeId}`);
    expect(byEmployee.status).toBe(200);
    expect(byEmployee.body.salaries.every((s: { employeeId: string }) => s.employeeId === employeeId)).toBe(true);

    const approved = await m.get(`/api/v1/salaries?status=APPROVED&employeeId=${employeeId}`);
    expect(approved.body.salaries.every((s: { status: string }) => s.status === 'APPROVED')).toBe(true);

    const unpaid = await m.get(`/api/v1/salaries?unpaidOnly=true&employeeId=${employeeId}`);
    expect(unpaid.body.salaries.every((s: { status: string }) => s.status !== 'PAID')).toBe(true);

    const ranged = await m.get(`/api/v1/salaries?from=2099-06-01&to=2099-06-30&employeeId=${employeeId}`);
    expect(ranged.status).toBe(200);
  });
});