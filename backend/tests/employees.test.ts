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
  const usernames = [OWNER.username, MANAGER.username, WAITER.username, AUDITOR.username, 'phase19j2-hire', 'phase19j2-dup', 'phase19j2-deact'];
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

  it('OWNER creates an employee with a login atomically', async () => {
    const agent = await loginAs(OWNER);
    const res = await agent.post('/api/v1/employees').send({
      fullName: 'Phase 19j2 Hire',
      phone: '+255711000001',
      positionId,
      startDate: '2026-09-28',
      login: {
        username: 'phase19j2-hire',
        password: 'HirePassword!234',
        role: 'WAITER',
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.employee.userId).toBeTruthy();

    const linked = await prisma.user.findUnique({
      where: { username: 'phase19j2-hire' },
      select: { id: true, role: true, isActive: true, fullName: true },
    });
    expect(linked).toBeTruthy();
    expect(linked!.role).toBe('WAITER');
    expect(linked!.isActive).toBe(true);
    expect(linked!.fullName).toBe('Phase 19j2 Hire');
    expect(linked!.id).toBe(res.body.employee.userId);
  });

  it('rejects a duplicate login username with 409 and rolls the whole thing back', async () => {
    const agent = await loginAs(OWNER);
    const before = await prisma.employee.count({
      where: { fullName: 'Phase 19j2 Duplicate' },
    });
    expect(before).toBe(0);

    const first = await agent.post('/api/v1/employees').send({
      fullName: 'Phase 19j2 Duplicate',
      positionId,
      startDate: '2026-09-28',
      login: {
        username: 'phase19j2-dup',
        password: 'DupPassword!2345',
        role: 'WAITER',
      },
    });
    expect(first.status).toBe(201);

    const second = await agent.post('/api/v1/employees').send({
      fullName: 'Phase 19j2 Duplicate Second',
      positionId,
      startDate: '2026-09-28',
      login: {
        username: 'phase19j2-dup',
        password: 'DupPassword!2345',
        role: 'WAITER',
      },
    });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('USERNAME_TAKEN');

    const after = await prisma.employee.count({
      where: { fullName: 'Phase 19j2 Duplicate Second' },
    });
    expect(after).toBe(0);
  });

  it('MANAGER cannot create a login account (403 LOGIN_REQUIRES_OWNER)', async () => {
    const agent = await loginAs(MANAGER);
    const res = await agent.post('/api/v1/employees').send({
      fullName: 'Phase 19j2 Mgr Attempt',
      positionId,
      startDate: '2026-09-28',
      login: {
        username: 'phase19j2-mgr-attempt',
        password: 'ManagerPassword!234',
        role: 'WAITER',
      },
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('LOGIN_REQUIRES_OWNER');

    const ghost = await prisma.employee.count({
      where: { fullName: 'Phase 19j2 Mgr Attempt' },
    });
    expect(ghost).toBe(0);
  });

  it('atomic deactivate flips both records and revokes the linked user sessions', async () => {
    const ownerAgent = await loginAs(OWNER);
    const create = await ownerAgent.post('/api/v1/employees').send({
      fullName: 'Phase 19j2 Deact',
      positionId,
      startDate: '2026-09-28',
      login: {
        username: 'phase19j2-deact',
        password: 'DeactPassword!234',
        role: 'WAITER',
      },
    });
    expect(create.status).toBe(201);
    const employeeId = create.body.employee.id;
    const userId = create.body.employee.userId;
    expect(userId).toBeTruthy();

    const targetAgent = request.agent(app);
    const targetLogin = await targetAgent.post('/api/v1/auth/login').send({
      username: 'phase19j2-deact',
      password: 'DeactPassword!234',
    });
    expect(targetLogin.status).toBe(200);
    expect((await targetAgent.get('/api/v1/auth/me')).status).toBe(200);

    const res = await ownerAgent.post('/api/v1/employees/' + employeeId + '/deactivate');
    expect(res.status).toBe(200);
    expect(res.body.employee.isActive).toBe(false);

    const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
    expect(emp!.isActive).toBe(false);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user!.isActive).toBe(false);

    const after = await targetAgent.get('/api/v1/auth/me');
    expect(after.status).toBe(401);
  });

  it('deactivate works for an employee without a login', async () => {
    const agent = await loginAs(OWNER);
    const create = await agent.post('/api/v1/employees').send({
      fullName: 'Phase 19j2 No Login',
      positionId,
      startDate: '2026-09-28',
    });
    expect(create.status).toBe(201);
    expect(create.body.employee.userId).toBeNull();

    const res = await agent.post('/api/v1/employees/' + create.body.employee.id + '/deactivate');
    expect(res.status).toBe(200);
    expect(res.body.employee.isActive).toBe(false);
  });
});