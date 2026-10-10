import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

const app = createApp();

const OWNER    = { username: 'phase19j4b-owner',    password: 'OwnerPassword!234',   fullName: 'Phase19j4b Owner',    role: 'OWNER'   as const };
const MANAGER  = { username: 'phase19j4b-manager',  password: 'ManagerPassword!234', fullName: 'Phase19j4b Manager',  role: 'MANAGER' as const };
const MANAGER2 = { username: 'phase19j4b-manager2', password: 'ManagerPassword!234', fullName: 'Phase19j4b Manager2', role: 'MANAGER' as const };
const WAITER   = { username: 'phase19j4b-waiter',   password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter',   role: 'WAITER'  as const };
const WAITER2  = { username: 'phase19j4b-waiter2',  password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter2',  role: 'WAITER'  as const };
const WAITER3  = { username: 'phase19j4b-waiter3',  password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter3',  role: 'WAITER'  as const };
const WAITER4  = { username: 'phase19j4b-waiter4',  password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter4',  role: 'WAITER'  as const };
const WAITER5  = { username: 'phase19j4b-waiter5',  password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter5',  role: 'WAITER'  as const };
const WAITER6  = { username: 'phase19j4b-waiter6',  password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter6',  role: 'WAITER'  as const };
const WAITER7  = { username: 'phase19j4b-waiter7',  password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter7',  role: 'WAITER'  as const };
const WAITER8  = { username: 'phase19j4b-waiter8',  password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter8',  role: 'WAITER'  as const };
const WAITER9  = { username: 'phase19j4b-waiter9',  password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter9',  role: 'WAITER'  as const };
const WAITER10 = { username: 'phase19j4b-waiter10', password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter10', role: 'WAITER'  as const };
const WAITER11 = { username: 'phase19j4b-waiter11', password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter11', role: 'WAITER'  as const };
const WAITER12 = { username: 'phase19j4b-waiter12', password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter12', role: 'WAITER'  as const };
const WAITER13 = { username: 'phase19j4b-waiter13', password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter13', role: 'WAITER'  as const };
const WAITER14 = { username: 'phase19j4b-waiter14', password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter14', role: 'WAITER'  as const };
const WAITER15 = { username: 'phase19j4b-waiter15', password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter15', role: 'WAITER'  as const };
const WAITER16 = { username: 'phase19j4b-waiter16', password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter16', role: 'WAITER'  as const };
const WAITER17 = { username: 'phase19j4b-waiter17', password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter17', role: 'WAITER'  as const };
const WAITER18 = { username: 'phase19j4b-waiter18', password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter18', role: 'WAITER'  as const };
const WAITER19 = { username: 'phase19j4b-waiter19', password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter19', role: 'WAITER'  as const };
const WAITER20 = { username: 'phase19j4b-waiter20', password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter20', role: 'WAITER'  as const };
const WAITER21 = { username: 'phase19j4b-waiter21', password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter21', role: 'WAITER'  as const };
const WAITER22 = { username: 'phase19j4b-waiter22', password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter22', role: 'WAITER'  as const };
const WAITER23 = { username: 'phase19j4b-waiter23', password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter23', role: 'WAITER'  as const };
const WAITER24 = { username: 'phase19j4b-waiter24', password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter24', role: 'WAITER'  as const };
const WAITER25 = { username: 'phase19j4b-waiter25', password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter25', role: 'WAITER'  as const };
const WAITER26 = { username: 'phase19j4b-waiter26', password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter26', role: 'WAITER'  as const };
const WAITER27 = { username: 'phase19j4b-waiter27', password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter27', role: 'WAITER'  as const };
const WAITER28 = { username: 'phase19j4b-waiter28', password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter28', role: 'WAITER'  as const };
const WAITER29 = { username: 'phase19j4b-waiter29', password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter29', role: 'WAITER'  as const };
const WAITER30 = { username: 'phase19j4b-waiter30', password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter30', role: 'WAITER'  as const };
const WAITER31 = { username: 'phase19j4b-waiter31', password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter31', role: 'WAITER'  as const };
const WAITER32 = { username: 'phase19j4b-waiter32', password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter32', role: 'WAITER'  as const };

const ALL = [OWNER, MANAGER, MANAGER2, WAITER, WAITER2, WAITER3, WAITER4, WAITER5, WAITER6, WAITER7, WAITER8, WAITER9, WAITER10, WAITER11, WAITER12, WAITER13, WAITER14, WAITER15, WAITER16, WAITER17, WAITER18, WAITER19, WAITER20, WAITER21, WAITER22, WAITER23, WAITER24, WAITER25, WAITER26, WAITER27, WAITER28, WAITER29, WAITER30, WAITER31, WAITER32];

const D_HAPPY      = '2099-09-01';
const D_NOTOPEN    = '2099-09-02';
const D_BADRECV    = '2099-09-03';
const D_BADPAIDBY  = '2099-09-04';
const D_COMPLETE   = '2099-09-05';
const D_NOCOLL     = '2099-09-06';
const D_SELFREV_M  = '2099-09-07';
const D_SELFREV_O  = '2099-09-08';
const D_OTHERREV   = '2099-09-09';
const D_AUTO_CS    = '2099-09-10';
const D_AUTO_CS2   = '2099-09-11';
const D_MGR_FLAGS  = '2099-09-12';
const D_SUB1 = '2099-09-13';
const D_SUB2 = '2099-09-14';
const D_SUB3 = '2099-09-15';
const D_SUB4 = '2099-09-16';
const D_SUB5 = '2099-09-17';
const D_SUB6 = '2099-09-18';
const D_SUB7 = '2099-09-19';
const D_SUB8 = '2099-09-20';
const D_FIN1 = '2099-10-01';
const D_FIN2 = '2099-10-02';
const D_FIN3 = '2099-10-03';
const D_FIN4 = '2099-10-04';
const D_FIN5 = '2099-10-05';
const D_FIN6 = '2099-10-06';

const ALL_DATES = [D_HAPPY, D_NOTOPEN, D_BADRECV, D_BADPAIDBY, D_COMPLETE, D_NOCOLL, D_SELFREV_M, D_SELFREV_O, D_OTHERREV, D_AUTO_CS, D_AUTO_CS2, D_MGR_FLAGS, D_SUB1, D_SUB2, D_SUB3, D_SUB4, D_SUB5, D_SUB6, D_SUB7, D_SUB8, D_FIN1, D_FIN2, D_FIN3, D_FIN4, D_FIN5, D_FIN6];

const TEST_CATEGORY = 'Phase19j4b Test Category';

async function cleanup() {
  const usernames = ALL.map((u) => u.username);
  await prisma.expense.deleteMany({ where: { category: { name: TEST_CATEGORY } } });
  await prisma.expense.deleteMany({ where: { createdByUser: { username: { in: usernames } } } });
  await prisma.expenseCategory.deleteMany({ where: { name: TEST_CATEGORY } });
  const dates = ALL_DATES.map((d) => new Date(d + 'T00:00:00.000Z'));
  await prisma.dailyClosing.deleteMany({ where: { businessDate: { in: dates } } });
  await prisma.salesSummary.deleteMany({ where: { user: { username: { in: usernames } } } });
  await prisma.cashHandover.deleteMany({ where: { fromUser: { username: { in: usernames } } } });
  await prisma.reconciliation.deleteMany({ where: { user: { username: { in: usernames } } } });
  await prisma.collection.deleteMany({ where: { user: { username: { in: usernames } } } });
  await prisma.shift.deleteMany({ where: { user: { username: { in: usernames } } } });
  await prisma.session.deleteMany({ where: { user: { username: { in: usernames } } } });
  await prisma.user.deleteMany({ where: { username: { in: usernames } } });
}

async function makeUser(u) {
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

let testCategoryId;
let waiterId;
let managerId;
let ownerId;

beforeAll(async () => {
  await cleanup();
  for (const u of ALL) await makeUser(u);
  const cat = await prisma.expenseCategory.create({
    data: { name: TEST_CATEGORY, description: 'Phase19j4b test category' },
  });
  testCategoryId = cat.id;
  const w = await prisma.user.findUnique({ where: { username: WAITER.username } });
  waiterId = w.id;
  const m = await prisma.user.findUnique({ where: { username: MANAGER.username } });
  managerId = m.id;
  const o = await prisma.user.findUnique({ where: { username: OWNER.username } });
  ownerId = o.id;
});

afterAll(cleanup);

async function loginAs(u) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ username: u.username, password: u.password });
  expect(res.status).toBe(200);
  return agent;
}

// Seed an OPEN shift directly via Prisma. POST /shifts was removed —
// shifts auto-open on first collection in production. Tests need a
// pre-existing shift to exercise the close/submit/finalize paths.
async function openShift(businessDate, waiter) {
  const u = await prisma.user.findUniqueOrThrow({ where: { username: waiter.username } });
  const shift = await prisma.shift.create({
    data: {
      userId: u.id,
      businessDate: new Date(businessDate + 'T00:00:00.000Z'),
      status: 'OPEN',
      openingCash: '1000.00',
    },
  });
  return shift.id;
}

// Seed a SalesSummary for the given user and date. close-money and
// submit require one — they compute Net Cash from totalSales.
async function seedSales(waiter, businessDate, totalSales) {
  const u = await prisma.user.findUniqueOrThrow({ where: { username: waiter.username } });
  await prisma.salesSummary.create({
    data: {
      businessDate: new Date(businessDate + 'T00:00:00.000Z'),
      source: 'MANUAL',
      sourceReference: 'test-' + waiter.username + '-' + businessDate,
      totalSales,
      cashSales: totalSales,
      mobileSales: '0.00',
      otherSales: '0.00',
      userId: u.id,
    },
  });
}

describe('POST /shifts/:id/close-money', () => {
  it('happy path: mpesa entries + expense, net cash derived from sales', async () => {
    const shiftId = await openShift(D_HAPPY, WAITER);
    await seedSales(WAITER, D_HAPPY, '8000.00');
    const m = await loginAs(MANAGER);

    const res = await m.post('/api/v1/shifts/' + shiftId + '/close-money').send({
      mpesaEntries: [
        { payerName: 'Alice', amount: '1200.00' },
        { payerName: 'Bob',   amount: '800.00'  },
      ],
      expenses: [
        {
          categoryId: testCategoryId,
          amount: '500.00',
          paymentMethod: 'CASH',
          description: 'Gas refill during shift',
        },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.reconciliation.status).toBe('SUBMITTED');
    expect(res.body.handover).toBeNull();
    expect(res.body.created.mpesaEntries).toBe(2);
    expect(res.body.created.expenses).toBe(1);
    expect(res.body.reconciliation.expectedCash).toBe('5500.00');
    expect(res.body.reconciliation.actualCash).toBe('5500.00');
    expect(res.body.reconciliation.expectedMobile).toBe('2000.00');
    expect(res.body.reconciliation.cashDifference).toBe('0.00');

    const colls = await prisma.collection.findMany({ where: { shiftId } });
    expect(colls.length).toBe(2);
    const exps = await prisma.expense.findMany({ where: { shiftId } });
    expect(exps.length).toBe(1);
    expect(exps[0].status).toBe('PENDING');

    const recon = await prisma.reconciliation.findUnique({ where: { shiftId } });
    expect(recon.createdBy).toBe(managerId);
    expect(recon.userId).toBe(waiterId);

    const shiftAfter = await prisma.shift.findUnique({ where: { id: shiftId } });
    expect(shiftAfter.status).toBe('SUBMITTED');
    expect(shiftAfter.submittedAt).toBeTruthy();
  });

  it('refuses when the shift is not OPEN (SHIFT_NOT_OPEN)', async () => {
    const shiftId = await openShift(D_NOTOPEN, WAITER3);
    await prisma.shift.update({ where: { id: shiftId }, data: { status: 'SUBMITTED' } });

    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/shifts/' + shiftId + '/close-money').send({
      mpesaEntries: [{ payerName: 'Alice', amount: '200.00' }],
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SHIFT_NOT_OPEN');
  });

  it('manager close-money produces no handover even with a legacy receivedByUserId', async () => {
    const shiftId = await openShift(D_BADRECV, WAITER4);
    await seedSales(WAITER4, D_BADRECV, '1200.00');
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/shifts/' + shiftId + '/close-money').send({
      receivedByUserId: waiterId,
    });

    expect(res.status).toBe(201);
    expect(res.body.handover).toBeNull();
    const handoverCount = await prisma.cashHandover.count({ where: { shiftId } });
    expect(handoverCount).toBe(0);
  });

  it('rejects a bogus paidByUserId on an expense line (INVALID_PAID_BY)', async () => {
    const shiftId = await openShift(D_BADPAIDBY, WAITER7);
    await seedSales(WAITER7, D_BADPAIDBY, '1000.00');
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/shifts/' + shiftId + '/close-money').send({
      expenses: [
        {
          categoryId: testCategoryId,
          amount: '100.00',
          paymentMethod: 'CASH',
          description: 'Bad paid-by',
          paidByUserId: 'nonexistent-paid-by-id',
        },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PAID_BY');
  });
});

describe('POST /shifts/:id/complete-shift (existing collections)', () => {
  it('MANAGER completes a shift using collections the waiter already recorded', async () => {
    const shiftId = await openShift(D_COMPLETE, WAITER8);
    const w = await loginAs(WAITER8);
    const c = await w.post('/api/v1/collections').send({
      shiftId,
      paymentMethod: 'CASH',
      amount: '5000.00',
    });
    expect(c.status).toBe(201);

    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/shifts/' + shiftId + '/complete-shift').send({
      expenses: [
        {
          categoryId: testCategoryId,
          amount: '200.00',
          paymentMethod: 'CASH',
          description: 'Gas during shift',
        },
      ],
      cashHandedOver: '5800.00',
    });

    expect(res.status).toBe(201);
    expect(res.body.reconciliation.status).toBe('SUBMITTED');
    expect(res.body.handover).toBeNull();
    expect(res.body.created.mpesaEntries).toBe(0);
    expect(res.body.created.expenses).toBe(1);
    expect(res.body.reconciliation.expectedCash).toBe('5800.00');
    expect(res.body.reconciliation.actualCash).toBe('5800.00');
    expect(res.body.reconciliation.cashDifference).toBe('0.00');

    const recon = await prisma.reconciliation.findUnique({ where: { shiftId } });
    expect(recon.createdBy).toBe(managerId);
    const shiftAfter = await prisma.shift.findUnique({ where: { id: shiftId } });
    expect(shiftAfter.status).toBe('SUBMITTED');
  });

  it('refuses complete-shift when the shift has no non-voided collections (NO_COLLECTIONS)', async () => {
    const shiftId = await openShift(D_NOCOLL, WAITER9);
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/shifts/' + shiftId + '/complete-shift').send({
      cashHandedOver: '1000.00',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_COLLECTIONS');
  });

  it('MANAGER cannot review their own submission (SELF_REVIEW_FORBIDDEN)', async () => {
    const shiftId = await openShift(D_SELFREV_M, WAITER10);
    const w = await loginAs(WAITER10);
    await w.post('/api/v1/collections').send({
      shiftId,
      paymentMethod: 'CASH',
      amount: '3000.00',
    });
    const m = await loginAs(MANAGER);
    const c = await m.post('/api/v1/shifts/' + shiftId + '/complete-shift').send({
      cashHandedOver: '4000.00',
    });
    expect(c.status).toBe(201);
    const reconId = c.body.reconciliation.id;

    const review = await m.post('/api/v1/reconciliations/' + reconId + '/review').send({
      decision: 'APPROVE',
    });
    expect(review.status).toBe(403);
    expect(review.body.code).toBe('SELF_REVIEW_FORBIDDEN');
  });

  it('OWNER may review their own submission', async () => {
    const shiftId = await openShift(D_SELFREV_O, WAITER11);
    await seedSales(WAITER11, D_SELFREV_O, '3000.00');
    const o = await loginAs(OWNER);
    const c = await o.post('/api/v1/shifts/' + shiftId + '/close-money').send({});
    expect(c.status).toBe(201);
    const reconId = c.body.reconciliation.id;

    const review = await o.post('/api/v1/reconciliations/' + reconId + '/review').send({
      decision: 'APPROVE',
    });
    expect(review.status).toBe(200);
    expect(review.body.reconciliation.status).toBe('REVIEWED');
  });

  it('a different MANAGER can review a submission they did not create', async () => {
    const shiftId = await openShift(D_OTHERREV, WAITER12);
    const w = await loginAs(WAITER12);
    await w.post('/api/v1/collections').send({
      shiftId,
      paymentMethod: 'CASH',
      amount: '1500.00',
    });
    const mA = await loginAs(MANAGER);
    const c = await mA.post('/api/v1/shifts/' + shiftId + '/complete-shift').send({
      cashHandedOver: '2500.00',
    });
    expect(c.status).toBe(201);
    const reconId = c.body.reconciliation.id;

    const mB = await loginAs(MANAGER2);
    const review = await mB.post('/api/v1/reconciliations/' + reconId + '/review').send({
      decision: 'APPROVE',
    });
    expect(review.status).toBe(200);
    expect(review.body.reconciliation.status).toBe('REVIEWED');
  });
});

describe('Owner auto-approval preferences in close-money', () => {
  it('OWNER with autoApproveExpenses + autoReviewReconciliations ON: close-money lands APPROVED + REVIEWED', async () => {
    const shiftId = await openShift(D_AUTO_CS, WAITER13);
    await seedSales(WAITER13, D_AUTO_CS, '500.00');
    const o = await loginAs(OWNER);
    const pref = await o.patch('/api/v1/auth/me').send({
      autoApproveExpenses: true,
      autoReviewReconciliations: true,
    });
    expect(pref.status).toBe(200);

    const res = await o.post('/api/v1/shifts/' + shiftId + '/close-money').send({
      expenses: [
        {
          categoryId: testCategoryId,
          amount: '100.00',
          paymentMethod: 'CASH',
          description: 'owner auto-close',
        },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.reconciliation.status).toBe('REVIEWED');

    const exps = await prisma.expense.findMany({ where: { shiftId } });
    expect(exps.length).toBe(1);
    expect(exps[0].status).toBe('APPROVED');
    expect(exps[0].approvedBy).toBe(ownerId);

    const recon = await prisma.reconciliation.findUnique({ where: { shiftId } });
    expect(recon.status).toBe('REVIEWED');
    expect(recon.reviewedBy).toBe(ownerId);

    await o.patch('/api/v1/auth/me').send({
      autoApproveExpenses: false,
      autoReviewReconciliations: false,
    });
  });

  it('OWNER with both flags ON: complete-shift honors them too', async () => {
    const shiftId = await openShift(D_AUTO_CS2, WAITER14);
    const w = await loginAs(WAITER14);
    await w.post('/api/v1/collections').send({
      shiftId,
      paymentMethod: 'CASH',
      amount: '300.00',
    });

    const o = await loginAs(OWNER);
    await o.patch('/api/v1/auth/me').send({
      autoApproveExpenses: true,
      autoReviewReconciliations: true,
    });

    const res = await o.post('/api/v1/shifts/' + shiftId + '/complete-shift').send({
      expenses: [
        {
          categoryId: testCategoryId,
          amount: '50.00',
          paymentMethod: 'CASH',
          description: 'owner auto-complete',
        },
      ],
      cashHandedOver: '250.00',
    });
    expect(res.status).toBe(201);
    expect(res.body.reconciliation.status).toBe('REVIEWED');

    const exps = await prisma.expense.findMany({ where: { shiftId } });
    expect(exps.length).toBe(1);
    expect(exps[0].status).toBe('APPROVED');
    expect(exps[0].approvedBy).toBe(ownerId);

    await o.patch('/api/v1/auth/me').send({
      autoApproveExpenses: false,
      autoReviewReconciliations: false,
    });
  });

  it('MANAGER with both flags ON on their own account: still PENDING + SUBMITTED', async () => {
    const shiftId = await openShift(D_MGR_FLAGS, WAITER15);
    await seedSales(WAITER15, D_MGR_FLAGS, '300.00');
    const m = await loginAs(MANAGER);
    await m.patch('/api/v1/auth/me').send({
      autoApproveExpenses: true,
      autoReviewReconciliations: true,
    });

    const res = await m.post('/api/v1/shifts/' + shiftId + '/close-money').send({
      expenses: [
        {
          categoryId: testCategoryId,
          amount: '50.00',
          paymentMethod: 'CASH',
          description: 'manager with flags',
        },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.reconciliation.status).toBe('SUBMITTED');

    const exps = await prisma.expense.findMany({ where: { shiftId } });
    expect(exps.length).toBe(1);
    expect(exps[0].status).toBe('PENDING');
    expect(exps[0].approvedBy).toBeNull();

    await m.patch('/api/v1/auth/me').send({
      autoApproveExpenses: false,
      autoReviewReconciliations: false,
    });
  });
});

describe('Unified Submit endpoint (POST /shifts/:id/submit)', () => {
  it('Submit with NO existing collections and 2 new mpesa entries: creates 2, closes the shift', async () => {
    const shiftId = await openShift(D_SUB1, WAITER19);
    await seedSales(WAITER19, D_SUB1, '3500.00');
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/shifts/' + shiftId + '/submit').send({
      mpesaEntries: [
        { payerName: 'Carol', amount: '300.00' },
        { payerName: 'Dave',  amount: '200.00' },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.created.mpesaEntries).toBe(2);
    expect(res.body.reconciliation.status).toBe('SUBMITTED');
    expect(res.body.handover).toBeNull();
    const shiftAfter = await prisma.shift.findUnique({ where: { id: shiftId } });
    expect(shiftAfter!.status).toBe('SUBMITTED');
  });

  it('Submit with existing collections and no new mpesa: existing untouched, sales drives net cash', async () => {
    const shiftId = await openShift(D_SUB2, WAITER20);
    await seedSales(WAITER20, D_SUB2, '700.00');
    const w = await loginAs(WAITER20);
    await w.post('/api/v1/collections').send({ shiftId, paymentMethod: 'CASH', amount: '700.00' });
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/shifts/' + shiftId + '/submit').send({});
    expect(res.status).toBe(201);
    expect(res.body.created.mpesaEntries).toBe(0);
    expect(res.body.reconciliation.expectedCash).toBe('700.00');
    const collCount = await prisma.collection.count({ where: { shiftId, voidedAt: null } });
    expect(collCount).toBe(1);
  });

  it('Submit with existing + new: math combines both, only new mpesa row is created', async () => {
    const shiftId = await openShift(D_SUB3, WAITER21);
    await seedSales(WAITER21, D_SUB3, '500.00');
    const w = await loginAs(WAITER21);
    await w.post('/api/v1/collections').send({ shiftId, paymentMethod: 'CASH', amount: '200.00' });
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/shifts/' + shiftId + '/submit').send({
      mpesaEntries: [{ payerName: 'Eve', amount: '300.00' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.created.mpesaEntries).toBe(1);
    expect(res.body.reconciliation.expectedCash).toBe('200.00');
    expect(res.body.reconciliation.expectedMobile).toBe('300.00');
    const collCount = await prisma.collection.count({ where: { shiftId, voidedAt: null } });
    expect(collCount).toBe(2);
  });

  it('Submit with no collections and no sales summary: 409 NO_SALES_SUMMARY', async () => {
    const shiftId = await openShift(D_SUB4, WAITER22);
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/shifts/' + shiftId + '/submit').send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NO_SALES_SUMMARY');
  });

  it('Submit on non-OPEN shift: 409 SHIFT_NOT_OPEN', async () => {
    const shiftId = await openShift(D_SUB5, WAITER23);
    await prisma.shift.update({ where: { id: shiftId }, data: { status: 'SUBMITTED' } });
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/shifts/' + shiftId + '/submit').send({
      mpesaEntries: [{ payerName: 'Frank', amount: '100.00' }],
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SHIFT_NOT_OPEN');
  });

  it('Submit when recon already exists: 409 RECONCILIATION_EXISTS', async () => {
    const shiftId = await openShift(D_SUB6, WAITER24);
    await seedSales(WAITER24, D_SUB6, '100.00');
    const m = await loginAs(MANAGER);
    const first = await m.post('/api/v1/shifts/' + shiftId + '/submit').send({});
    expect(first.status).toBe(201);
    await prisma.shift.update({ where: { id: shiftId }, data: { status: 'OPEN' } });
    const second = await m.post('/api/v1/shifts/' + shiftId + '/submit').send({});
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('RECONCILIATION_EXISTS');
  });

  it('OWNER with auto flags ON via Submit: APPROVED expense + REVIEWED recon', async () => {
    const shiftId = await openShift(D_SUB7, WAITER25);
    await seedSales(WAITER25, D_SUB7, '500.00');
    const o = await loginAs(OWNER);
    await o.patch('/api/v1/auth/me').send({
      autoApproveExpenses: true,
      autoReviewReconciliations: true,
    });
    const res = await o.post('/api/v1/shifts/' + shiftId + '/submit').send({
      expenses: [
        {
          categoryId: testCategoryId,
          amount: '100.00',
          paymentMethod: 'CASH',
          description: 'submit auto flags',
        },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.reconciliation.status).toBe('REVIEWED');
    expect(res.body.handover).toBeNull();
    const exps = await prisma.expense.findMany({ where: { shiftId } });
    expect(exps[0].status).toBe('APPROVED');
    await o.patch('/api/v1/auth/me').send({
      autoApproveExpenses: false,
      autoReviewReconciliations: false,
    });
  });

  it('MANAGER via Submit: PENDING expense + SUBMITTED recon', async () => {
    const shiftId = await openShift(D_SUB8, WAITER26);
    await seedSales(WAITER26, D_SUB8, '200.00');
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/shifts/' + shiftId + '/submit').send({
      expenses: [
        {
          categoryId: testCategoryId,
          amount: '50.00',
          paymentMethod: 'CASH',
          description: 'submit as manager',
        },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.reconciliation.status).toBe('SUBMITTED');
    expect(res.body.handover).toBeNull();
    const exps = await prisma.expense.findMany({ where: { shiftId } });
    expect(exps[0].status).toBe('PENDING');
  });
});

describe('POST /shifts/:id/finalize', () => {
  it('MANAGER submits, OWNER finalizes: reviews recon, closes shift, no handover', async () => {
    const shiftId = await openShift(D_FIN1, WAITER27);
    await seedSales(WAITER27, D_FIN1, '1500.00');
    const m = await loginAs(MANAGER);
    const o = await loginAs(OWNER);
    const submit = await m.post('/api/v1/shifts/' + shiftId + '/close-money').send({});
    expect(submit.status).toBe(201);

    const fin = await o.post('/api/v1/shifts/' + shiftId + '/finalize').send({});
    expect(fin.status).toBe(200);
    expect(fin.body.shift.status).toBe('CLOSED');
    expect(fin.body.reviewPerformed).toBe(true);
    expect(fin.body.handoverConfirmed).toBe(false);

    const recon = await prisma.reconciliation.findUnique({ where: { shiftId } });
    expect(recon!.status).toBe('REVIEWED');
    expect(recon!.reviewedBy).toBe(ownerId);
    const handoverCount = await prisma.cashHandover.count({ where: { shiftId } });
    expect(handoverCount).toBe(0);
  });

  it('finalize confirms a PENDING handover', async () => {
    const shiftId = await openShift(D_FIN2, WAITER28);
    await seedSales(WAITER28, D_FIN2, '1500.00');
    const m = await loginAs(MANAGER);
    const o = await loginAs(OWNER);
    const submit = await m.post('/api/v1/shifts/' + shiftId + '/close-money').send({});
    expect(submit.status).toBe(201);
    const reconId = submit.body.reconciliation.id;

    const waiterUser = await prisma.user.findUnique({ where: { username: WAITER28.username } });
    await prisma.cashHandover.create({
      data: {
        shiftId,
        reconciliationId: reconId,
        fromUserId: waiterUser!.id,
        toUserId: managerId,
        createdById: managerId,
        amount: '1500.00',
        status: 'PENDING',
        notes: null,
      },
    });

    const fin = await o.post('/api/v1/shifts/' + shiftId + '/finalize').send({});
    expect(fin.status).toBe(200);
    expect(fin.body.handoverConfirmed).toBe(true);

    const h = await prisma.cashHandover.findFirst({ where: { shiftId } });
    expect(h!.status).toBe('CONFIRMED');
    expect(h!.confirmedAt).not.toBeNull();
  });

  it('finalize on already CLOSED shift -> 409 SHIFT_ALREADY_CLOSED', async () => {
    const shiftId = await openShift(D_FIN3, WAITER29);
    await seedSales(WAITER29, D_FIN3, '1500.00');
    const m = await loginAs(MANAGER);
    const o = await loginAs(OWNER);
    await m.post('/api/v1/shifts/' + shiftId + '/close-money').send({});
    const first = await o.post('/api/v1/shifts/' + shiftId + '/finalize').send({});
    expect(first.status).toBe(200);

    const second = await o.post('/api/v1/shifts/' + shiftId + '/finalize').send({});
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('SHIFT_ALREADY_CLOSED');
  });

  it('finalize on OPEN shift -> 409 SHIFT_NOT_SUBMITTED', async () => {
    const shiftId = await openShift(D_FIN4, WAITER30);
    const o = await loginAs(OWNER);
    const fin = await o.post('/api/v1/shifts/' + shiftId + '/finalize').send({});
    expect(fin.status).toBe(409);
    expect(fin.body.code).toBe('SHIFT_NOT_SUBMITTED');
  });

  it('MANAGER cannot finalize their own submission (403 SELF_REVIEW_FORBIDDEN)', async () => {
    const shiftId = await openShift(D_FIN5, WAITER31);
    await seedSales(WAITER31, D_FIN5, '1500.00');
    const m = await loginAs(MANAGER);
    const submit = await m.post('/api/v1/shifts/' + shiftId + '/close-money').send({});
    expect(submit.status).toBe(201);

    const fin = await m.post('/api/v1/shifts/' + shiftId + '/finalize').send({});
    expect(fin.status).toBe(403);
    expect(fin.body.code).toBe('SELF_REVIEW_FORBIDDEN');
  });

  it('OWNER can finalize their own submission (self-review allowed)', async () => {
    const shiftId = await openShift(D_FIN6, WAITER32);
    await seedSales(WAITER32, D_FIN6, '1500.00');
    const o = await loginAs(OWNER);
    const submit = await o.post('/api/v1/shifts/' + shiftId + '/close-money').send({});
    expect(submit.status).toBe(201);

    const fin = await o.post('/api/v1/shifts/' + shiftId + '/finalize').send({});
    expect(fin.status).toBe(200);
    expect(fin.body.shift.status).toBe('CLOSED');
  });
});
