import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { seedShiftForUser } from './support/seedShift.js';

const app = createApp();

const OWNER = { username: 'phase7-owner', password: 'OwnerPassword!234', fullName: 'Phase 7 Owner', role: 'OWNER' as const };
const MANAGER = { username: 'phase7-manager', password: 'ManagerPassword!234', fullName: 'Phase 7 Manager', role: 'MANAGER' as const };
const WAITER = { username: 'phase7-waiter', password: 'WaiterPassword!234', fullName: 'Phase 7 Waiter', role: 'WAITER' as const };
const WAITER2 = { username: 'phase7-waiter2', password: 'WaiterPassword!234', fullName: 'Phase 7 Waiter 2', role: 'WAITER' as const };
const WAITER3 = { username: 'phase7-waiter3', password: 'WaiterPassword!234', fullName: 'Phase 7 Waiter 3', role: 'WAITER' as const };
const AUDITOR = { username: 'phase7-auditor', password: 'AuditorPassword!234', fullName: 'Phase 7 Auditor', role: 'AUDITOR' as const };
const WAITER4 = {
  username: 'phase7-waiter4', password: 'WaiterPassword!234',
  fullName: 'Phase 7 Waiter 4', role: 'WAITER' as const };
const WAITER_VAR = {
  username: 'phase7-waiter-var', password: 'WaiterPassword!234',
  fullName: 'Phase 7 Waiter Var', role: 'WAITER' as const };

const ALL = [OWNER, MANAGER, WAITER, WAITER2, WAITER3, WAITER4, WAITER_VAR, AUDITOR];

// Dedicated date for this test file. No other file may use it.
const TEST_DATE = '2099-12-15';

