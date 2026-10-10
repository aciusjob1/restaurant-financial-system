import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { seedShiftForUser } from './support/seedShift.js';

const app = createApp();

const OWNER = { username: 'phase5-owner', password: 'OwnerPassword!234', fullName: 'Phase 5 Owner', role: 'OWNER' as const };
const MANAGER = { username: 'phase5-manager', password: 'ManagerPassword!234', fullName: 'Phase 5 Manager', role: 'MANAGER' as const };
const WAITER = { username: 'phase5-waiter', password: 'WaiterPassword!234', fullName: 'Phase 5 Waiter', role: 'WAITER' as const };
const AUDITOR = { username: 'phase5-auditor', password: 'AuditorPassword!234', fullName: 'Phase 5 Auditor', role: 'AUDITOR' as const };
const ALL = [OWNER, MANAGER, WAITER, AUDITOR];

// Dedicated business date. POSITIVE_DATE is where this file seeds exactly
// one shift and imports against it. CSV imports no longer require an active
// shift — the import path calls upsertSummary with userId: null.
const POSITIVE_DATE = '2099-12-30';

const REF_DETAILED = 'terminal-1-detailed';
const REF_AGGREGATE = 'terminal-2-aggregate';

async function cleanup() {
  const usernames = ALL.map((u) => u.username);
  await prisma.salesSummaryLine.deleteMany({
    where: {
      salesSummary: { sourceReference: { in: [REF_DETAILED, REF_AGGREGATE] } },
    },
  });
  await prisma.salesSummary.deleteMany({
    where: { sourceReference: { in: [REF_DETAILED, REF_AGGREGATE] } },
  });
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


const DETAILED_CSV = `businessDate,sourceReference,paymentMethod,amount,notes
${POSITIVE_DATE},terminal-1-detailed,CASH,1250000.00,
${POSITIVE_DATE},terminal-1-detailed,MPESA,890000.00,
${POSITIVE_DATE},terminal-1-detailed,CARD,410000.00,
`;

const AGGREGATE_CSV = `businessDate,sourceReference,cashSales,mobileSales,otherSales,notes
${POSITIVE_DATE},terminal-2-aggregate,900000.00,450000.00,150000.00,
`;

describe('Sales Summary — POS import', () => {

  it('OWNER imports a detailed CSV after opening a shift', async () => {
    // Manager opens a shift on POSITIVE_DATE so an active shift exists there.
    // Explicit businessDate avoids relying on today's date, which other tests use.
    // Seed an active shift on POSITIVE_DATE so the CSV import's
    // "active shift exists" check passes. POST /api/v1/shifts was
    // removed when shifts moved to auto-open. The seed is for the
    // MANAGER because the import path is date-scoped, not owner-scoped.
    await seedShiftForUser(MANAGER, { businessDate: POSITIVE_DATE, openingCash: '0.00' });

    const agent = await loginAs(OWNER);
    const res = await agent
      .post('/api/v1/sales-summaries/import')
      .attach('file', Buffer.from(DETAILED_CSV), 'daily.csv');

    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(1);
    expect(res.body.updated).toBe(0);

    const s = res.body.summaries[0];
    expect(typeof s.totalSales).toBe('string');
    expect(s.businessDate).toBe(POSITIVE_DATE);
    expect(s.cashSales).toBe('1250000.00');
    expect(s.mobileSales).toBe('890000.00');
    expect(s.otherSales).toBe('410000.00');
    expect(s.totalSales).toBe('2550000.00');
    expect(s.lines).toHaveLength(3);
  });

  it('re-import of the same source reference replaces, does not duplicate', async () => {
    const agent = await loginAs(OWNER);

    const UPDATED = DETAILED_CSV.replace('1250000.00', '1400000.00');
    const res = await agent
      .post('/api/v1/sales-summaries/import')
      .attach('file', Buffer.from(UPDATED), 'daily.csv');

    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(0);
    expect(res.body.updated).toBe(1);

    const s = res.body.summaries[0];
    expect(s.cashSales).toBe('1400000.00');
    expect(s.totalSales).toBe('2700000.00');

    const count = await prisma.salesSummary.count({
      where: { sourceReference: REF_DETAILED },
    });
    expect(count).toBe(1);
  });

  it('OWNER imports an aggregate CSV and it normalizes', async () => {
    const agent = await loginAs(OWNER);
    const res = await agent
      .post('/api/v1/sales-summaries/import')
      .attach('file', Buffer.from(AGGREGATE_CSV), 'terminal2.csv');

    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(1);

    const s = res.body.summaries[0];
    expect(s.businessDate).toBe(POSITIVE_DATE);
    expect(s.cashSales).toBe('900000.00');
    expect(s.mobileSales).toBe('450000.00');
    expect(s.otherSales).toBe('150000.00');
    expect(s.totalSales).toBe('1500000.00');
    expect(s.lines.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects bad CSV header (400)', async () => {
    const agent = await loginAs(OWNER);
    const BAD = `nope,nothing\n1,2\n`;
    const res = await agent
      .post('/api/v1/sales-summaries/import')
      .attach('file', Buffer.from(BAD), 'bad.csv');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_HEADER');
  });

  it('WAITER cannot read sales summaries (403)', async () => {
    const agent = await loginAs(WAITER);
    const res = await agent.get('/api/v1/sales-summaries');
    expect(res.status).toBe(403);
  });

  it('WAITER cannot import (403)', async () => {
    const agent = await loginAs(WAITER);
    const res = await agent
      .post('/api/v1/sales-summaries/import')
      .attach('file', Buffer.from(DETAILED_CSV), 'daily.csv');
    expect(res.status).toBe(403);
  });

  it('AUDITOR can list but not import', async () => {
    const agent = await loginAs(AUDITOR);
    const list = await agent.get('/api/v1/sales-summaries');
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.summaries)).toBe(true);

    const imp = await agent
      .post('/api/v1/sales-summaries/import')
      .attach('file', Buffer.from(DETAILED_CSV), 'daily.csv');
    expect(imp.status).toBe(403);
  });
});

describe('Sales Summary — manual entry', () => {
  it('MANAGER creates a manual summary', async () => {
    const agent = await loginAs(MANAGER);
    const res = await agent.post('/api/v1/sales-summaries').send({
      businessDate: POSITIVE_DATE,
      sourceReference: 'manual-1',
      lines: [
        { paymentMethod: 'CASH', amount: '100000.00' },
        { paymentMethod: 'MPESA', amount: '50000.00' },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.summary.totalSales).toBe('150000.00');
    expect(res.body.summary.cashSales).toBe('100000.00');
    expect(res.body.summary.mobileSales).toBe('50000.00');
  });

  it('rejects a bad amount (400)', async () => {
    const agent = await loginAs(MANAGER);
    const res = await agent.post('/api/v1/sales-summaries').send({
      businessDate: POSITIVE_DATE,
      lines: [{ paymentMethod: 'CASH', amount: '100.999' }],
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});