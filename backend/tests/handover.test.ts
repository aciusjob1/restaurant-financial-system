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
const ON_BEHALF_WAITER = { username: 'phase19b-waiter-a', password: 'WaiterPassword!234', fullName: 'Phase 19b Waiter A', role: 'WAITER' as const };
const ON_BEHALF_WAITER2 = { username: 'phase19b-waiter-b', password: 'WaiterPassword!234', fullName: 'Phase 19b Waiter B', role: 'WAITER' as const };
const ALL = [OWNER, MANAGER, WAITER, WAITER2, AUDITOR, ON_BEHALF_WAITER, ON_BEHALF_WAITER2];

const TEST_DATE = '2099-12-10';
const ON_BEHALF_DATE = '2099-12-13';
const NO_RECON_DATE = '2099-12-14';

// Shared shift ids: each waiter may only have one active (non-CLOSED) shift,
// so later describes must reuse shifts opened by earlier describes instead of
// opening new ones. Populated by the describes that open them.
let sharedWaiter2ShiftId: string = '' ;
let sharedOnBehalfWaiterShiftId: string = '' ;

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

async function currentUserId(agent: request.SuperAgentTest): Promise<string> {
  const me = await agent.get('/api/v1/auth/me');
  expect(me.status).toBe(200);
  return me.body.user.id;
}

