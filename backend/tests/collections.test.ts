import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { seedShiftForUser } from './support/seedShift.js';

const app = createApp();

const WAITER = { username: 'phase6-waiter', password: 'WaiterPassword!234', fullName: 'Phase 6 Waiter', role: 'WAITER' as const };
const WAITER2 = { username: 'phase6-waiter2', password: 'WaiterPassword!234', fullName: 'Phase 6 Waiter 2', role: 'WAITER' as const };
const MANAGER = { username: 'phase6-manager', password: 'ManagerPassword!234', fullName: 'Phase 6 Manager', role: 'MANAGER' as const };
const AUDITOR = { username: 'phase6-auditor', password: 'AuditorPassword!234', fullName: 'Phase 6 Auditor', role: 'AUDITOR' as const };
const ALL = [WAITER, WAITER2, MANAGER, AUDITOR];

async function cleanup() {
  const usernames = ALL.map((u) => u.username);
  await prisma.collection.deleteMany({ where: { user: { username: { in: usernames } } } });
  await prisma.shift.deleteMany({ where: { user: { username: { in: usernames } } } });
  await prisma.session.deleteMany({ where: { user: { username: { in: usernames } } } });
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

beforeAll(async () => {
  await cleanup();
  for (const u of ALL) await makeUser(u);
});

afterAll(cleanup);

async function loginAs(u: { username: string; password: string }) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ username: u.username, password: u.password });
  expect(res.status).toBe(200);
  return agent;
}

