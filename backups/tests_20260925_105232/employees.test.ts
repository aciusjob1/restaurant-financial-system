import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

const app = createApp();

const OWNER = { username: 'phase3-owner', password: 'OwnerPassword!234', fullName: 'Phase 3 Owner', role: 'OWNER' as const };
const MANAGER = { username: 'phase3-manager', password: 'ManagerPassword!234', fullName: 'Phase 3 Manager', role: 'MANAGER' as const };
const WAITER = { username: 'phase3-waiter', password: 'WaiterPassword!234', fullName: 'Phase 3 Waiter', role: 'WAITER' as const };
const AUDITOR = { username: 'phase3-auditor', password: 'AuditorPassword!234', fullName: 'Phase 3 Auditor', role: 'AUDITOR' as const };

const POSITION_NAME = 'Phase3 Test Chef';

async function cleanup() {
  const usernames = [OWNER.username, MANAGER.username, WAITER.username, AUDITOR.username];
  const employees = await prisma.employee.findMany({
    where: { position: { name: POSITION_NAME } },
    select: { id: true },
  });
  if (employees.length > 0) {
    await prisma.employee.deleteMany({ where: { id: { in: employees.map((e) => e.id) } } });
  }
  await prisma.position.deleteMany({ where: { name: POSITION_NAME } });
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
  await makeUser(OWNER);
  await makeUser(MANAGER);
  await makeUser(WAITER);
  await makeUser(AUDITOR);
});

afterAll(cleanup);

async function loginAs(u: { username: string; password: string }) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ username: u.username, password: u.password });
  expect(res.status).toBe(200);
  return agent;
}

// ---------------------------------------------------------------------------

describe('Positions', () => {
  it('OWNER creates a position with Decimal salary and it round-trips as a string', async () => {
    const agent = await loginAs(OWNER);
    const res = await agent.post('/api/v1/positions').send({
      name: POSITION_NAME,
      description: 'Test position for Phase 3',
      defaultSalary: '350000.00',
    });
    expect(res.status).toBe(201);
    expect(res.body.position.defaultSalary).toBe('350000.00');
    // Critical: it must be a string, not a number.
    expect(typeof res.body.position.defaultSalary).toBe('string');
  });

  it('rejects a duplicate position name with 409', async () => {
    const agent = await loginAs(OWNER);
    const res = await agent.post('/api/v1/positions').send({
      name: POSITION_NAME,
      defaultSalary: '400000.00',
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NAME_TAKEN');
  });

  it('rejects a non-decimal salary string via Zod', async () => {
    const agent = await loginAs(OWNER);
    const res = await agent.post('/api/v1/positions').send({
      name: 'Phase3 Bad Salary',
      defaultSalary: '350000.999',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('WAITER cannot read positions', async () => {
    const agent = await loginAs(WAITER);
    const res = await agent.get('/api/v1/positions');
    expect(res.status).toBe(403);
  });

  it('AUDITOR can read but not write positions', async () => {
    const agent = await loginAs(AUDITOR);
    const list = await agent.get('/api/v1/positions');
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.positions)).toBe(true);

    const create = await agent.post('/api/v1/positions').send({
      name: 'Phase3 Auditor Attempt',
      defaultSalary: '100.00',
    });
    expect(create.status).toBe(403);
  });

  it('MANAGER can create and update a position', async () => {
    const agent = await loginAs(MANAGER);
    const create = await agent.post('/api/v1/positions').send({
      name: 'Phase3 Manager Position',
      defaultSalary: '500000.00',
    });
    expect(create.status).toBe(201);
    const id = create.body.position.id;

    const update = await agent.patch(`/api/v1/positions/${id}`).send({
      defaultSalary: '550000.50',
    });
    expect(update.status).toBe(200);
    expect(update.body.position.defaultSalary).toBe('550000.50');

    // cleanup so we do not leak rows across runs
    await prisma.position.delete({ where: { id } });
  });
});

// ---------------------------------------------------------------------------

describe('Employees', () => {
  let positionId: string;

  beforeAll(async () => {
    const p = await prisma.position.findUnique({ where: { name: POSITION_NAME } });
    if (!p) throw new Error('Test position missing');
    positionId = p.id;
  });

  it('OWNER creates an employee and gets EMP-#### back', async () => {
    const agent = await loginAs(OWNER);
    const res = await agent.post('/api/v1/employees').send({
      fullName: 'Phase 3 Employee',
      phone: '+255700000000',
      positionId,
      startDate: '2026-09-24',
    });
    expect(res.status).toBe(201);
    expect(res.body.employee.employeeNumber).toMatch(/^EMP-\d{4,}$/);
    expect(res.body.employee.startDate).toBe('2026-09-24');
    expect(res.body.employee.employmentStatus).toBe('ACTIVE');
  });

  it('rejects a bad startDate format', async () => {
    const agent = await loginAs(OWNER);
    const res = await agent.post('/api/v1/employees').send({
      fullName: 'Phase 3 Bad Date',
      positionId,
      startDate: '24/09/2026',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a startDate pointing at a nonexistent position', async () => {
    const agent = await loginAs(OWNER);
    const res = await agent.post('/api/v1/employees').send({
      fullName: 'Phase 3 No Position',
      positionId: 'nonexistent-position-id',
      startDate: '2026-09-24',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_POSITION');
  });

  it('WAITER cannot list employees', async () => {
    const agent = await loginAs(WAITER);
    const res = await agent.get('/api/v1/employees');
    expect(res.status).toBe(403);
  });

  it('AUDITOR can list employees', async () => {
    const agent = await loginAs(AUDITOR);
    const res = await agent.get('/api/v1/employees');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.employees)).toBe(true);
  });

  it('deactivating an employee sets isActive=false and keeps the row', async () => {
    const list = await loginAs(OWNER);
    const all = await list.get('/api/v1/employees');
    const emp = all.body.employees.find(
      (e: { fullName: string }) => e.fullName === 'Phase 3 Employee'
    );
    expect(emp).toBeTruthy();

    const patch = await list.patch(`/api/v1/employees/${emp.id}`).send({ isActive: false });
    expect(patch.status).toBe(200);
    expect(patch.body.employee.isActive).toBe(false);

    // The row still exists and is still returned by list.
    const after = await list.get('/api/v1/employees');
    expect(after.body.employees.find((e: { id: string }) => e.id === emp.id)).toBeTruthy();
  });
});