// ============================================================
// Happy path
// ============================================================
describe('Cash handover - happy path', () => {
  let shiftId: string;
  let reconId: string;
  let handoverId: string;

  it('waiter opens shift, declares cash, submits, reconciles, submits reconciliation', async () => {
    const w = await loginAs(WAITER);
    const s = await w.post('/api/v1/shifts').send({ businessDate: TEST_DATE, openingCash: '0.00' });
    expect(s.status).toBe(201);
    shiftId = s.body.shift.id;

    const c = await w.post('/api/v1/collections').send({
      shiftId, paymentMethod: 'CASH', amount: '125000.00',
    });
    expect(c.status).toBe(201);

    const t = await w.post('/api/v1/shifts/' + shiftId + '/transition').send({ to: 'SUBMITTED' });
    expect(t.status).toBe(200);

    const r = await w.post('/api/v1/reconciliations').send({ shiftId });
    expect(r.status).toBe(201);
    reconId = r.body.reconciliation.id;

    const p = await w.patch('/api/v1/reconciliations/' + reconId).send({
      actualCash: '125000.00',
      actualMobile: '0.00',
    });
    expect(p.status).toBe(200);

    const sub = await w.post('/api/v1/reconciliations/' + reconId + '/submit').send({});
    expect(sub.status).toBe(200);
  });

  it('waiter creates handover; amount is client-supplied and echoed', async () => {
    const w = await loginAs(WAITER);
    const m = await loginAs(MANAGER);
    const managerId = await currentUserId(m);

    const res = await w.post('/api/v1/handovers').send({
      shiftId,
      amount: '124500.00',
      toUserId: managerId,
      notes: 'handing over 124,500 in cash',
    });
    expect(res.status).toBe(201);
    expect(res.body.handover.amount).toBe('124500.00');
    expect(res.body.handover.status).toBe('PENDING');
    expect(res.body.handover.shiftId).toBe(shiftId);
    expect(res.body.handover.fromUserId).toBeTruthy();
    expect(res.body.handover.toUserId).toBe(managerId);
    handoverId = res.body.handover.id;
  });

  it('handover carries the shift reconciliation as a snapshot', async () => {
    const row = await prisma.cashHandover.findUnique({ where: { id: handoverId } });
    expect(row).not.toBeNull();
    expect(row!.reconciliationId).toBe(reconId);
    expect(row!.shiftId).toBe(shiftId);
  });

  it('manager confirms the handover', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/handovers/' + handoverId + '/confirm').send({
      confirmedNotes: 'received in full',
    });
    expect(res.status).toBe(200);
    expect(res.body.handover.status).toBe('CONFIRMED');
    expect(res.body.handover.confirmedAt).toBeTruthy();
    expect(res.body.handover.confirmedNotes).toBe('received in full');
  });

  it('cannot confirm a confirmed handover again (409)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/handovers/' + handoverId + '/confirm').send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_TRANSITION');
  });

  it('two handovers on the same shift both succeed (no uniqueness)', async () => {
    const w = await loginAs(WAITER);
    const m = await loginAs(MANAGER);
    const managerId = await currentUserId(m);

    const res = await w.post('/api/v1/handovers').send({
      shiftId,
      amount: '500.00',
      toUserId: managerId,
    });
    expect(res.status).toBe(201);
    expect(res.body.handover.amount).toBe('500.00');

    const count = await prisma.cashHandover.count({ where: { shiftId } });
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================
// No reconciliation linkage
// ============================================================
describe('Cash handover - no reconciliation linkage', () => {
  let noReconShiftId: string;

  it('waiter2 opens a shift without creating a reconciliation', async () => {
    const w2 = await loginAs(WAITER2);
    const s = await w2.post('/api/v1/shifts').send({
      businessDate: NO_RECON_DATE, openingCash: '0.00',
    });
    expect(s.status).toBe(201);
    noReconShiftId = s.body.shift.id;
    sharedWaiter2ShiftId = noReconShiftId;
  });

  it('waiter2 creates a handover without a reconciliation; reconciliationId is null', async () => {
    const w2 = await loginAs(WAITER2);
    const m = await loginAs(MANAGER);
    const managerId = await currentUserId(m);

    const res = await w2.post('/api/v1/handovers').send({
      shiftId: noReconShiftId,
      amount: '7777.00',
      toUserId: managerId,
    });
    expect(res.status).toBe(201);
    expect(res.body.handover.amount).toBe('7777.00');
    expect(res.body.handover.reconciliationId).toBeNull();
    expect(res.body.handover.shiftId).toBe(noReconShiftId);
  });
});

// ============================================================
// Preconditions and permissions
// ============================================================
describe('Cash handover - preconditions and permissions', () => {
  let otherHandoverId: string;

  it('rejects a handover whose receiver is a WAITER (400)', async () => {
    const w2 = await loginAs(WAITER2);
    const w = await loginAs(WAITER);
    const waiterId = await currentUserId(w);

    const res = await w2.post('/api/v1/handovers').send({
      shiftId: sharedWaiter2ShiftId,
      amount: '100.00',
      toUserId: waiterId,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_RECEIVER');
  });

  it('waiter cannot create a handover for another waiter shift (403)', async () => {
    const w1 = await loginAs(WAITER);
    const m = await loginAs(MANAGER);
    const managerId = await currentUserId(m);

    const res = await w1.post('/api/v1/handovers').send({
      shiftId: sharedWaiter2ShiftId,
      amount: '100.00',
      toUserId: managerId,
    });
    expect(res.status).toBe(403);
  });

  it('MANAGER without onBehalfOfUserId is rejected (400)', async () => {
    const m = await loginAs(MANAGER);
    const managerId = await currentUserId(m);

    const res = await m.post('/api/v1/handovers').send({
      shiftId: sharedWaiter2ShiftId,
      amount: '100.00',
      toUserId: managerId,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('WAITER cannot confirm a handover (403)', async () => {
    const w2 = await loginAs(WAITER2);
    const m = await loginAs(MANAGER);
    const managerId = await currentUserId(m);

    const create = await w2.post('/api/v1/handovers').send({
      shiftId: sharedWaiter2ShiftId,
      amount: '200.00',
      toUserId: managerId,
    });
    expect(create.status).toBe(201);
    otherHandoverId = create.body.handover.id;

    const confirm = await w2
      .post('/api/v1/handovers/' + otherHandoverId + '/confirm')
      .send({});
    expect(confirm.status).toBe(403);
  });

  it('AUDITOR can list but cannot create or confirm', async () => {
    const a = await loginAs(AUDITOR);
    const list = await a.get('/api/v1/handovers');
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.handovers)).toBe(true);

    const create = await a.post('/api/v1/handovers').send({
      shiftId: 'x', amount: '1.00', toUserId: 'y',
    });
    expect(create.status).toBe(403);

    if (list.body.handovers.length > 0) {
      const id = list.body.handovers[0].id;
      const confirm = await a.post('/api/v1/handovers/' + id + '/confirm').send({});
      expect(confirm.status).toBe(403);
    }
  });

  it('WAITER list is restricted to handovers they sent', async () => {
    const w = await loginAs(WAITER);
    const list = await w.get('/api/v1/handovers');
    expect(list.status).toBe(200);
    const waiterId = await currentUserId(w);
    for (const h of list.body.handovers) {
      expect(h.fromUserId).toBe(waiterId);
    }
  });
});

// ============================================================
// Receiver list
// ============================================================
describe('Cash handover - receiver list for the kiosk', () => {
  it('WAITER can fetch the reduced receiver list (active MANAGER/OWNER only)', async () => {
    const w = await loginAs(WAITER);
    const res = await w.get('/api/v1/handovers/receivable-users');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.users)).toBe(true);
    for (const u of res.body.users) {
      expect(['MANAGER', 'OWNER']).toContain(u.role);
      expect(u).toHaveProperty('id');
      expect(u).toHaveProperty('fullName');
      expect(u).toHaveProperty('role');
      expect(u).not.toHaveProperty('email');
      expect(u).not.toHaveProperty('phone');
      expect(u).not.toHaveProperty('isActive');
      expect(u).not.toHaveProperty('passwordHash');
    }
    const names = res.body.users.map((u: { fullName: string }) => u.fullName);
    expect(names).toContain(MANAGER.fullName);
    expect(names).toContain(OWNER.fullName);
    expect(names).not.toContain(WAITER.fullName);
    expect(names).not.toContain(AUDITOR.fullName);
  });

  it('the returned IDs are usable as toUserId when creating a handover', async () => {
    const w = await loginAs(WAITER);
    const res = await w.get('/api/v1/handovers/receivable-users');
    expect(res.status).toBe(200);
    expect(res.body.users.length).toBeGreaterThan(0);
    expect(typeof res.body.users[0].id).toBe('string');
    expect(res.body.users[0].id.length).toBeGreaterThan(0);
  });
});

// ============================================================
// On behalf (Phase 19b, updated for Model 2)
// ============================================================
describe('Cash handover - on behalf', () => {
  let onBehalfShiftId: string;

  it('on-behalf waiter2 opens a shift', async () => {
    const w2 = await loginAs(ON_BEHALF_WAITER2);
    const s = await w2.post('/api/v1/shifts').send({
      businessDate: ON_BEHALF_DATE, openingCash: '0.00',
    });
    expect(s.status).toBe(201);
    onBehalfShiftId = s.body.shift.id;
  });

  it('MANAGER creates a handover on behalf of a waiter; fromUserId = waiter, createdById = manager', async () => {
    const w2 = await loginAs(ON_BEHALF_WAITER2);
    const waiter2Id = await currentUserId(w2);
    const m = await loginAs(MANAGER);
    const managerId = await currentUserId(m);

    const res = await m.post('/api/v1/handovers').send({
      shiftId: onBehalfShiftId,
      amount: '30000.00',
      toUserId: managerId,
      onBehalfOfUserId: waiter2Id,
    });
    expect(res.status).toBe(201);
    expect(res.body.handover.amount).toBe('30000.00');
    expect(res.body.handover.status).toBe('PENDING');

    const row = await prisma.cashHandover.findFirst({
      where: { shiftId: onBehalfShiftId },
    });
    expect(row).not.toBeNull();
    expect(row!.fromUserId).toBe(waiter2Id);
    expect(row!.createdById).toBe(managerId);
    expect(row!.toUserId).toBe(managerId);
  });

  it('MANAGER who created on behalf confirms the handover (200)', async () => {
    const m = await loginAs(MANAGER);
    const list = await m.get('/api/v1/handovers?shiftId=' + onBehalfShiftId);
    expect(list.status).toBe(200);
    expect(list.body.handovers.length).toBeGreaterThan(0);
    const handoverId = list.body.handovers[0].id;

    const res = await m.post('/api/v1/handovers/' + handoverId + '/confirm').send({});
    expect(res.status).toBe(200);
    expect(res.body.handover.status).toBe('CONFIRMED');
  });

  it('OWNER creates a handover on behalf of a waiter; stores shift id for later describes', async () => {
    const w = await loginAs(ON_BEHALF_WAITER);
    const s = await w.post('/api/v1/shifts').send({
      businessDate: '2099-12-15', openingCash: '0.00',
    });
    expect(s.status).toBe(201);
    const shiftId = s.body.shift.id;
    sharedOnBehalfWaiterShiftId = shiftId;

    const waiterId = await currentUserId(w);
    const o = await loginAs(OWNER);
    const ownerId = await currentUserId(o);

    const res = await o.post('/api/v1/handovers').send({
      shiftId,
      amount: '40000.00',
      toUserId: ownerId,
      onBehalfOfUserId: waiterId,
    });
    expect(res.status).toBe(201);

    const row = await prisma.cashHandover.findFirst({ where: { shiftId } });
    expect(row).not.toBeNull();
    expect(row!.fromUserId).toBe(waiterId);
    expect(row!.createdById).toBe(ownerId);
  });
});

// ============================================================
// Voiding
// ============================================================
describe('Cash handover - voiding', () => {
  let voidHandoverId: string;

  it('MANAGER creates a second handover on the on-behalf shift for void testing', async () => {
    const w = await loginAs(ON_BEHALF_WAITER);
    const waiterId = await currentUserId(w);
    const m = await loginAs(MANAGER);
    const managerId = await currentUserId(m);

    const res = await m.post('/api/v1/handovers').send({
      shiftId: sharedOnBehalfWaiterShiftId,
      amount: '1000.00',
      toUserId: managerId,
      onBehalfOfUserId: waiterId,
    });
    expect(res.status).toBe(201);
    voidHandoverId = res.body.handover.id;
  });

  it('WAITER cannot void a handover (403)', async () => {
    const w = await loginAs(ON_BEHALF_WAITER);
    const res = await w.post('/api/v1/handovers/' + voidHandoverId + '/void').send({
      reason: 'try to void as waiter',
    });
    expect(res.status).toBe(403);
  });

  it('MANAGER voids a PENDING handover; voidedAt/voidedBy/voidReason set', async () => {
    const m = await loginAs(MANAGER);
    const managerId = await currentUserId(m);

    const res = await m.post('/api/v1/handovers/' + voidHandoverId + '/void').send({
      reason: 'entered by mistake',
    });
    expect(res.status).toBe(200);
    expect(res.body.handover.voidedAt).toBeTruthy();
    expect(res.body.handover.voidedBy).toBe(managerId);
    expect(res.body.handover.voidReason).toBe('entered by mistake');
  });

  it('cannot confirm a voided handover (409)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/handovers/' + voidHandoverId + '/confirm').send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('HANDOVER_VOIDED');
  });

  it('voided handover is hidden from default list, visible with includeVoided=true', async () => {
    const m = await loginAs(MANAGER);
    const def = await m.get('/api/v1/handovers?shiftId=' + sharedOnBehalfWaiterShiftId);
    expect(def.status).toBe(200);
    const defIds = def.body.handovers.map((h: { id: string }) => h.id);
    expect(defIds).not.toContain(voidHandoverId);

    const withVoided = await m.get('/api/v1/handovers?shiftId=' + sharedOnBehalfWaiterShiftId + '&includeVoided=true');
    expect(withVoided.status).toBe(200);
    const allIds = withVoided.body.handovers.map((h: { id: string }) => h.id);
    expect(allIds).toContain(voidHandoverId);
  });
});

describe('Owner autoConfirmHandovers preference', () => {
  it('OWNER with autoConfirmHandovers ON creates a CONFIRMED handover', async () => {
    const o = await loginAs(OWNER);
    const oId = await currentUserId(o);
    await o.patch('/api/v1/auth/me').send({ autoConfirmHandovers: true });

    const w = await loginAs(ON_BEHALF_WAITER);
    const waiterId = await currentUserId(w);

    const res = await o.post('/api/v1/handovers').send({
      shiftId: sharedOnBehalfWaiterShiftId,
      amount: '99.00',
      toUserId: oId,
      onBehalfOfUserId: waiterId,
    });
    expect(res.status).toBe(201);
    expect(res.body.handover.status).toBe('CONFIRMED');
    expect(res.body.handover.confirmedAt).toBeTruthy();

    await o.patch('/api/v1/auth/me').send({ autoConfirmHandovers: false });
  });

  it('MANAGER with autoConfirmHandovers ON still creates a PENDING handover', async () => {
    const m = await loginAs(MANAGER);
    const mId = await currentUserId(m);
    await m.patch('/api/v1/auth/me').send({ autoConfirmHandovers: true });

    const w = await loginAs(ON_BEHALF_WAITER);
    const waiterId = await currentUserId(w);

    const res = await m.post('/api/v1/handovers').send({
      shiftId: sharedOnBehalfWaiterShiftId,
      amount: '88.00',
      toUserId: mId,
      onBehalfOfUserId: waiterId,
    });
    expect(res.status).toBe(201);
    expect(res.body.handover.status).toBe('PENDING');
    expect(res.body.handover.confirmedAt).toBeNull();

    await m.patch('/api/v1/auth/me').send({ autoConfirmHandovers: false });
  });
});