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
const WAITER2 = { username: 'phase10-waiter2', password: 'WaiterPassword!234', fullName: 'Phase 10 Waiter 2', role: 'WAITER' as const };
const AUDITOR = { username: 'phase10-auditor', password: 'AuditorPassword!234', fullName: 'Phase 10 Auditor', role: 'AUDITOR' as const };
const ALL = [OWNER, MANAGER, MANAGER2, WAITER, WAITER2, AUDITOR];

// Dedicated business dates. No other test file may use these.
const D_BASIC = '2099-08-01';
const D_CLOSED = '2099-08-02';
const D_LIFECYCLE = '2099-08-03';
const D_FILTERS = '2099-08-04';
const D_ATTACH = '2099-08-05';
const D_WAITER_CREATE = '2099-08-06';
const D_WAITER_SCOPE  = '2099-08-07';
const D_WAITER_EDIT   = '2099-08-08';
const D_AUTOAPPROVE   = '2099-08-09';
const D_SHIFT_NOW     = '2099-08-10';
const D_SHIFT_MISMATCH = '2099-08-11';

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
  const dates = [D_BASIC, D_CLOSED, D_LIFECYCLE, D_FILTERS, D_ATTACH, D_WAITER_CREATE, D_WAITER_SCOPE, D_WAITER_EDIT, D_AUTOAPPROVE, D_SHIFT_NOW, D_SHIFT_MISMATCH].map(
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
  it('WAITER cannot submit or approve (403)', async () => {
    const w = await loginAs(WAITER);
    const submit = await w.post('/api/v1/expenses/some-id/submit').send({});
    expect(submit.status).toBe(403);
    const approve = await w.post('/api/v1/expenses/some-id/approve').send({});
    expect(approve.status).toBe(403);
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

describe('Expenses - waiter workflow', () => {
  let waiterCreateExpenseId: string;
  let waiterScopeOwnId: string;
  let waiterScopePaidId: string;
  let waiterScopeUnrelatedId: string;
  let waiter2EditTargetId: string;
  let waiterApprovedId: string;

  it('waiter creates an expense; status is PENDING, submittedAt set', async () => {
    const w = await loginAs(WAITER);
    const me = await w.get('/api/v1/auth/me');
    const res = await w.post('/api/v1/expenses').send({
      businessDate: D_WAITER_CREATE,
      categoryId: testCategoryId,
      amount: '15.00',
      paymentMethod: 'CASH',
      description: 'waiter-created',
    });
    expect(res.status).toBe(201);
    expect(res.body.expense.status).toBe('PENDING');
    expect(res.body.expense.submittedAt).toBeTruthy();
    expect(res.body.expense.createdBy).toBe(me.body.user.id);
    waiterCreateExpenseId = res.body.expense.id;
  });

  it('waiter cannot set paidByUserId to another user (403)', async () => {
    const w = await loginAs(WAITER);
    const m = await loginAs(MANAGER);
    const mgr = await m.get('/api/v1/auth/me');
    const res = await w.post('/api/v1/expenses').send({
      businessDate: D_WAITER_CREATE,
      categoryId: testCategoryId,
      amount: '5.00',
      paymentMethod: 'CASH',
      description: 'bad attribution',
      paidByUserId: mgr.body.user.id,
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('waiter cannot attach another user shift (403)', async () => {
    const mgr = await prisma.user.findUnique({ where: { username: MANAGER.username } });
    const otherShift = await prisma.shift.create({
      data: {
        userId: mgr!.id,
        businessDate: new Date(D_WAITER_CREATE + 'T00:00:00.000Z'),
        status: 'OPEN',
        openingCash: '0.00',
      },
    });
    const w = await loginAs(WAITER);
    const res = await w.post('/api/v1/expenses').send({
      businessDate: D_WAITER_CREATE,
      categoryId: testCategoryId,
      amount: '5.00',
      paymentMethod: 'CASH',
      description: 'bad shift',
      shiftId: otherShift.id,
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('waiter can attach their own shift (201)', async () => {
    const w = await loginAs(WAITER);
    const me = await w.get('/api/v1/auth/me');
    const ownShift = await prisma.shift.create({
      data: {
        userId: me.body.user.id,
        businessDate: new Date(D_WAITER_CREATE + 'T00:00:00.000Z'),
        status: 'OPEN',
        openingCash: '0.00',
      },
    });
    const res = await w.post('/api/v1/expenses').send({
      businessDate: D_WAITER_CREATE,
      categoryId: testCategoryId,
      amount: '7.00',
      paymentMethod: 'CASH',
      description: 'own shift',
      shiftId: ownShift.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.expense.shiftId).toBe(ownShift.id);
  });

  it('waiter list = own-created union own-paid; excludes unrelated', async () => {
    const w = await loginAs(WAITER);
    const me = await w.get('/api/v1/auth/me');
    const m = await loginAs(MANAGER);

    const createdByWaiter = await w.post('/api/v1/expenses').send({
      businessDate: D_WAITER_SCOPE,
      categoryId: testCategoryId,
      amount: '11.00',
      paymentMethod: 'CASH',
      description: 'waiter scope own',
    });
    expect(createdByWaiter.status).toBe(201);
    waiterScopeOwnId = createdByWaiter.body.expense.id;

    const paidByWaiter = await m.post('/api/v1/expenses').send({
      businessDate: D_WAITER_SCOPE,
      categoryId: testCategoryId,
      amount: '12.00',
      paymentMethod: 'CASH',
      description: 'manager recorded for waiter',
      paidByUserId: me.body.user.id,
    });
    expect(paidByWaiter.status).toBe(201);
    waiterScopePaidId = paidByWaiter.body.expense.id;

    const unrelated = await m.post('/api/v1/expenses').send({
      businessDate: D_WAITER_SCOPE,
      categoryId: testCategoryId,
      amount: '13.00',
      paymentMethod: 'CASH',
      description: 'unrelated',
    });
    expect(unrelated.status).toBe(201);
    waiterScopeUnrelatedId = unrelated.body.expense.id;

    const list = await w.get('/api/v1/expenses?businessDate=' + D_WAITER_SCOPE);
    expect(list.status).toBe(200);
    const ids = list.body.expenses.map((e: { id: string }) => e.id);
    expect(ids).toContain(waiterScopeOwnId);
    expect(ids).toContain(waiterScopePaidId);
    expect(ids).not.toContain(waiterScopeUnrelatedId);
  });

  it('waiter can edit own PENDING expense (200)', async () => {
    const w = await loginAs(WAITER);
    const res = await w
      .patch('/api/v1/expenses/' + waiterScopeOwnId)
      .send({ amount: '99.00' });
    expect(res.status).toBe(200);
    expect(res.body.expense.amount).toBe('99.00');
  });

  it('waiter cannot edit another waiter expense (403)', async () => {
    const w2 = await prisma.user.findUnique({ where: { username: WAITER2.username } });
    const other = await prisma.expense.create({
      data: {
        expenseNumber: 'phase10-w2-' + Date.now(),
        businessDate: new Date(D_WAITER_EDIT + 'T00:00:00.000Z'),
        categoryId: testCategoryId,
        createdBy: w2!.id,
        amount: '5.00',
        paymentMethod: 'CASH',
        description: 'waiter2 pending',
        status: 'PENDING',
        submittedAt: new Date(),
      },
    });
    waiter2EditTargetId = other.id;
    const w = await loginAs(WAITER);
    const res = await w
      .patch('/api/v1/expenses/' + waiter2EditTargetId)
      .send({ amount: '6.00' });
    expect(res.status).toBe(403);
  });

  it('waiter cannot edit own APPROVED expense (409)', async () => {
    const w = await loginAs(WAITER);
    const me = await w.get('/api/v1/auth/me');
    const approved = await prisma.expense.create({
      data: {
        expenseNumber: 'phase10-wa-' + Date.now(),
        businessDate: new Date(D_WAITER_EDIT + 'T00:00:00.000Z'),
        categoryId: testCategoryId,
        createdBy: me.body.user.id,
        amount: '5.00',
        paymentMethod: 'CASH',
        description: 'approved',
        status: 'APPROVED',
        submittedAt: new Date(),
        approvedAt: new Date(),
      },
    });
    waiterApprovedId = approved.id;
    const res = await w
      .patch('/api/v1/expenses/' + waiterApprovedId)
      .send({ amount: '6.00' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_EDITABLE');
  });

  it('waiter cannot approve, even their own PENDING (403)', async () => {
    const w = await loginAs(WAITER);
    const res = await w
      .post('/api/v1/expenses/' + waiterCreateExpenseId + '/approve')
      .send({});
    expect(res.status).toBe(403);
  });
});

describe('Expenses - auto-approve (OWNER Record & Approve)', () => {
  it('OWNER + autoApprove=true creates APPROVED in one request', async () => {
    const o = await loginAs(OWNER);
    const res = await o.post('/api/v1/expenses').send({
      businessDate: D_AUTOAPPROVE,
      categoryId: testCategoryId,
      amount: '9999.00',
      paymentMethod: 'CASH',
      description: 'owner record & approve',
      autoApprove: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.expense.status).toBe('APPROVED');
    expect(res.body.expense.selfApproved).toBe(true);
    expect(res.body.expense.approvedBy).toBeTruthy();
    expect(res.body.expense.approvedAt).toBeTruthy();
    expect(res.body.expense.submittedAt).toBeTruthy();
  });

  it('OWNER without autoApprove still creates DRAFT (default unchanged)', async () => {
    const o = await loginAs(OWNER);
    const res = await o.post('/api/v1/expenses').send({
      businessDate: D_AUTOAPPROVE,
      categoryId: testCategoryId,
      amount: '100.00',
      paymentMethod: 'CASH',
      description: 'owner draft',
    });
    expect(res.status).toBe(201);
    expect(res.body.expense.status).toBe('DRAFT');
    expect(res.body.expense.approvedBy).toBeNull();
    expect(res.body.expense.approvedAt).toBeNull();
  });

  it('MANAGER + autoApprove=true is rejected (403 AUTO_APPROVE_FORBIDDEN)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/expenses').send({
      businessDate: D_AUTOAPPROVE,
      categoryId: testCategoryId,
      amount: '50.00',
      paymentMethod: 'CASH',
      description: 'manager auto-approve attempt',
      autoApprove: true,
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('AUTO_APPROVE_FORBIDDEN');
  });

  it('WAITER + autoApprove=true is rejected (403 AUTO_APPROVE_FORBIDDEN)', async () => {
    const w = await loginAs(WAITER);
    const res = await w.post('/api/v1/expenses').send({
      businessDate: D_AUTOAPPROVE,
      categoryId: testCategoryId,
      amount: '50.00',
      paymentMethod: 'CASH',
      description: 'waiter auto-approve attempt',
      autoApprove: true,
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('AUTO_APPROVE_FORBIDDEN');
  });

  it('OWNER + autoApprove=true on a CLOSED day still succeeds (OWNER bypass preserved)', async () => {
    const o = await loginAs(OWNER);
    const res = await o.post('/api/v1/expenses').send({
      businessDate: D_CLOSED,
      categoryId: testCategoryId,
      amount: '300.00',
      paymentMethod: 'CASH',
      description: 'owner auto-approve on closed day',
      autoApprove: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.expense.status).toBe('APPROVED');
    expect(res.body.expense.selfApproved).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('Create expense on a shift (submitNow + shift-date guard)', () => {
  let ownerId: string;
  let managerId: string;
  let waiterId: string;
  let shiftId: string;

  beforeAll(async () => {
    const o = await loginAs(OWNER);
    const me = await o.get('/api/v1/auth/me');
    ownerId = me.body.user.id;

    const users = await prisma.user.findMany({
      where: { username: { in: [MANAGER.username, WAITER.username, WAITER2.username] } },
      select: { id: true, username: true },
    });
    managerId = users.find((u) => u.username === MANAGER.username)!.id;
    waiterId = users.find((u) => u.username === WAITER.username)!.id;

    // WAITER opens a shift on D_SHIFT_NOW (also creates the collection-less OPEN state).
    const w = await loginAs(WAITER2);
    const sh = await w.post('/api/v1/shifts').send({ businessDate: D_SHIFT_NOW, openingCash: '0.00' });
    expect(sh.status).toBe(201);
    shiftId = sh.body.shift.id;
  });

  // Cleanup is handled by the outer afterAll: cleanup() deletes shifts +
  // expenses by username, and both WAITER2 and the manager/owner users
  // are in that list.

  it('MANAGER + submitNow=true creates PENDING with submittedAt set', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/expenses').send({
      businessDate: D_SHIFT_NOW,
      categoryId: testCategoryId,
      shiftId,
      amount: '5000.00',
      paymentMethod: 'CASH',
      description: 'Gas refill',
      submitNow: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.expense.status).toBe('PENDING');
    expect(res.body.expense.submittedAt).toBeTruthy();
    expect(res.body.expense.approvedAt).toBeNull();
    expect(res.body.expense.shiftId).toBe(shiftId);
  });

  it('MANAGER without submitNow still creates DRAFT', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/expenses').send({
      businessDate: D_SHIFT_NOW,
      categoryId: testCategoryId,
      shiftId,
      amount: '1200.00',
      paymentMethod: 'CASH',
      description: 'Draft on shift',
    });
    expect(res.status).toBe(201);
    expect(res.body.expense.status).toBe('DRAFT');
    expect(res.body.expense.submittedAt).toBeNull();
  });

  it('OWNER + submitNow=true is ignored: creates DRAFT (OWNER uses autoApprove)', async () => {
    const o = await loginAs(OWNER);
    const res = await o.post('/api/v1/expenses').send({
      businessDate: D_SHIFT_NOW,
      categoryId: testCategoryId,
      shiftId,
      amount: '700.00',
      paymentMethod: 'CASH',
      description: 'Owner submitNow noop',
      submitNow: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.expense.status).toBe('DRAFT');
  });

  it('rejects when shift businessDate does not match the expense date (SHIFT_DATE_MISMATCH)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/expenses').send({
      businessDate: D_SHIFT_MISMATCH,
      categoryId: testCategoryId,
      shiftId,
      amount: '100.00',
      paymentMethod: 'CASH',
      description: 'Wrong day',
      submitNow: true,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SHIFT_DATE_MISMATCH');
  });

  it('rejects a nonexistent shiftId with INVALID_SHIFT', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/expenses').send({
      businessDate: D_SHIFT_NOW,
      categoryId: testCategoryId,
      shiftId: 'nonexistent-shift-id',
      amount: '100.00',
      paymentMethod: 'CASH',
      description: 'Bad shift id',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_SHIFT');
  });
});
