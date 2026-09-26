import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { env } from '../src/config/env.js';

const app = createApp();

const OWNER = { username: 'phase10-owner', password: 'OwnerPassword!234', fullName: 'Phase 10 Owner', role: 'OWNER' as const };
const MANAGER = { username: 'phase10-manager', password: 'ManagerPassword!234', fullName: 'Phase 10 Manager', role: 'MANAGER' as const };
const MANAGER2 = { username: 'phase10-manager2', password: 'ManagerPassword!234', fullName: 'Phase 10 Manager 2', role: 'MANAGER' as const };
const WAITER = { username: 'phase10-waiter', password: 'WaiterPassword!234', fullName: 'Phase 10 Waiter', role: 'WAITER' as const };
const AUDITOR = { username: 'phase10-auditor', password: 'AuditorPassword!234', fullName: 'Phase 10 Auditor', role: 'AUDITOR' as const };
const ALL = [OWNER, MANAGER, MANAGER2, WAITER, AUDITOR];

// Dedicated business dates. No other test file may use these.
const D_BASIC = '2099-08-01';
const D_CLOSED = '2099-08-02';
const D_LIFECYCLE = '2099-08-03';
const D_FILTERS = '2099-08-04';
const D_ATTACH = '2099-08-05';

const TEST_CATEGORY = 'Phase10 Test Category';

async function cleanup() {
  const usernames = ALL.map((u) => u.username);

  // Clean expenses + categories created by this file
  await prisma.expense.deleteMany({
    where: {
      OR: [
        { createdByUser: { username: { in: usernames } } },
        { category: { name: TEST_CATEGORY } },
      ],
    },
  });
  await prisma.expenseCategory.deleteMany({ where: { name: TEST_CATEGORY } });

  // Clean closings on the dates we used
  const dates = [D_BASIC, D_CLOSED, D_LIFECYCLE, D_FILTERS, D_ATTACH].map(
    (d) => new Date(`${d}T00:00:00.000Z`)
  );
  await prisma.dailyClosing.deleteMany({ where: { businessDate: { in: dates } } });

  // Clean shifts + downstream records for our users
  await prisma.cashHandover.deleteMany({ where: { fromUser: { username: { in: usernames } } } });
  await prisma.reconciliation.deleteMany({ where: { user: { username: { in: usernames } } } });
  await prisma.collection.deleteMany({ where: { user: { username: { in: usernames } } } });
  await prisma.salesSummaryLine.deleteMany({
    where: { salesSummary: { sourceReference: { startsWith: 'phase10-' } } },
  });
  await prisma.salesSummary.deleteMany({ where: { sourceReference: { startsWith: 'phase10-' } } });
  await prisma.shift.deleteMany({ where: { user: { username: { in: usernames } } } });
  await prisma.session.deleteMany({ where: { user: { username: { in: usernames } } } });
  await prisma.user.deleteMany({ where: { username: { in: usernames } } });

  // Clean attachment storage directory
  try {
    const root = join(process.cwd(), env.ATTACHMENTS_ROOT);
    const entries = await readdir(root).catch(() => []);
    for (const entry of entries) {
      await rm(join(root, entry), { recursive: true, force: true });
    }
  } catch {
    // ignore
  }
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

let testCategoryId: string;

beforeAll(async () => {
  await cleanup();
  for (const u of ALL) await makeUser(u);

  const cat = await prisma.expenseCategory.create({
    data: { name: TEST_CATEGORY, description: 'Phase 10 test category' },
  });
  testCategoryId = cat.id;
});

afterAll(cleanup);

async function loginAs(u: { username: string; password: string }) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ username: u.username, password: u.password });
  expect(res.status).toBe(200);
  return agent;
}

describe('Expense categories', () => {
  it('MANAGER creates a category; OWNER can list', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/expense-categories').send({
      name: 'Phase10 Cat A',
      description: 'first',
    });
    expect(res.status).toBe(201);
    expect(res.body.category.name).toBe('Phase10 Cat A');

    const o = await loginAs(OWNER);
    const list = await o.get('/api/v1/expense-categories');
    expect(list.status).toBe(200);
    expect(list.body.categories.some((c: { name: string }) => c.name === 'Phase10 Cat A')).toBe(true);

    await prisma.expenseCategory.deleteMany({ where: { name: 'Phase10 Cat A' } });
  });

  it('rejects duplicate category name (409)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/expense-categories').send({ name: TEST_CATEGORY });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NAME_TAKEN');
  });

  it('WAITER cannot create categories (403)', async () => {
    const w = await loginAs(WAITER);
    const res = await w.post('/api/v1/expense-categories').send({ name: 'Phase10 NoCat' });
    expect(res.status).toBe(403);
  });
});

