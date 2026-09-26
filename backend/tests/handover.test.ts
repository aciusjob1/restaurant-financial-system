import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

const app = createApp();

const OWNER = { username: 'phase8-owner', password: 'OwnerPassword!234', fullName: 'Phase 8 Owner', role: 'OWNER' as const };
const MANAGER = { username: 'phase8-manager', password: 'ManagerPassword!234', fullName: 'Phase 8 Manager', role: 'MANAGER' as const };
const WAITER = { username: 'phase8-waiter', password: 'WaiterPassword!234', fullName: 'Phase 8 Waiter', role: 'WAITER' as const };
const WAITER2 = { username: 'phase8-waiter2', password: 'WaiterPassword!234', fullName: 'Phase 8 Waiter 2', role: 'WAITER' as const };
const AUDITOR = { username: 'phase8-auditor', password: 'AuditorPassword!234', fullName: 'Phase 8 Auditor', role: 'AUDITOR' as const };
const ALL = [OWNER, MANAGER, WAITER, WAITER2, AUDITOR];

// Dedicated business date for this test file.
const TEST_DATE = '2099-12-10';

async function cleanup() {
  const usernames = ALL.map((u) => u.username);
  await prisma.cashHandover.deleteMany({
    where: { fromUser: { username: { in: usernames } } },
  });
  await prisma.reconciliation.deleteMany({
    where: { user: { username: { in: usernames } } },
  });
  await prisma.collection.deleteMany({
    where: { user: { username: { in: usernames } } },
  });
  await prisma.shift.deleteMany({
    where: { user: { username: { in: usernames } } },
  });
  await prisma.session.deleteMany({
    where: { user: { username: { in: usernames } } },
  });
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

describe('Cash handover — happy path', () => {
  let reconId: string;
  let handoverId: string;

  it('waiter opens shift, declares cash, submits, reconciles, submits reconciliation', async () => {
    const w = await loginAs(WAITER);
    const s = await w.post('/api/v1/shifts').send({ businessDate: TEST_DATE, openingCash: '0.00' });
    expect(s.status).toBe(201);
    const shiftId = s.body.shift.id;

    const c = await w.post('/api/v1/collections').send({
      shiftId, paymentMethod: 'CASH', amount: '125000.00',
    });
    expect(c.status).toBe(201);

    const t = await w.post(`/api/v1/shifts/${shiftId}/transition`).send({ to: 'SUBMITTED' });
    expect(t.status).toBe(200);

    const r = await w.post('/api/v1/reconciliations').send({ shiftId });
    expect(r.status).toBe(201);
    reconId = r.body.reconciliation.id;

    const p = await w.patch(`/api/v1/reconciliations/${reconId}`).send({
      actualCash: '125000.00',
      actualMobile: '0.00',
    });
    expect(p.status).toBe(200);

    const sub = await w.post(`/api/v1/reconciliations/${reconId}/submit`).send({});
    expect(sub.status).toBe(200);
  });

  it('waiter creates handover; amount is server-derived from actualCash', async () => {
    const w = await loginAs(WAITER);
    const m = await loginAs(MANAGER);
    const meMgr = await m.get('/api/v1/auth/me');
    const managerId = meMgr.body.user.id;

    const res = await w.post('/api/v1/handovers').send({
      reconciliationId: reconId,
      toUserId: managerId,
      notes: 'handing over 125,000 in cash',
    });
    expect(res.status).toBe(201);
    expect(res.body.handover.amount).toBe('125000.00');
    expect(res.body.handover.status).toBe('PENDING');
    expect(res.body.handover.fromUserId).toBeTruthy();
    expect(res.body.handover.toUserId).toBe(managerId);
    handoverId = res.body.handover.id;
  });

  it('rejects a second handover for the same reconciliation (409)', async () => {
    const w = await loginAs(WAITER);
    const m = await loginAs(MANAGER);
    const meMgr = await m.get('/api/v1/auth/me');
    const res = await w.post('/api/v1/handovers').send({
      reconciliationId: reconId,
      toUserId: meMgr.body.user.id,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('HANDOVER_EXISTS');
  });

  it('manager confirms the handover', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post(`/api/v1/handovers/${handoverId}/confirm`).send({
      confirmedNotes: 'received in full',
    });
    expect(res.status).toBe(200);
    expect(res.body.handover.status).toBe('CONFIRMED');
    expect(res.body.handover.confirmedAt).toBeTruthy();
    expect(res.body.handover.confirmedNotes).toBe('received in full');
  });

  it('cannot confirm a confirmed handover again (409)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post(`/api/v1/handovers/${handoverId}/confirm`).send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_TRANSITION');
  });
});

