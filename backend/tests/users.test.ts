import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

const app = createApp();

const OWNER = {
  username: 'phase2-owner',
  password: 'OwnerPassword!234',
  fullName: 'Phase 2 Owner',
  role: 'OWNER' as const,
};

const WAITER = {
  username: 'phase2-waiter',
  password: 'WaiterPassword!234',
  fullName: 'Phase 2 Waiter',
  role: 'WAITER' as const,
};

const CREATED_USERNAME = 'phase2-created';

async function cleanup() {
  const usernames = [OWNER.username, WAITER.username, CREATED_USERNAME];
  await prisma.session.deleteMany({ where: { user: { username: { in: usernames } } } });
  await prisma.user.deleteMany({ where: { username: { in: usernames } } });
}

async function seed() {
  await cleanup();
  const hash = (p: string) => argon2.hash(p, { type: argon2.argon2id });

  await prisma.user.create({
    data: {
      username: OWNER.username,
      fullName: OWNER.fullName,
      role: OWNER.role,
      passwordHash: await hash(OWNER.password),
      isActive: true,
    },
  });

  await prisma.user.create({
    data: {
      username: WAITER.username,
      fullName: WAITER.fullName,
      role: WAITER.role,
      passwordHash: await hash(WAITER.password),
      isActive: true,
    },
  });
}

beforeAll(seed);
afterAll(cleanup);

async function loginAs(u: { username: string; password: string }) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({
    username: u.username,
    password: u.password,
  });
  expect(res.status).toBe(200);
  return agent;
}

describe('GET /api/v1/users', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/users');
    expect(res.status).toBe(401);
  });

  it('rejects WAITER with 403', async () => {
    const agent = await loginAs(WAITER);
    const res = await agent.get('/api/v1/users');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('allows OWNER and returns a list without passwordHash', async () => {
    const agent = await loginAs(OWNER);
    const res = await agent.get('/api/v1/users');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users.length).toBeGreaterThanOrEqual(2);
    for (const u of res.body.users) {
      expect(u).not.toHaveProperty('passwordHash');
    }
  });
});