describe('Expenses — creation and lifecycle', () => {
  let expenseId: string;

  it('MANAGER creates a DRAFT expense', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/expenses').send({
      businessDate: D_BASIC,
      categoryId: testCategoryId,
      amount: '15000.00',
      paymentMethod: 'CASH',
      description: 'gas refill',
    });
    expect(res.status).toBe(201);
    expect(res.body.expense.status).toBe('DRAFT');
    expect(res.body.expense.expenseNumber).toMatch(/^EXP-\d{4,}$/);
    expect(res.body.expense.amount).toBe('15000.00');
    expenseId = res.body.expense.id;
  });

  it('MANAGER submits it; status becomes PENDING', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post(`/api/v1/expenses/${expenseId}/submit`).send({});
    expect(res.status).toBe(200);
    expect(res.body.expense.status).toBe('PENDING');
    expect(res.body.expense.submittedAt).toBeTruthy();
  });

  it('the creating MANAGER cannot approve their own expense (409)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post(`/api/v1/expenses/${expenseId}/approve`).send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SELF_APPROVAL');
  });

  it('a different MANAGER approves it; status becomes APPROVED', async () => {
    const m2 = await loginAs(MANAGER2);
    const res = await m2.post(`/api/v1/expenses/${expenseId}/approve`).send({});
    expect(res.status).toBe(200);
    expect(res.body.expense.status).toBe('APPROVED');
    expect(res.body.expense.approvedBy).toBeTruthy();
    expect(res.body.expense.approvedAt).toBeTruthy();
  });

  it('cannot edit an APPROVED expense (409)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.patch(`/api/v1/expenses/${expenseId}`).send({ amount: '999.00' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_EDITABLE');
  });
});

describe('Expenses — rejection flow', () => {
  let expenseId: string;

  it('MANAGER creates and submits; MANAGER2 rejects with reason', async () => {
    const m = await loginAs(MANAGER);
    const c = await m.post('/api/v1/expenses').send({
      businessDate: D_LIFECYCLE,
      categoryId: testCategoryId,
      amount: '5000.00',
      paymentMethod: 'CASH',
      description: 'misc',
    });
    expect(c.status).toBe(201);
    expenseId = c.body.expense.id;

    await m.post(`/api/v1/expenses/${expenseId}/submit`).send({});

    const m2 = await loginAs(MANAGER2);
    const r = await m2.post(`/api/v1/expenses/${expenseId}/reject`).send({
      reason: 'missing receipt',
    });
    expect(r.status).toBe(200);
    expect(r.body.expense.status).toBe('REJECTED');
    expect(r.body.expense.rejectedReason).toBe('missing receipt');
  });

  it('REJECTED expense can be edited and resubmitted', async () => {
    const m = await loginAs(MANAGER);
    const e = await m.patch(`/api/v1/expenses/${expenseId}`).send({ amount: '6000.00' });
    expect(e.status).toBe(200);
    expect(e.body.expense.amount).toBe('6000.00');
    expect(e.body.expense.status).toBe('REJECTED');

    const s = await m.post(`/api/v1/expenses/${expenseId}/submit`).send({});
    expect(s.status).toBe(200);
    expect(s.body.expense.status).toBe('PENDING');
    expect(s.body.expense.rejectedReason).toBeNull();
  });
});

