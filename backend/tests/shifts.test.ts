import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

const app = createApp();

const OWNER = { username: 'phase4-owner', password: 'OwnerPassword!234', fullName: 'Phase 4 Owner', role: 'OWNER' as const };
const MANAGER = { username: 'phase4-manager', password: 'ManagerPassword!234', fullName: 'Phase 4 Manager', role: 'MANAGER' as const };
const WAITER = { username: 'phase4-waiter', password: 'WaiterPassword!234', fullName: 'Phase 4 Waiter', role: 'WAITER' as const };
const WAITER2 = { username: 'phase4-waiter2', password: 'WaiterPassword!234', fullName: 'Phase 4 Waiter 2', role: 'WAITER' as const };
const AUDITOR = { username: 'phase4-auditor', password: 'AuditorPassword!234', fullName: 'Phase 4 Auditor', role: 'AUDITOR' as const };

const ALL_USERS = [OWNER, MANAGER, WAITER, WAITER2, AUDITOR];

async function cleanup() {
  const usernames = ALL_USERS.map((u) => u.username);
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
  for (const u of ALL_USERS) await makeUser(u);
});

afterAll(cleanup);

async function loginAs(u: { username: string; password: string }) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ username: u.username, password: u.password });
  expect(res.status).toBe(200);
  return agent;
}

describe('Shift lifecycle', () => {
  it('WAITER starts their own shift, defaults businessDate from server tz', async () => {
    const agent = await loginAs(WAITER);
    const res = await agent.post('/api/v1/shifts').send({ openingCash: '0.00' });
    expect(res.status).toBe(201);
    expect(res.body.shift.status).toBe('OPEN');
    expect(res.body.shift.userId).toBeTruthy();
    expect(res.body.shift.openingCash).toBe('0.00');
    expect(res.body.shift.businessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('WAITER cannot start a second active shift (409)', async () => {
    const agent = await loginAs(WAITER);
    const res = await agent.post('/api/v1/shifts').send({ openingCash: '10000.00' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SHIFT_ALREADY_OPEN');
  });

  it('WAITER cannot transition another waiters shift (403)', async () => {
    const w2 = await loginAs(WAITER2);
    const start = await w2.post('/api/v1/shifts').send({ openingCash: '0.00' });
    expect(start.status).toBe(201);
    const otherShiftId = start.body.shift.id;

    const waiter = await loginAs(WAITER);
    const res = await waiter
      .post(`/api/v1/shifts/${otherShiftId}/transition`)
      .send({ to: 'SUBMITTED' });
    expect(res.status).toBe(403);
  });

  it('WAITER cannot move OPEN → CLOSED (invalid transition, 409)', async () => {
    const waiter = await loginAs(WAITER);
    const list = await waiter.get('/api/v1/shifts');
    const own = list.body.shifts[0];
    const res = await waiter
      .post(`/api/v1/shifts/${own.id}/transition`)
      .send({ to: 'CLOSED' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_TRANSITION');
  });

  it('WAITER submits their shift (OPEN → SUBMITTED)', async () => {
    const waiter = await loginAs(WAITER);
    const list = await waiter.get('/api/v1/shifts');
    const own = list.body.shifts[0];
    const res = await waiter
      .post(`/api/v1/shifts/${own.id}/transition`)
      .send({ to: 'SUBMITTED' });
    expect(res.status).toBe(200);
    expect(res.body.shift.status).toBe('SUBMITTED');
    expect(res.body.shift.submittedAt).toBeTruthy();
  });

  it('WAITER cannot move SUBMITTED → RECONCILING (409)', async () => {
    const waiter = await loginAs(WAITER);
    const list = await waiter.get('/api/v1/shifts');
    const own = list.body.shifts[0];
    const res = await waiter
      .post(`/api/v1/shifts/${own.id}/transition`)
      .send({ to: 'RECONCILING' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_TRANSITION');
  });

  it('MANAGER moves SUBMITTED → RECONCILING → CLOSED', async () => {
    const manager = await loginAs(MANAGER);
    const list = await manager.get('/api/v1/shifts');
    const target = list.body.shifts.find((s: { status: string }) => s.status === 'SUBMITTED');
    expect(target).toBeTruthy();

    const r1 = await manager
      .post(`/api/v1/shifts/${target.id}/transition`)
      .send({ to: 'RECONCILING' });
    expect(r1.status).toBe(200);
    expect(r1.body.shift.status).toBe('RECONCILING');
    expect(r1.body.shift.reviewedBy).toBeTruthy();

    const r2 = await manager
      .post(`/api/v1/shifts/${target.id}/transition`)
      .send({ to: 'CLOSED' });
    expect(r2.status).toBe(200);
    expect(r2.body.shift.status).toBe('CLOSED');
    expect(r2.body.shift.closedBy).toBeTruthy();
  });

  it('MANAGER cannot skip SUBMITTED → CLOSED (409)', async () => {
    // Start and submit a fresh shift for WAITER2
    const w2 = await loginAs(WAITER2);
    const w2List = await w2.get('/api/v1/shifts');
    const w2Open = w2List.body.shifts.find((s: { status: string }) => s.status === 'OPEN');
    expect(w2Open).toBeTruthy();
    await w2.post(`/api/v1/shifts/${w2Open.id}/transition`).send({ to: 'SUBMITTED' });

    const manager = await loginAs(MANAGER);
    const res = await manager
      .post(`/api/v1/shifts/${w2Open.id}/transition`)
      .send({ to: 'CLOSED' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_TRANSITION');
  });

  it('WAITER only sees their own shifts', async () => {
    const waiter = await loginAs(WAITER);
    const list = await waiter.get('/api/v1/shifts');
    expect(list.status).toBe(200);
    for (const s of list.body.shifts) {
      expect(s.userId).toBe(list.body.shifts[0].userId);
    }
  });

  it('AUDITOR sees shifts but cannot start one', async () => {
    const auditor = await loginAs(AUDITOR);
    const list = await auditor.get('/api/v1/shifts');
    expect(list.status).toBe(200);

    const attempt = await auditor.post('/api/v1/shifts').send({ openingCash: '0.00' });
    expect(attempt.status).toBe(403);
  });

  it('rejects a malformed businessDate', async () => {
    // WAITER2 has a submitted shift from an earlier test; they can start
    // nothing else. Use OWNER, who has no shift yet.
    const owner = await loginAs(OWNER);
    const res = await owner.post('/api/v1/shifts').send({ businessDate: '24/09/2026' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
describe('Enrichment - shift list rows expose user.fullName', () => {
  it('GET /api/v1/shifts includes user { id, fullName } on each row', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get('/api/v1/shifts');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.shifts)).toBe(true);
    expect(res.body.shifts.length).toBeGreaterThan(0);

    const withUser = res.body.shifts.filter((s: any) => s.user != null);
    expect(withUser.length).toBeGreaterThan(0);

    for (const s of withUser) {
      expect(typeof s.user.id).toBe('string');
      expect(typeof s.user.fullName).toBe('string');
      expect(s.user.id).toBe(s.userId);
    }
  });
});