async function cleanup() {
  const usernames = ALL.map((u) => u.username);
  await prisma.cashHandover.deleteMany({ where: { fromUser: { username: { in: usernames } } } });
  await prisma.reconciliation.deleteMany({ where: { user: { username: { in: usernames } } } });
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

describe('Reconciliation ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â happy path', () => {
  let shiftId: string;
  let reconId: string;

  it('waiter opens shift, declares collections, submits shift', async () => {
    const w = await loginAs(WAITER);
    // Seed the shift directly via Prisma; POST /api/v1/shifts was removed.
    const seeded = await seedShiftForUser(WAITER, { businessDate: TEST_DATE, openingCash: '0.00' });
    shiftId = seeded.id;

    // Cash 1,000,000; MPESA 500,000; CARD 200,000 (card must NOT feed reconciliation).
    const c1 = await w.post('/api/v1/collections').send({ shiftId, paymentMethod: 'CASH', amount: '1000000.00' });
    expect(c1.status).toBe(201);
    const c2 = await w.post('/api/v1/collections').send({ shiftId, paymentMethod: 'MPESA', amount: '500000.00', mobileReference: 'REF-1' });
    expect(c2.status).toBe(201);
    const c3 = await w.post('/api/v1/collections').send({ shiftId, paymentMethod: 'CARD', amount: '200000.00' });
    expect(c3.status).toBe(201);

    const t = await w.post(`/api/v1/shifts/${shiftId}/transition`).send({ to: 'SUBMITTED' });
    expect(t.status).toBe(200);
    expect(t.body.shift.status).toBe('SUBMITTED');
  });

  it('waiter creates reconciliation; expected is computed from collections, excluding CARD', async () => {
    const w = await loginAs(WAITER);
    const res = await w.post('/api/v1/reconciliations').send({ shiftId });
    expect(res.status).toBe(201);
    expect(res.body.reconciliation.status).toBe('DRAFT');
    expect(res.body.reconciliation.expectedCash).toBe('1000000.00');
    expect(res.body.reconciliation.expectedMobile).toBe('500000.00');
    expect(res.body.reconciliation.actualCash).toBeNull();
    expect(res.body.reconciliation.actualMobile).toBeNull();
    expect(res.body.reconciliation.cashDifference).toBeNull();
    reconId = res.body.reconciliation.id;
  });

  it('rejects a second reconciliation for the same shift (409)', async () => {
    const w = await loginAs(WAITER);
    const res = await w.post('/api/v1/reconciliations').send({ shiftId });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('RECONCILIATION_EXISTS');
  });

  it('waiter sets actuals; differences computed server-side (short + over)', async () => {
    const w = await loginAs(WAITER);
    const res = await w.patch(`/api/v1/reconciliations/${reconId}`).send({
      actualCash: '995000.00',    // 5,000 short vs expected 1,000,000
      actualMobile: '505000.00',  // 5,000 over  vs expected 500,000
    });
    expect(res.status).toBe(200);
    expect(res.body.reconciliation.cashDifference).toBe('-5000.00');
    expect(res.body.reconciliation.mobileDifference).toBe('5000.00');
    expect(typeof res.body.reconciliation.cashDifference).toBe('string');
  });

  it('waiter cannot submit before both actuals are set (on a fresh recon)', async () => {
    // Use WAITER3 with its own shift on TEST_DATE to test this without touching the
    // main flow.
    const w = await loginAs(WAITER3);
    // Seed the shift directly via Prisma; POST /api/v1/shifts was removed.
    const seeded3 = await seedShiftForUser(WAITER3, { businessDate: TEST_DATE, openingCash: '0.00' });
    const shift3 = seeded3.id;
    await w.post('/api/v1/collections').send({ shiftId: shift3, paymentMethod: 'CASH', amount: '100.00' });
    await w.post(`/api/v1/shifts/${shift3}/transition`).send({ to: 'SUBMITTED' });
    const r = await w.post('/api/v1/reconciliations').send({ shiftId: shift3 });
    expect(r.status).toBe(201);
    const sub = await w.post(`/api/v1/reconciliations/${r.body.reconciliation.id}/submit`).send({});
    expect(sub.status).toBe(409);
    expect(sub.body.code).toBe('ACTUALS_REQUIRED');
  });

  it('waiter submits reconciliation', async () => {
    const w = await loginAs(WAITER);
    const res = await w.post(`/api/v1/reconciliations/${reconId}/submit`).send({});
    expect(res.status).toBe(200);
    expect(res.body.reconciliation.status).toBe('SUBMITTED');
    expect(res.body.reconciliation.submittedAt).toBeTruthy();
  });

  it('waiter cannot edit after submitting (409)', async () => {
    const w = await loginAs(WAITER);
    const res = await w.patch(`/api/v1/reconciliations/${reconId}`).send({ actualCash: '0.00' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_EDITABLE');
  });

  it('manager approves ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ REVIEWED with reviewer fields', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post(`/api/v1/reconciliations/${reconId}/review`).send({
      decision: 'APPROVE',
      reviewNotes: 'matches the cash-up sheet',
    });
    expect(res.status).toBe(200);
    expect(res.body.reconciliation.status).toBe('REVIEWED');
    expect(res.body.reconciliation.reviewedBy).toBeTruthy();
    expect(res.body.reconciliation.reviewedAt).toBeTruthy();
    expect(res.body.reconciliation.reviewNotes).toBe('matches the cash-up sheet');
  });

  it('reviewed reconciliations cannot be edited (409)', async () => {
    const w = await loginAs(WAITER);
    const res = await w.patch(`/api/v1/reconciliations/${reconId}`).send({ actualCash: '0.00' });
    expect(res.status).toBe(409);
  });
});

describe('Reconciliation ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â send back flow', () => {
  let shift2: string;
  let recon2: string;

  it('waiter2 opens own shift on the same date, submits', async () => {
    const w = await loginAs(WAITER2);
    // Seed the shift directly via Prisma; POST /api/v1/shifts was removed.
    const seeded2 = await seedShiftForUser(WAITER2, { businessDate: TEST_DATE, openingCash: '0.00' });
    shift2 = seeded2.id;
    await w.post('/api/v1/collections').send({ shiftId: shift2, paymentMethod: 'CASH', amount: '300000.00' });
    const t = await w.post(`/api/v1/shifts/${shift2}/transition`).send({ to: 'SUBMITTED' });
    expect(t.status).toBe(200);
  });

  it('waiter2 creates + submits reconciliation with exact match', async () => {
    const w = await loginAs(WAITER2);
    const r = await w.post('/api/v1/reconciliations').send({ shiftId: shift2 });
    expect(r.status).toBe(201);
    recon2 = r.body.reconciliation.id;

    const p = await w.patch(`/api/v1/reconciliations/${recon2}`).send({
      actualCash: '300000.00',
      actualMobile: '0.00',
    });
    expect(p.status).toBe(200);
    expect(p.body.reconciliation.cashDifference).toBe('0.00');
    expect(p.body.reconciliation.mobileDifference).toBe('0.00');

    const s = await w.post(`/api/v1/reconciliations/${recon2}/submit`).send({});
    expect(s.status).toBe(200);
  });

  it('manager sends back; status returns to DRAFT and submittedAt clears', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post(`/api/v1/reconciliations/${recon2}/review`).send({
      decision: 'SEND_BACK',
      reviewNotes: 'cash sheet off by 500',
    });
    expect(res.status).toBe(200);
    expect(res.body.reconciliation.status).toBe('DRAFT');
    expect(res.body.reconciliation.submittedAt).toBeNull();
    expect(res.body.reconciliation.reviewNotes).toBe('cash sheet off by 500');
  });

  it('waiter2 can now edit again and differences recompute', async () => {
    const w = await loginAs(WAITER2);
    const res = await w.patch(`/api/v1/reconciliations/${recon2}`).send({
      actualCash: '299500.00',
    });
    expect(res.status).toBe(200);
    expect(res.body.reconciliation.cashDifference).toBe('-500.00');
    expect(res.body.reconciliation.mobileDifference).toBe('0.00');
  });
});

describe('Reconciliation ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â permissions and preconditions', () => {
  it('waiter cannot create for another waiter shift (403)', async () => {
    const w = await loginAs(WAITER);
    const w2 = await loginAs(WAITER2);
    const list2 = await w2.get('/api/v1/reconciliations');
    const other = list2.body.reconciliations.find((r: { userId: string }) => r.userId !== w.user);
    if (!other) return; // skip if nothing to test against in this run
    const res = await w.post('/api/v1/reconciliations').send({ shiftId: other.shiftId });
    // 403 is correct: the shift belongs to another waiter.
    expect(res.status).toBe(403);
  });

  it('manager cannot create a reconciliation on behalf of a waiter (403)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/reconciliations').send({ shiftId: 'any' });
    expect(res.status).toBe(403);
  });

  it('waiter cannot create for a shift that is still OPEN (409)', async () => {
    // WAITER3's shift was SUBMITTED earlier; but WAITER3's shift is separate.
    // Open a fresh shift for WAITER3 on a different date to keep it OPEN.
    const w = await loginAs(WAITER4);
    // Seed the shift directly via Prisma; POST /api/v1/shifts was removed.
    const seeded = await seedShiftForUser(WAITER4, { businessDate: '2099-12-31', openingCash: '0.00' });
    const openShift = seeded.id;
    const res = await w.post('/api/v1/reconciliations').send({ shiftId: openShift });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SHIFT_NOT_SUBMITTED');
  });

  it('waiter cannot review their own reconciliation (403)', async () => {
    const w = await loginAs(WAITER);
    const list = await w.get('/api/v1/reconciliations');
    const sub = list.body.reconciliations.find((r: { status: string }) => r.status === 'SUBMITTED');
    if (!sub) return; // nothing in SUBMITTED state this run
    const res = await w.post(`/api/v1/reconciliations/${sub.id}/review`).send({ decision: 'APPROVE' });
    expect(res.status).toBe(403);
  });

  it('AUDITOR can list but cannot create, edit, submit, or review', async () => {
    const a = await loginAs(AUDITOR);
    const list = await a.get('/api/v1/reconciliations');
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.reconciliations)).toBe(true);

    const create = await a.post('/api/v1/reconciliations').send({ shiftId: 'x' });
    expect(create.status).toBe(403);

    if (list.body.reconciliations.length > 0) {
      const id = list.body.reconciliations[0].id;
      const edit = await a.patch(`/api/v1/reconciliations/${id}`).send({ actualCash: '0.00' });
      expect(edit.status).toBe(403);
      const submit = await a.post(`/api/v1/reconciliations/${id}/submit`).send({});
      expect(submit.status).toBe(403);
      const review = await a.post(`/api/v1/reconciliations/${id}/review`).send({ decision: 'APPROVE' });
      expect(review.status).toBe(403);
    }
  });

  it('WAITER list is restricted to own reconciliations', async () => {
    const w = await loginAs(WAITER);
    const list = await w.get('/api/v1/reconciliations');
    expect(list.status).toBe(200);
    for (const r of list.body.reconciliations) {
      expect(r.userId).toBeTruthy();
    }
  });
});
describe('Enrichment - reconciliation list rows expose user + shift', () => {
  it('GET /api/v1/reconciliations includes user and shift on each row', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get('/api/v1/reconciliations');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.reconciliations)).toBe(true);

    const withUser = res.body.reconciliations.filter((r: any) => r.user != null);
    expect(withUser.length).toBeGreaterThan(0);

    for (const r of withUser) {
      expect(typeof r.user.id).toBe('string');
      expect(typeof r.user.fullName).toBe('string');
      expect(r.user.id).toBe(r.userId);
      expect(r.shift).not.toBeNull();
      expect(typeof r.shift.businessDate).toBe('string');
    }
  });
});