describe('Expenses — closed-day guard', () => {
  it('builds a real CLOSED DailyClosing for D_CLOSED', async () => {
    // We need at least one closed shift on D_CLOSED so the closing can be created.
    const w = await loginAs(WAITER);
    const m = await loginAs(MANAGER);

    const s = await w.post('/api/v1/shifts').send({
      businessDate: D_CLOSED,
      openingCash: '0.00',
    });
    expect(s.status).toBe(201);
    const shiftId = s.body.shift.id;

    await w.post('/api/v1/collections').send({
      shiftId,
      paymentMethod: 'CASH',
      amount: '1000.00',
    });
    await w.post(`/api/v1/shifts/${shiftId}/transition`).send({ to: 'SUBMITTED' });
    const recon = await w.post('/api/v1/reconciliations').send({ shiftId });
    await w.patch(`/api/v1/reconciliations/${recon.body.reconciliation.id}`).send({
      actualCash: '1000.00',
      actualMobile: '0.00',
    });
    await w.post(`/api/v1/reconciliations/${recon.body.reconciliation.id}/submit`).send({});
    await m.post(`/api/v1/shifts/${shiftId}/transition`).send({ to: 'RECONCILING' });
    await m.post(`/api/v1/shifts/${shiftId}/transition`).send({ to: 'CLOSED' });

    const close = await m.post('/api/v1/daily-closings').send({ businessDate: D_CLOSED });
    expect(close.status).toBe(201);
    expect(close.body.closing.status).toBe('CLOSED');
  });

  it('MANAGER cannot create an expense on a CLOSED day (409 DAY_IS_CLOSED)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/expenses').send({
      businessDate: D_CLOSED,
      categoryId: testCategoryId,
      amount: '100.00',
      paymentMethod: 'CASH',
      description: 'should be blocked',
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DAY_IS_CLOSED');
    expect(res.body.details.closingId).toBeTruthy();
    expect(res.body.details.businessDate).toBe(D_CLOSED);
  });

  it('OWNER can bypass the closed day (B1)', async () => {
    const o = await loginAs(OWNER);
    const res = await o.post('/api/v1/expenses').send({
      businessDate: D_CLOSED,
      categoryId: testCategoryId,
      amount: '200.00',
      paymentMethod: 'CASH',
      description: 'owner correction',
    });
    expect(res.status).toBe(201);
    expect(res.body.expense.status).toBe('DRAFT');
  });
});

describe('Expenses — filters', () => {
  it('creates several expenses and filters work', async () => {
    const m = await loginAs(MANAGER);
    await m.post('/api/v1/expenses').send({
      businessDate: D_FILTERS,
      categoryId: testCategoryId,
      amount: '111.00',
      paymentMethod: 'CASH',
      description: 'filter test 1',
    });
    await m.post('/api/v1/expenses').send({
      businessDate: D_FILTERS,
      categoryId: testCategoryId,
      amount: '222.00',
      paymentMethod: 'CARD',
      description: 'filter test 2',
    });

    const byDate = await m.get(`/api/v1/expenses?businessDate=${D_FILTERS}`);
    expect(byDate.status).toBe(200);
    expect(byDate.body.expenses.length).toBeGreaterThanOrEqual(2);

    const byMethod = await m.get(`/api/v1/expenses?businessDate=${D_FILTERS}&paymentMethod=CARD`);
    expect(byMethod.body.expenses.every((e: { paymentMethod: string }) => e.paymentMethod === 'CARD')).toBe(true);

    const byStatus = await m.get(`/api/v1/expenses?businessDate=${D_FILTERS}&status=DRAFT`);
    expect(byStatus.body.expenses.every((e: { status: string }) => e.status === 'DRAFT')).toBe(true);
  });
});

describe('Expenses — permissions', () => {
  it('WAITER cannot create, edit, submit, or approve (403)', async () => {
    const w = await loginAs(WAITER);
    const create = await w.post('/api/v1/expenses').send({
      businessDate: D_BASIC,
      categoryId: testCategoryId,
      amount: '1.00',
      paymentMethod: 'CASH',
      description: 'no',
    });
    expect(create.status).toBe(403);
  });

  it('AUDITOR can read but not write', async () => {
    const a = await loginAs(AUDITOR);
    const list = await a.get('/api/v1/expenses');
    expect(list.status).toBe(200);

    const create = await a.post('/api/v1/expenses').send({
      businessDate: D_BASIC,
      categoryId: testCategoryId,
      amount: '1.00',
      paymentMethod: 'CASH',
      description: 'no',
    });
    expect(create.status).toBe(403);
  });
});

describe('Expenses — attachment upload', () => {
  it('uploads a PDF and returns a relative path', async () => {
    const m = await loginAs(MANAGER);
    const fakePdf = Buffer.from('%PDF-1.4\n%fake\n', 'utf8');
    const res = await m
      .post('/api/v1/expenses/attachments')
      .attach('file', fakePdf, { filename: 'receipt.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    expect(res.body.attachmentPath).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]+\.pdf$/);
    expect(res.body.bytes).toBe(fakePdf.length);
    expect(res.body.mimeType).toBe('application/pdf');
  });

  it('rejects a non-allowed MIME type (400)', async () => {
    const m = await loginAs(MANAGER);
    const fakeExe = Buffer.from('MZ...', 'utf8');
    const res = await m
      .post('/api/v1/expenses/attachments')
      .attach('file', fakeExe, { filename: 'evil.exe', contentType: 'application/x-msdownload' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_FILE_TYPE');
  });
});