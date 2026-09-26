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