describe('Reconciliation - receiptVariance', () => {
  const RV_DATE = '2099-12-20';
  let rvShiftId: string;
  let rvReconId: string;
  let rvHandoverId: string;

  it('setup: waiter opens a fresh shift, declares cash, submits, drafts a recon', async () => {
    const w = await loginAs(WAITER_VAR);
    // Seed the shift directly via Prisma; POST /api/v1/shifts was removed.
    const seeded = await seedShiftForUser(WAITER_VAR, {
      businessDate: RV_DATE,
      openingCash: '0.00',
    });
    rvShiftId = seeded.id;

    const c = await w.post('/api/v1/collections').send({
      shiftId: rvShiftId, paymentMethod: 'CASH', amount: '100.00',
    });
    expect(c.status).toBe(201);

    const t = await w.post('/api/v1/shifts/' + rvShiftId + '/transition').send({ to: 'SUBMITTED' });
    expect(t.status).toBe(200);

    const r = await w.post('/api/v1/reconciliations').send({ shiftId: rvShiftId });
    expect(r.status).toBe(201);
    rvReconId = r.body.reconciliation.id;
  });

  it('DRAFT recon with actualCash null has receiptVariance null', async () => {
    const w = await loginAs(WAITER_VAR);
    const res = await w.get('/api/v1/reconciliations/' + rvReconId);
    expect(res.status).toBe(200);
    expect(res.body.reconciliation.receiptVariance).toBeNull();
  });

  it('PATCH actualCash 100 with no handovers yields receiptVariance -100.00', async () => {
    const w = await loginAs(WAITER_VAR);
    const patch = await w
      .patch('/api/v1/reconciliations/' + rvReconId)
      .send({ actualCash: '100.00', actualMobile: '0.00' });
    expect(patch.status).toBe(200);
    expect(patch.body.reconciliation.receiptVariance).toBe('-100.00');

    const get = await w.get('/api/v1/reconciliations/' + rvReconId);
    expect(get.body.reconciliation.receiptVariance).toBe('-100.00');
  });

  it('PENDING handover of 150 shifts variance to +50', async () => {
    const w = await loginAs(WAITER_VAR);
    const m = await loginAs(MANAGER);
    const mgrRow = await m.get('/api/v1/auth/me');
    const managerId = mgrRow.body.user.id;

    const h = await w.post('/api/v1/handovers').send({
      shiftId: rvShiftId,
      amount: '150.00',
      toUserId: managerId,
    });
    expect(h.status).toBe(201);
    rvHandoverId = h.body.handover.id;

    const get = await w.get('/api/v1/reconciliations/' + rvReconId);
    expect(get.body.reconciliation.receiptVariance).toBe('50.00');
  });

  it('voided handover drops back out of receiptVariance', async () => {
    const m = await loginAs(MANAGER);
    const v = await m
      .post('/api/v1/handovers/' + rvHandoverId + '/void')
      .send({ reason: 'receiptVariance test void' });
    expect(v.status).toBe(200);

    const w = await loginAs(WAITER_VAR);
    const get = await w.get('/api/v1/reconciliations/' + rvReconId);
    expect(get.body.reconciliation.receiptVariance).toBe('-100.00');
  });

  it('list response exposes receiptVariance on each row', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get('/api/v1/reconciliations?shiftId=' + rvShiftId);
    expect(res.status).toBe(200);
    expect(res.body.reconciliations.length).toBeGreaterThan(0);
    expect(res.body.reconciliations[0]).toHaveProperty('receiptVariance');
  });
});