describe('Cash handover — preconditions and permissions', () => {
  let recon2: string;

  it('waiter2 sets up a reconciliation on the same date', async () => {
    const w = await loginAs(WAITER2);
    const s = await w.post('/api/v1/shifts').send({ businessDate: TEST_DATE, openingCash: '0.00' });
    expect(s.status).toBe(201);
    const shiftId = s.body.shift.id;

    await w.post('/api/v1/collections').send({
      shiftId, paymentMethod: 'CASH', amount: '50000.00',
    });
    await w.post(`/api/v1/shifts/${shiftId}/transition`).send({ to: 'SUBMITTED' });
    const r = await w.post('/api/v1/reconciliations').send({ shiftId });
    expect(r.status).toBe(201);
    recon2 = r.body.reconciliation.id;
  });

  it('rejects a handover from a DRAFT reconciliation (409)', async () => {
    const w = await loginAs(WAITER2);
    const m = await loginAs(MANAGER);
    const meMgr = await m.get('/api/v1/auth/me');
    const res = await w.post('/api/v1/handovers').send({
      reconciliationId: recon2,
      toUserId: meMgr.body.user.id,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('RECON_NOT_READY');
  });

  it('rejects a handover whose receiver is a WAITER (400)', async () => {
    // First get the reconciliation to SUBMITTED so the precondition passes.
    const w = await loginAs(WAITER2);
    await w.patch(`/api/v1/reconciliations/${recon2}`).send({
      actualCash: '50000.00', actualMobile: '0.00',
    });
    await w.post(`/api/v1/reconciliations/${recon2}/submit`).send({});

    const self = await w.get('/api/v1/auth/me');
    const res = await w.post('/api/v1/handovers').send({
      reconciliationId: recon2,
      toUserId: self.body.user.id,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_RECEIVER');
  });

  it('waiter cannot create a handover for another waiter reconciliation (403)', async () => {
    const w1 = await loginAs(WAITER);
    const m = await loginAs(MANAGER);
    const meMgr = await m.get('/api/v1/auth/me');
    const res = await w1.post('/api/v1/handovers').send({
      reconciliationId: recon2,
      toUserId: meMgr.body.user.id,
    });
    expect(res.status).toBe(403);
  });

  it('MANAGER cannot create a handover on behalf of a waiter (403)', async () => {
    const m = await loginAs(MANAGER);
    const meMgr = await m.get('/api/v1/auth/me');
    const res = await m.post('/api/v1/handovers').send({
      reconciliationId: recon2,
      toUserId: meMgr.body.user.id,
    });
    expect(res.status).toBe(403);
  });

  it('WAITER cannot confirm a handover (403)', async () => {
    // Create the handover first (as WAITER2)
    const w2 = await loginAs(WAITER2);
    const m = await loginAs(MANAGER);
    const meMgr = await m.get('/api/v1/auth/me');
    const create = await w2.post('/api/v1/handovers').send({
      reconciliationId: recon2,
      toUserId: meMgr.body.user.id,
    });
    expect(create.status).toBe(201);

    const confirm = await w2
      .post(`/api/v1/handovers/${create.body.handover.id}/confirm`)
      .send({});
    expect(confirm.status).toBe(403);
  });

  it('AUDITOR can list but cannot create or confirm', async () => {
    const a = await loginAs(AUDITOR);
    const list = await a.get('/api/v1/handovers');
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.handovers)).toBe(true);

    const create = await a.post('/api/v1/handovers').send({
      reconciliationId: 'x', toUserId: 'y',
    });
    expect(create.status).toBe(403);

    if (list.body.handovers.length > 0) {
      const id = list.body.handovers[0].id;
      const confirm = await a.post(`/api/v1/handovers/${id}/confirm`).send({});
      expect(confirm.status).toBe(403);
    }
  });

  it('WAITER list is restricted to handovers they sent', async () => {
    const w = await loginAs(WAITER);
    const list = await w.get('/api/v1/handovers');
    expect(list.status).toBe(200);
    const me = await w.get('/api/v1/auth/me');
    for (const h of list.body.handovers) {
      expect(h.fromUserId).toBe(me.body.user.id);
    }
  });
});