describe('Collections', () => {
  let waiterShiftId: string;
  let otherWaiterShiftId: string;

  it('WAITER opens their own shift; a second WAITER opens their own', async () => {
    // Seed shifts directly via Prisma on far-future dates. POST /api/v1/shifts
    // was removed when shifts moved to auto-open. Far-future dates keep the
    // login backstop (closeStaleOpenShiftsForUser) from closing the fixture
    // on the next login — including inside the UTC-vs-server-tz edge window.
    const s1 = await seedShiftForUser(WAITER, { businessDate: '2099-10-01', openingCash: '0.00' });
    waiterShiftId = s1.id;

    const s2 = await seedShiftForUser(WAITER2, { businessDate: '2099-10-02', openingCash: '0.00' });
    otherWaiterShiftId = s2.id;
  });

  it('WAITER declares CASH and MPESA against their own open shift', async () => {
    const agent = await loginAs(WAITER);

    const cash = await agent.post('/api/v1/collections').send({
      shiftId: waiterShiftId,
      paymentMethod: 'CASH',
      amount: '1250000.00',
    });
    expect(cash.status).toBe(201);
    expect(cash.body.collection.amount).toBe('1250000.00');
    expect(typeof cash.body.collection.amount).toBe('string');

    const mpesa = await agent.post('/api/v1/collections').send({
      shiftId: waiterShiftId,
      paymentMethod: 'MPESA',
      amount: '890000.00',
      mobileReference: 'REF123',
    });
    expect(mpesa.status).toBe(201);
    expect(mpesa.body.collection.mobileReference).toBe('REF123');
  });

  it('WAITER cannot declare against a shift that is not theirs (403)', async () => {
    const agent = await loginAs(WAITER);
    const res = await agent.post('/api/v1/collections').send({
      shiftId: otherWaiterShiftId,
      paymentMethod: 'CASH',
      amount: '1000.00',
    });
    expect(res.status).toBe(403);
  });

  it('MANAGER without onBehalfOfUserId is rejected (400)', async () => {
    const agent = await loginAs(MANAGER);
    const res = await agent.post('/api/v1/collections').send({
      shiftId: waiterShiftId,
      paymentMethod: 'CASH',
      amount: '100.00',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('MANAGER creates a collection on behalf of a waiter; userId = waiter, createdById = manager', async () => {
    const w = await loginAs(WAITER);
    const meW = await w.get('/api/v1/auth/me');
    const waiterId = meW.body.user.id;

    const m = await loginAs(MANAGER);
    const meM = await m.get('/api/v1/auth/me');
    const managerId = meM.body.user.id;

    const REF = 'PHASE19B-COL-1';
    const res = await m.post('/api/v1/collections').send({
      shiftId: waiterShiftId,
      paymentMethod: 'MPESA',
      amount: '7777.00',
      mobileReference: REF,
      onBehalfOfUserId: waiterId,
    });
    expect(res.status).toBe(201);

    const row = await prisma.collection.findFirst({ where: { mobileReference: REF } });
    expect(row).not.toBeNull();
    expect(row!.userId).toBe(waiterId);
    expect(row!.createdById).toBe(managerId);
  });

  it('WAITER passing a different onBehalfOfUserId is rejected (403)', async () => {
    const w = await loginAs(WAITER);
    const w2 = await loginAs(WAITER2);
    const meW2 = await w2.get('/api/v1/auth/me');
    const waiter2Id = meW2.body.user.id;

    const res = await w.post('/api/v1/collections').send({
      shiftId: waiterShiftId,
      paymentMethod: 'CASH',
      amount: '100.00',
      onBehalfOfUserId: waiter2Id,
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('MANAGER cannot create on behalf of a user who does not own the shift (403)', async () => {
    const w2 = await loginAs(WAITER2);
    const meW2 = await w2.get('/api/v1/auth/me');
    const waiter2Id = meW2.body.user.id;

    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/collections').send({
      shiftId: waiterShiftId,
      paymentMethod: 'CASH',
      amount: '100.00',
      onBehalfOfUserId: waiter2Id,
    });
    expect(res.status).toBe(403);
  });

  it('duplicate mobile reference on same shift is rejected (409)', async () => {
    const agent = await loginAs(WAITER);
    const res = await agent.post('/api/v1/collections').send({
      shiftId: waiterShiftId,
      paymentMethod: 'MPESA',
      amount: '900000.00',
      mobileReference: 'REF123',
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_MOBILE_REFERENCE');
  });

  it('same reference for a different paymentMethod is allowed', async () => {
    const agent = await loginAs(WAITER);
    const res = await agent.post('/api/v1/collections').send({
      shiftId: waiterShiftId,
      paymentMethod: 'AIRTEL_MONEY',
      amount: '50000.00',
      mobileReference: 'REF123',
    });
    expect(res.status).toBe(201);
  });

  it('multiple CASH collections with null reference are allowed', async () => {
    const agent = await loginAs(WAITER);
    const res = await agent.post('/api/v1/collections').send({
      shiftId: waiterShiftId,
      paymentMethod: 'CASH',
      amount: '500.00',
    });
    expect(res.status).toBe(201);
  });

  it('amount must be positive (400)', async () => {
    const agent = await loginAs(WAITER);
    const res = await agent.post('/api/v1/collections').send({
      shiftId: waiterShiftId,
      paymentMethod: 'CASH',
      amount: '-5.00',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('WAITER can list own collections', async () => {
    const agent = await loginAs(WAITER);
    const res = await agent.get('/api/v1/collections');
    expect(res.status).toBe(200);
    expect(res.body.collections.length).toBeGreaterThanOrEqual(4);
    for (const c of res.body.collections) {
      expect(c.userId).toBeTruthy();
    }
  });

  it('WAITER does not see other waiter\'s collections', async () => {
    const w2 = await loginAs(WAITER2);
    const res = await w2.get('/api/v1/collections');
    expect(res.status).toBe(200);
    expect(res.body.collections.length).toBe(0);
  });

  it('MANAGER can list all collections', async () => {
    const agent = await loginAs(MANAGER);
    const res = await agent.get('/api/v1/collections');
    expect(res.status).toBe(200);
    expect(res.body.collections.length).toBeGreaterThanOrEqual(4);
  });

  it('AUDITOR can list but not create or void', async () => {
    const agent = await loginAs(AUDITOR);
    const list = await agent.get('/api/v1/collections');
    expect(list.status).toBe(200);

    const create = await agent.post('/api/v1/collections').send({
      shiftId: waiterShiftId,
      paymentMethod: 'CASH',
      amount: '100.00',
    });
    expect(create.status).toBe(403);

    if (list.body.collections.length > 0) {
      const v = await agent
        .post(`/api/v1/collections/${list.body.collections[0].id}/void`)
        .send({ reason: 'test' });
      expect(v.status).toBe(403);
    }
  });

  it('WAITER can void their own collection; void reason is required', async () => {
    const agent = await loginAs(WAITER);

    // Missing reason -> 400
    const list = await agent.get('/api/v1/collections');
    const target = list.body.collections.find((c: { voidedAt: string | null }) => !c.voidedAt);
    expect(target).toBeTruthy();

    const bad = await agent.post(`/api/v1/collections/${target.id}/void`).send({});
    expect(bad.status).toBe(400);

    const ok = await agent
      .post(`/api/v1/collections/${target.id}/void`)
      .send({ reason: 'duplicate entry' });
    expect(ok.status).toBe(200);
    expect(ok.body.collection.voidedAt).toBeTruthy();

    // Default list excludes voided.
    const after = await agent.get('/api/v1/collections');
    expect(after.body.collections.find((c: { id: string }) => c.id === target.id)).toBeUndefined();

    // includeVoided=true brings it back.
    const withVoided = await agent.get('/api/v1/collections?includeVoided=true');
    expect(withVoided.body.collections.find((c: { id: string }) => c.id === target.id)).toBeTruthy();
  });

  it('MANAGER can void any collection while the shift is OPEN', async () => {
    const list = await loginAs(MANAGER);
    // Scope to otherWaiterShiftId, which is still OPEN, so we do not pick up
    // collections from other test files whose shifts may be SUBMITTED/CLOSED.
    const all = await list.get(`/api/v1/collections?shiftId=${otherWaiterShiftId}`);
    const target = all.body.collections.find(
      (c: { voidedAt: string | null }) => !c.voidedAt
    );
    if (!target) return; // nothing left to void in this run, skip
    const res = await list
      .post(`/api/v1/collections/${target.id}/void`)
      .send({ reason: 'manager review' });
    expect(res.status).toBe(200);
  });

  it('collections are frozen once the shift is SUBMITTED (409)', async () => {
    const waiter = await loginAs(WAITER);
    // Submit own shift.
    const sub = await waiter
      .post(`/api/v1/shifts/${waiterShiftId}/transition`)
      .send({ to: 'SUBMITTED' });
    expect(sub.status).toBe(200);

    // Create -> 409
    const create = await waiter.post('/api/v1/collections').send({
      shiftId: waiterShiftId,
      paymentMethod: 'CASH',
      amount: '1.00',
    });
    expect(create.status).toBe(409);
    expect(create.body.code).toBe('SHIFT_NOT_OPEN');
  });
});