describe('POST /api/v1/users', () => {
  it('rejects WAITER with 403', async () => {
    const agent = await loginAs(WAITER);
    const res = await agent.post('/api/v1/users').send({
      username: CREATED_USERNAME,
      fullName: 'Should Not Exist',
      role: 'WAITER',
      password: 'SomePassword!234',
    });
    expect(res.status).toBe(403);
  });

  it('allows OWNER to create a user', async () => {
    const agent = await loginAs(OWNER);
    const res = await agent.post('/api/v1/users').send({
      username: CREATED_USERNAME,
      fullName: 'Created By Test',
      role: 'WAITER',
      password: 'SomePassword!234',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.username).toBe(CREATED_USERNAME);
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('rejects weak passwords via Zod', async () => {
    const agent = await loginAs(OWNER);
    const res = await agent.post('/api/v1/users').send({
      username: 'phase2-weak',
      fullName: 'Weak PW',
      role: 'WAITER',
      password: 'short',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a duplicate username with 409', async () => {
    const agent = await loginAs(OWNER);
    const res = await agent.post('/api/v1/users').send({
      username: CREATED_USERNAME,
      fullName: 'Duplicate',
      role: 'WAITER',
      password: 'SomePassword!234',
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('USERNAME_TAKEN');
  });
});

describe('PATCH /api/v1/users/:id', () => {
  it('OWNER cannot deactivate their own account', async () => {
    const agent = await loginAs(OWNER);
    const me = await agent.get('/api/v1/auth/me');
    const res = await agent
      .patch(`/api/v1/users/${me.body.user.id}`)
      .send({ isActive: false });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SELF_DEACTIVATE');
  });

  it('OWNER cannot demote themselves', async () => {
    const agent = await loginAs(OWNER);
    const me = await agent.get('/api/v1/auth/me');
    const res = await agent
      .patch(`/api/v1/users/${me.body.user.id}`)
      .send({ role: 'AUDITOR' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SELF_DEMOTE');
  });

  it('deactivating a user invalidates their active sessions', async () => {
    const waiterAgent = await loginAs(WAITER);
    const before = await waiterAgent.get('/api/v1/auth/me');
    expect(before.status).toBe(200);

    const ownerAgent = await loginAs(OWNER);
    const list = await ownerAgent.get('/api/v1/users');
    const waiterRow = list.body.users.find((u: any) => u.username === WAITER.username);
    expect(waiterRow).toBeTruthy();

    const patch = await ownerAgent
      .patch(`/api/v1/users/${waiterRow.id}`)
      .send({ isActive: false });
    expect(patch.status).toBe(200);
    expect(patch.body.user.isActive).toBe(false);

    const after = await waiterAgent.get('/api/v1/auth/me');
    expect(after.status).toBe(401);
  });
});

describe('MANAGER access to users', () => {
  const MANAGER = {
    username: 'phase19f-manager',
    password: 'ManagerPassword!234',
    fullName: 'Phase 19f Manager',
    role: 'MANAGER' as const,
  };
  const MANAGER2 = {
    username: 'phase19f-manager2',
    password: 'ManagerPassword!234',
    fullName: 'Phase 19f Manager 2',
    role: 'MANAGER' as const,
  };
  const WAITER2 = {
    username: 'phase19f-waiter2',
    password: 'WaiterPassword!234',
    fullName: 'Phase 19f Waiter 2',
    role: 'WAITER' as const,
  };
  const NEW_PASSWORD = 'RotatedPassword!99';

  let manager2Id: string;
  let waiter2Id: string;

  const names = [MANAGER.username, MANAGER2.username, WAITER2.username];

  beforeAll(async () => {
    // idempotent cleanup of any prior run
    await prisma.session.deleteMany({ where: { user: { username: { in: names } } } });
    await prisma.user.deleteMany({ where: { username: { in: names } } });

    const hash = (p: string) => argon2.hash(p, { type: argon2.argon2id });

    await prisma.user.create({
      data: {
        username: MANAGER.username,
        fullName: MANAGER.fullName,
        role: MANAGER.role,
        passwordHash: await hash(MANAGER.password),
        isActive: true,
      },
    });
    const m2 = await prisma.user.create({
      data: {
        username: MANAGER2.username,
        fullName: MANAGER2.fullName,
        role: MANAGER2.role,
        passwordHash: await hash(MANAGER2.password),
        isActive: true,
      },
    });
    manager2Id = m2.id;
    const w2 = await prisma.user.create({
      data: {
        username: WAITER2.username,
        fullName: WAITER2.fullName,
        role: WAITER2.role,
        passwordHash: await hash(WAITER2.password),
        isActive: true,
      },
    });
    waiter2Id = w2.id;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { username: { in: names } } } });
    await prisma.user.deleteMany({ where: { username: { in: names } } });
  });

  it('MANAGER can list users (200)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get('/api/v1/users');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  it('MANAGER can read a single user (200)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.get('/api/v1/users/' + waiter2Id);
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe(WAITER2.username);
  });

  it('MANAGER cannot create a user (403)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/users').send({
      username: 'phase19f-mgr-created',
      fullName: 'x',
      role: 'WAITER',
      password: 'PasswordLength!12',
    });
    expect(res.status).toBe(403);
  });

  it('MANAGER can edit a waiter profile (fullName) (200)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.patch('/api/v1/users/' + waiter2Id).send({ fullName: 'Renamed Waiter 2' });
    expect(res.status).toBe(200);
    expect(res.body.user.fullName).toBe('Renamed Waiter 2');
  });

  it('MANAGER cannot change role (403 MANAGER_CANNOT_CHANGE_ROLE)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.patch('/api/v1/users/' + waiter2Id).send({ role: 'AUDITOR' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MANAGER_CANNOT_CHANGE_ROLE');
  });

  it('MANAGER cannot change isActive (403 MANAGER_CANNOT_CHANGE_STATUS)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.patch('/api/v1/users/' + waiter2Id).send({ isActive: false });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MANAGER_CANNOT_CHANGE_STATUS');
  });

  it('MANAGER cannot edit another MANAGER (403 MANAGER_CAN_ONLY_EDIT_WAITERS)', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.patch('/api/v1/users/' + manager2Id).send({ fullName: 'Nope' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MANAGER_CAN_ONLY_EDIT_WAITERS');
  });

  it('MANAGER cannot reset an OWNER password (403)', async () => {
    const m = await loginAs(MANAGER);
    const ownerRow = await prisma.user.findUnique({ where: { username: OWNER.username } });
    const res = await m.post('/api/v1/users/' + ownerRow!.id + '/reset-password').send({
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(403);
  });

  it('MANAGER can reset a waiter password; waiter signs in with the new one', async () => {
    const m = await loginAs(MANAGER);
    const res = await m.post('/api/v1/users/' + waiter2Id + '/reset-password').send({
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(200);

    const oldLogin = await request(app).post('/api/v1/auth/login').send({
      username: WAITER2.username,
      password: WAITER2.password,
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post('/api/v1/auth/login').send({
      username: WAITER2.username,
      password: NEW_PASSWORD,
    });
    expect(newLogin.status).toBe(200);
  });
});
