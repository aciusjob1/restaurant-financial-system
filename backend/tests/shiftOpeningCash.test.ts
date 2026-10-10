import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { seedShiftForUser } from './support/seedShift.js';

const app = createApp();

const OWNER   = { username: 'phase18c-owner',   password: 'OwnerPass!234',   fullName: 'Phase18c Owner',   role: 'OWNER'   as const };
const MANAGER = { username: 'phase18c-manager', password: 'ManagerPass!234', fullName: 'Phase18c Manager', role: 'MANAGER' as const };
const WAITER  = { username: 'phase18c-waiter',  password: 'WaiterPass!234',  fullName: 'Phase18c Waiter',  role: 'WAITER'  as const };
const EXTRA   = { username: 'phase18c-extra',   password: 'ExtraPass!234',   fullName: 'Phase18c Extra',   role: 'WAITER'  as const };
const ALL = [OWNER, MANAGER, WAITER, EXTRA];

// Far-future dates. The login backstop (closeStaleOpenShiftsForUser) closes
// OPEN shifts whose businessDate is strictly before today. Seeding on past
// dates would let one test's login close another test's fixture shift.
const D_NULL1     = new Date('2099-08-15');
const D_NULL2     = new Date('2099-08-16');
const D_SUBMITTED = new Date('2099-08-17');

async function cleanup() {
  const usernames = ALL.map((u) => u.username);
  const userRows = await prisma.user.findMany({
    where: { username: { in: usernames } },
    select: { id: true },
  });
  const userIds = userRows.map((u) => u.id);

  if (userIds.length > 0) {
    await prisma.shift.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.shift.deleteMany({ where: { openingCashSetByUserId: { in: userIds } } });
  }
  await prisma.session.deleteMany({ where: { user: { username: { in: usernames } } } });
  await prisma.user.deleteMany({ where: { username: { in: usernames } } });
}

async function makeUser(u: { username: string; password: string; fullName: string; role: 'OWNER' | 'MANAGER' | 'WAITER' }) {
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

async function loginAs(u: { username: string; password: string }) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ username: u.username, password: u.password });
  expect(res.status).toBe(200);
  return agent;
}

let ownerId: string;
let managerId: string;
let waiterId: string;
let shiftNull1Id: string;
let shiftNull2Id: string;
let shiftSubmittedId: string;
let shiftSetId: string;

beforeAll(async () => {
  await cleanup();

  const o = await makeUser(OWNER);
  const m = await makeUser(MANAGER);
  const w = await makeUser(WAITER);
  const e = await makeUser(EXTRA);
  ownerId = o.id; managerId = m.id; waiterId = w.id;

  // Legacy-shaped rows with NULL openingCash — mirrors the pre-Fix-B state.
  const s1 = await prisma.shift.create({
    data: { userId: waiterId, businessDate: D_NULL1, status: 'OPEN', openingCash: null },
  });
  const s2 = await prisma.shift.create({
    data: { userId: managerId, businessDate: D_NULL2, status: 'OPEN', openingCash: null },
  });
  // Non-OPEN shift for the SHIFT_NOT_OPEN case.
  const s3 = await prisma.shift.create({
    data: { userId: e.id, businessDate: D_SUBMITTED, status: 'SUBMITTED', openingCash: null },
  });
  shiftNull1Id = s1.id;
  shiftNull2Id = s2.id;
  shiftSubmittedId = s3.id;

  // Normal shift with openingCash set. Seeded directly via Prisma;
  // POST /api/v1/shifts was removed when shifts moved to auto-open.
  const setShift = await seedShiftForUser(OWNER, { openingCash: '500.00' });
  shiftSetId = setShift.id;
});

afterAll(cleanup);

describe('POST /api/v1/shifts/:id/opening-cash — recovery', () => {
  it('MANAGER backfills a NULL openingCash; openingCashSetByUserId = manager', async () => {
    const m = await loginAs(MANAGER);
    const res = await m
      .post(`/api/v1/shifts/${shiftNull1Id}/opening-cash`)
      .send({ openingCash: '10000.00' });
    expect(res.status).toBe(200);
    expect(res.body.shift.openingCash).toBe('10000.00');
    expect(res.body.shift.openingCashSetByUserId).toBe(managerId);
    expect(res.body.shift.status).toBe('OPEN');
  });

  it('OWNER backfills another NULL openingCash, including explicit zero', async () => {
    const o = await loginAs(OWNER);
    const res = await o
      .post(`/api/v1/shifts/${shiftNull2Id}/opening-cash`)
      .send({ openingCash: '0.00' });
    expect(res.status).toBe(200);
    expect(res.body.shift.openingCash).toBe('0.00');
    expect(res.body.shift.openingCashSetByUserId).toBe(ownerId);
  });

  it('WAITER cannot use the recovery endpoint (403)', async () => {
    const w = await loginAs(WAITER);
    const res = await w
      .post(`/api/v1/shifts/${shiftSubmittedId}/opening-cash`)
      .send({ openingCash: '100.00' });
    expect(res.status).toBe(403);
  });

  it('nonexistent shift returns 404 SHIFT_NOT_FOUND', async () => {
    const m = await loginAs(MANAGER);
    const res = await m
      .post('/api/v1/shifts/does-not-exist/opening-cash')
      .send({ openingCash: '100.00' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('SHIFT_NOT_FOUND');
  });

  it('non-OPEN shift returns 409 SHIFT_NOT_OPEN', async () => {
    const m = await loginAs(MANAGER);
    const res = await m
      .post(`/api/v1/shifts/${shiftSubmittedId}/opening-cash`)
      .send({ openingCash: '100.00' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SHIFT_NOT_OPEN');
  });

  it('already-set openingCash returns 409 OPENING_CASH_ALREADY_SET', async () => {
    const m = await loginAs(MANAGER);
    const res = await m
      .post(`/api/v1/shifts/${shiftSetId}/opening-cash`)
      .send({ openingCash: '999.00' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('OPENING_CASH_ALREADY_SET');
  });

  it('invalid money string returns 400 (validator runs before service)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m
      .post(`/api/v1/shifts/${shiftSetId}/opening-cash`)
      .send({ openingCash: 'abc' });
    expect(res.status).toBe(400);
  });
});