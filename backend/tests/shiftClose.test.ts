import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

const app = createApp();

const OWNER   = { username: 'phase19j4b-owner',   password: 'OwnerPassword!234',   fullName: 'Phase19j4b Owner',   role: 'OWNER' as const };
const MANAGER = { username: 'phase19j4b-manager', password: 'ManagerPassword!234', fullName: 'Phase19j4b Manager', role: 'MANAGER' as const };
const WAITER  = { username: 'phase19j4b-waiter',  password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter',  role: 'WAITER' as const };
const WAITER2 = { username: 'phase19j4b-waiter2', password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter2', role: 'WAITER' as const };
const WAITER3 = { username: 'phase19j4b-waiter3', password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter3', role: 'WAITER' as const };
const WAITER4 = { username: 'phase19j4b-waiter4', password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter4', role: 'WAITER' as const };
const WAITER5 = { username: 'phase19j4b-waiter5', password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter5', role: 'WAITER' as const };
const WAITER6 = { username: 'phase19j4b-waiter6', password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter6', role: 'WAITER' as const };
const WAITER7 = { username: 'phase19j4b-waiter7', password: 'WaiterPassword!234',  fullName: 'Phase19j4b Waiter7', role: 'WAITER' as const };
const ALL = [OWNER, MANAGER, WAITER, WAITER2, WAITER3, WAITER4, WAITER5, WAITER6, WAITER7];

const D_HAPPY      = '2099-09-01';
const D_COLLECTION = '2099-09-02';
const D_NOTOPEN    = '2099-09-03';
const D_BADRECV    = '2099-09-04';
const D_EMPTY      = '2099-09-05';
const D_NOOPENING  = '2099-09-06';
const D_BADPAIDBY  = '2099-09-07';
const ALL_DATES = [D_HAPPY, D_COLLECTION, D_NOTOPEN, D_BADRECV, D_EMPTY, D_NOOPENING, D_BADPAIDBY];

const TEST_CATEGORY = 'Phase19j4b Test Category';

async function cleanup() {
  const usernames = ALL.map((u) => u.username);

  await prisma.expense.deleteMany({ where: { category: { name: TEST_CATEGORY } } });
  await prisma.expense.deleteMany({ where: { createdByUser: { username: { in: usernames } } } });
  await prisma.expenseCategory.deleteMany({ where: { name: TEST_CATEGORY } });

  const dates = ALL_DATES.map((d) => new Date(d + 'T00:00:00.000Z'));
  await prisma.dailyClosing.deleteMany({ where: { businessDate: { in: dates } } });

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
});

afterAll(cleanup);

async function loginAs(u) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ username: u.username, password: u.password });
  expect(res.status).toBe(200);
  return agent;
}

async function openShift(businessDate, waiter) {
  const w = await loginAs(waiter);
  const res = await w.post('/api/v1/shifts').send({ businessDate, openingCash: '1000.00' });
  expect(res.status).toBe(201);
  return res.body.shift.id;
}

async function openShiftNoCash(businessDate, waiter) {
  // StartShiftSchema requires openingCash, so open with it, then
  // nulls opening cash directly to simulate the state close-money
  // must handle. This is a setup path the business API cannot create.
  const w = await loginAs(waiter);
  const res = await w.post('/api/v1/shifts').send({ businessDate, openingCash: '1000.00' });
  expect(res.status).toBe(201);
  const id = res.body.shift.id;
  await prisma.shift.update({ where: { id }, data: { openingCash: null } });
  return id;
}

describe('POST /shifts/:id/close-money', () => {
  it('happy path: collections + expense + handover in one transaction', async () => {
    const shiftId = await openShift(D_HAPPY, WAITER);
    const m = await loginAs(MANAGER);

    const res = await m.post('/api/v1/shifts/' + shiftId + '/close-money').send({
      collections: { cash: '5000.00', mpesa: '2000.00' },
      expenses: [
        {
          categoryId: testCategoryId,
          amount: '500.00',
          paymentMethod: 'CASH',
          description: 'Gas refill during shift',
        },
      ],
      cashHandedOver: '5500.00',
      receivedByUserId: managerId,
    });

    expect(res.status).toBe(201);
    expect(res.body.reconciliation.status).toBe('SUBMITTED');
    expect(res.body.handover.status).toBe('CONFIRMED');
    expect(res.body.created.collections).toBe(2);
    expect(res.body.created.expenses).toBe(1);
    expect(res.body.reconciliation.expectedCash).toBe('5500.00');
    expect(res.body.reconciliation.cashDifference).toBe('0.00');
    expect(res.body.reconciliation.expectedMobile).toBe('2000.00');

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

  it('refuses when the shift already has non-voided collections (COLLECTIONS_EXIST)', async () => {
    const shiftId = await openShift(D_COLLECTION, WAITER2);
    const w = await loginAs(WAITER2);
    const c = await w.post('/api/v1/collections').send({
      shiftId,
      paymentMethod: 'CASH',
      amount: '100.00',
    });
    expect(c.status).toBe(201);

    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/shifts/' + shiftId + '/close-money').send({
      collections: { cash: '200.00' },
      cashHandedOver: '1200.00',
      receivedByUserId: managerId,
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('COLLECTIONS_EXIST');
  });

  it('refuses when the shift is not OPEN (SHIFT_NOT_OPEN)', async () => {
    const shiftId = await openShift(D_NOTOPEN, WAITER3);
    await prisma.shift.update({ where: { id: shiftId }, data: { status: 'SUBMITTED' } });

    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/shifts/' + shiftId + '/close-money').send({
      collections: { cash: '200.00' },
      cashHandedOver: '1200.00',
      receivedByUserId: managerId,
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SHIFT_NOT_OPEN');
  });

  it('rejects a WAITER as receiver (INVALID_RECEIVER)', async () => {
    const shiftId = await openShift(D_BADRECV, WAITER4);
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/shifts/' + shiftId + '/close-money').send({
      collections: { cash: '200.00' },
      cashHandedOver: '1200.00',
      receivedByUserId: waiterId,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_RECEIVER');
  });

  it('rejects an empty close (NOTHING_TO_CLOSE)', async () => {
    const shiftId = await openShift(D_EMPTY, WAITER5);
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/shifts/' + shiftId + '/close-money').send({
      collections: {},
      cashHandedOver: '1000.00',
      receivedByUserId: managerId,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NOTHING_TO_CLOSE');
  });

  it('refuses to close when opening cash is null (OPENING_CASH_REQUIRED)', async () => {
    const shiftId = await openShiftNoCash(D_NOOPENING, WAITER6);
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/shifts/' + shiftId + '/close-money').send({
      collections: { cash: '200.00' },
      cashHandedOver: '200.00',
      receivedByUserId: managerId,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('OPENING_CASH_REQUIRED');
  });

  it('rejects a bogus paidByUserId on an expense line (INVALID_PAID_BY)', async () => {
    const shiftId = await openShift(D_BADPAIDBY, WAITER7);
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/shifts/' + shiftId + '/close-money').send({
      collections: { cash: '1000.00' },
      expenses: [
        {
          categoryId: testCategoryId,
          amount: '100.00',
          paymentMethod: 'CASH',
          description: 'Bad paid-by',
          paidByUserId: 'nonexistent-paid-by-id',
        },
      ],
      cashHandedOver: '900.00',
      receivedByUserId: managerId,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PAID_BY');
  });
});
